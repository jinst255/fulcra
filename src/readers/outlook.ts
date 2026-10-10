// Reads job alert emails in Outlook on the web (outlook.live.com or outlook.office.com) and
// restores unread state. [Unverified] Outlook selectors are untested; every one lives here.
// Two guards keep it from reading other mail if a selector is wrong: the search must visibly
// change the message list, and a message is read only when it shows an alert sender's address.
// A search with no matches shows "No results found" and then loosely related mail, so other
// mail in the results is skipped, not taken as a layout change.
import type { AlertCard, MailRunResult, SignInResult } from '../email/types';
import { parseAlert } from './alerts';
import type { GmailRun } from './gmail';

export const OUTLOOK_SELECTORS_VERSION = 'outlook-2026-10-10d';

const SEL = {
  ready: [
    'div[aria-label="Message list"]',
    '[data-app-section="MessageList"]',
    '#MainModule',
    'div[role="main"]',
  ],
  search: [
    'input#topSearchInput',
    'div[role="search"] input',
    'input[type="search"]',
    'input[aria-label^="Search" i]',
    'input[placeholder^="Search" i]',
  ],
  // Narrow windows fold the search box into a button.
  searchOpen: ['button[aria-label="Search" i]', 'button[aria-label^="Open search" i]', 'div[role="search"]'],
  list: ['div[aria-label="Message list"]', '[data-app-section="MessageList"]'],
  body: [
    'div[aria-label="Message body" i]',
    '[id^="UniqueMessageBody"]',
    '[data-app-section="ConversationContainer"] div[role="document"]',
    'div[role="document"]',
  ],
  readingPane: [
    'div[aria-label="Reading Pane" i]',
    '[data-app-section="ConversationContainer"]',
    '#ReadingPaneContainerId',
    'div[role="main"]',
  ],
  markUnread: [
    'button[aria-label^="Mark as unread" i]',
    'button[title^="Mark as unread" i]',
    '[role="menuitem"][aria-label^="Mark as unread" i]',
    '[role="menuitem"][title^="Mark as unread" i]',
  ],
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(fn: () => T | null | undefined | false, timeout = 15000): Promise<T | null> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(250);
  }
  return null;
}

function q(selectors: string[]): HTMLElement | null {
  for (const s of selectors) {
    const el = document.querySelector<HTMLElement>(s);
    if (el) return el;
  }
  return null;
}

/** Message rows: options in the message list, never the search suggestions or a menu. */
function rows(): HTMLElement[] {
  const list = q(SEL.list);
  const found = list
    ? Array.from(list.querySelectorAll<HTMLElement>('[role="option"], [data-convid]'))
    : Array.from(
        document.querySelectorAll<HTMLElement>('[data-convid], div[role="listbox"] [role="option"]'),
      ).filter((r) => !r.closest('[role="search"], [role="dialog"], [role="menu"]'));
  // A row can hold another match; keep the outer one.
  return found.filter((r) => !found.some((o) => o !== r && o.contains(r)));
}
const isUnread = (r: Element) =>
  /^unread\b/i.test(r.getAttribute('aria-label') ?? '') || r.querySelector('[aria-label^="Unread"]') != null;
const idOf = (r: Element) =>
  r.getAttribute('data-convid') ?? r.getAttribute('data-itemid') ?? r.getAttribute('id');
/** The sender's address when the row shows one; Outlook puts it in the sender name's title. */
export function rowAddress(r: Element): string | null {
  const m = r
    .querySelector('[title*="@"]')
    ?.getAttribute('title')
    ?.match(/[^\s<>"]+@[^\s<>"]+/);
  return m ? m[0].toLowerCase() : null;
}
/**
 * Outlook's "No results found for …" note, which comes before its loosely related results. With
 * `query`, only a note that names it.
 */
