// Reads job alert emails in Outlook on the web (outlook.live.com or outlook.office.com) and
// restores unread state. [Unverified] Outlook selectors are untested; every one lives here.
// Two guards keep it from reading other mail if a selector is wrong: the search must visibly
// change the message list, and each opened message must show an alert sender's address.
import type { AlertCard, MailRunResult, SignInResult } from '../email/types';
import { parseAlert } from './alerts';
import type { GmailRun } from './gmail';

export const OUTLOOK_SELECTORS_VERSION = 'outlook-2026-10-10b';

const SEL = {
  ready: ['div[aria-label="Message list"]', '#MainModule', 'div[role="main"]'],
  search: [
    'input#topSearchInput',
    'input[aria-label="Search"]',
    'input[aria-label^="Search"]',
    'input[placeholder="Search"]',
  ],
  row: 'div[role="option"][data-convid], div[role="listbox"] div[role="option"]',
  body: ['div[aria-label="Message body"]', 'div[role="document"]', '#UniqueMessageBody'],
  readingPane: ['div[aria-label="Reading Pane"]', '#ReadingPaneContainerId', 'div[role="main"]'],
  markUnread: [
    'button[aria-label="Mark as unread"]',
    'button[title="Mark as unread"]',
    'div[role="menuitem"][aria-label="Mark as unread"]',
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

const rows = () => Array.from(document.querySelectorAll<HTMLElement>(SEL.row));
const isUnread = (r: Element) =>
  /^unread\b/i.test(r.getAttribute('aria-label') ?? '') || r.querySelector('[aria-label^="Unread"]') != null;
const idOf = (r: Element) => r.getAttribute('data-convid') ?? r.getAttribute('id');
const rowKey = () =>
  rows()
    .slice(0, 10)
    .map((r) => idOf(r) ?? '')
    .join('|');

function onOutlook(): boolean {
  return /^outlook\.(live|office)\.com$/.test(location.hostname);
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

/** Runs the search. False when there's no search box or the list didn't change. */
async function runSearch(query: string): Promise<'ok' | 'noBox' | 'noChange'> {
  const box = (await waitFor(() => q(SEL.search), 15000)) as HTMLInputElement | null;
  if (!box) return 'noBox';
  const before = rowKey();
  typeInto(box, query);
  const changed = await waitFor(() => rowKey() !== before || (before !== '' && rows().length === 0), 10000);
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
  const box = ready ? await waitFor(() => q(SEL.search), 10000) : null;
  return { status: ready && box ? 'ok' : 'changed', provider: 'outlook', emailCounts: null };
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
  if (!(await waitFor(() => q(SEL.ready), 20000))) return fail('changed', 'not ready');
  const searched = await runSearch(args.query);
  if (searched === 'noBox') return fail('changed', 'no search box');
  if (searched === 'noChange') return fail('changed', 'search did not change the list');
  await waitFor(() => rows().length > 0, 8000);
  const seen = new Set(args.seen);
  const targets = rows()
    .map((r) => ({ id: idOf(r), unread: isUnread(r) }))
    .filter((x) => x.id && !seen.has(x.id))
    .slice(0, args.max);
  const cards: AlertCard[] = [];
  const ids: string[] = [];
  let restored = 0;
  const markUnread = async () => {
    const btn = q(SEL.markUnread);
    if (!btn) return;
    btn.click();
    restored++;
    await sleep(400);
  };
  for (const t of targets) {
    const row = rows().find((r) => idOf(r) === t.id);
    if (!row) continue;
    row.click();
    const body = await waitFor(() => q(SEL.body), 10000);
    if (!body) continue;
    await sleep(500);
    const pane = q(SEL.readingPane) ?? document;
    if (!fromAlertSender(pane, args.senders)) {
      // Not provably an alert: don't read it, put it back, and stop.
      if (t.unread) await markUnread();
      return { ...fail('changed', `sender check failed after ${ids.length}`), cards, threadIds: ids };
    }
    cards.push(...parseAlert(body.cloneNode(true) as Element));
    ids.push(t.id!);
    if (t.unread) await markUnread();
  }
  return {
    status: 'ok',
    cards,
    emailsRead: ids.length,
    threadIds: ids,
    detail: `rows=${targets.length} read=${ids.length} cards=${cards.length} restored=${restored}`,
    more: false,
  };
}