export function noResultsShown(doc: ParentNode = document, query?: string): boolean {
  const root = doc.querySelector(SEL.list.join(', ')) ?? doc;
  return Array.from(root.querySelectorAll('div, span, h2, h3, p')).some((el) => {
    const text = (el.textContent ?? '').trim();
    return (
      el.children.length === 0 &&
      !el.closest('[role="option"], [data-convid]') &&
      /^no results\b/i.test(text) &&
      (!query || text.toLowerCase().includes(query.toLowerCase()))
    );
  });
}
const rowKey = () =>
  rows()
    .slice(0, 10)
    .map((r) => idOf(r) ?? '')
    .join('|');

/**
 * What the page looks like, as counts only (never text), for the log when a step fails, so the
 * next layout change can be fixed from Copy diagnostics.
 */
export function layoutHint(doc: ParentNode = document): string {
  const has = (sel: string[]) => (sel.some((s) => doc.querySelector(s)) ? 1 : 0);
  const n = (s: string) => doc.querySelectorAll(s).length;
  return [
    `host=${typeof location === 'undefined' ? '' : (location.hostname.split('.')[1] ?? '')}`,
    `ready=${has(SEL.ready)}`,
    `box=${has(SEL.search)}`,
    `list=${has(SEL.list)}`,
    `opt=${n('[role="option"]')}`,
    `conv=${n('[data-convid]')}`,
    `item=${n('[data-itemid]')}`,
    `body=${has(SEL.body)}`,
    `pane=${has(SEL.readingPane.slice(0, 3))}`,
    `unread=${has(SEL.markUnread)}`,
  ].join(' ');
}

function onOutlook(): boolean {
  return isOutlookHost(location.hostname);
}

/** Personal mail is on outlook.live.com; work and school mail on outlook.office.com or outlook.cloud.microsoft. */
export function isOutlookHost(host: string): boolean {
  return /^outlook\.(live\.com|office\.com|cloud\.microsoft)$/.test(host);
}

/** Sets an input's value so React-controlled inputs notice, then submits with Enter. */
function typeInto(box: HTMLInputElement, text: string): void {
  box.focus();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(box, text);
  else box.value = text;
  box.dispatchEvent(new Event('input', { bubbles: true }));
  box.dispatchEvent(new Event('change', { bubbles: true }));
  for (const type of ['keydown', 'keypress', 'keyup'])
    box.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
}

/** The search box, opening it first when a narrow window has folded it into a button. */
async function searchBox(): Promise<HTMLInputElement | null> {
  const box = await waitFor(() => q(SEL.search), 10000);
  if (box) return box as HTMLInputElement;
  q(SEL.searchOpen)?.click();
  return (await waitFor(() => q(SEL.search), 5000)) as HTMLInputElement | null;
}

/** Runs the search. False when there's no search box or the list didn't change. */
async function runSearch(query: string): Promise<'ok' | 'noBox' | 'noChange'> {
  const box = await searchBox();
  if (!box) return 'noBox';
  const before = rowKey();
  // Two searches with no matches in a row can show the same loose results; the note names the query.
  const moved = () =>
    rowKey() !== before || (before !== '' && rows().length === 0) || noResultsShown(document, query);
  typeInto(box, query);
  let changed = await waitFor(moved, 8000);
  if (!changed) {
    // Enter didn't take: submit the search form instead.
    box.form?.requestSubmit();
    changed = await waitFor(moved, 6000);
  }
  await sleep(1500);
  // An inbox whose first rows are already exactly the alerts is possible but rare; treat as no change.
  return changed ? 'ok' : 'noChange';
}

/** True when the opened message shows one of the alert senders' addresses. */
export function fromAlertSender(root: ParentNode, senders: string[]): boolean {
  const want = senders.map((s) => s.toLowerCase());
  const els = Array.from(root.querySelectorAll('[title*="@"], [aria-label*="@"], span, a[href^="mailto:"]'));
  for (const el of els.slice(0, 400)) {
    const hay = [
      el.getAttribute('title'),
      el.getAttribute('aria-label'),
      el.getAttribute('href'),
      el.children.length === 0 ? el.textContent : null,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (want.some((w) => hay.includes(w))) return true;
  }
  return false;
}

export async function outlookSignInCheck(): Promise<SignInResult> {
  if (!onOutlook()) return { status: 'signedOut', provider: 'outlook', emailCounts: null };
  const ready = await waitFor(() => q(SEL.ready), 20000);
  const box = ready ? await searchBox() : null;
  return ready && box
    ? { status: 'ok', provider: 'outlook', emailCounts: null }
    : { status: 'changed', provider: 'outlook', emailCounts: null, detail: layoutHint() };
}

export async function outlookReadAlerts(args: {
  query: string;
  senders: string[];
  seen: string[];
  max: number;
}): Promise<GmailRun> {
  const fail = (status: MailRunResult['status'], detail: string): GmailRun => ({
    status,
    cards: [],
    emailsRead: 0,
    threadIds: [],
    detail,
    more: false,
  });
  if (!onOutlook()) return fail('signedOut', 'host');
  const cards: AlertCard[] = [];
  const ids: string[] = [];
  // Keep what was read before a failure.
  const changed = (step: string): GmailRun => ({
    ...fail('changed', `${step}; ${layoutHint()}`),
    cards,
    emailsRead: ids.length,
    threadIds: ids,
  });
  if (!(await waitFor(() => q(SEL.ready), 20000))) return changed('not ready');
  const senders = args.senders.map((s) => s.toLowerCase());
  const seen = new Set(args.seen);
  const notes: string[] = [];
  let restored = 0;
  let noBody = 0;
  const markUnread = async () => {
    const btn = q(SEL.markUnread);
    if (!btn) return;
    btn.click();
    restored++;
    await sleep(400);
  };
  // One search per sender: simple `from:` searches are the ones Outlook handles reliably.
  const queries = args.query.split('\n').filter(Boolean);
  for (const [n, query] of queries.entries()) {
    if (ids.length >= args.max) break;
    const searched = await runSearch(query);
    if (searched === 'noBox') return changed(`no search box (search ${n + 1})`);
    if (searched === 'noChange') return changed(`search ${n + 1} did not change the list`);
    await waitFor(() => rows().length > 0 || noResultsShown(), 8000);
    if (noResultsShown()) {
      notes.push(`s${n + 1}:none`);
      continue;
    }
    // "Top results" repeats rows from the full list.
    const targets = [
      ...new Map(
        rows()
          .filter((r) => {
            const id = idOf(r);
            const addr = rowAddress(r);
            // A row that names someone else is a loose match: skip it without opening it.
            return id && !seen.has(id) && !ids.includes(id) && (!addr || senders.includes(addr));
          })
          .map((r) => [idOf(r)!, { id: idOf(r)!, unread: isUnread(r) }]),
      ).values(),
    ].slice(0, args.max - ids.length);
    let read = 0;
    let other = 0;
    for (const t of targets) {
      // Two messages from someone else: these are loose matches, so stop opening them.
      if (other >= 2) break;
      const row = rows().find((r) => idOf(r) === t.id);
      if (!row) continue;
      row.click();
      const body = await waitFor(() => q(SEL.body), 10000);
      if (!body) {
        noBody++;
        continue;
      }
      await sleep(500);
      const pane = q(SEL.readingPane) ?? document;
      if (!fromAlertSender(pane, senders)) {
        // Not provably an alert: don't read it, and put it back.
        other++;
        if (t.unread) await markUnread();
        continue;
      }
      cards.push(...parseAlert(body.cloneNode(true) as Element));
      ids.push(t.id);
      read++;
      if (t.unread) await markUnread();
    }
    notes.push(`s${n + 1}:rows=${targets.length} read=${read}${other ? ` other=${other}` : ''}`);
  }
  // Opened messages but never found a body: the reading pane moved, not an empty search.
  if (noBody && !ids.length) return changed(`no message body in ${noBody}`);
  return {
    status: 'ok',
    cards,
    emailsRead: ids.length,
    threadIds: ids,
    detail: `${notes.join(' ')} cards=${cards.length} restored=${restored}`,
    more: false,
  };
}
