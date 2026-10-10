// Reads job alert emails inside the background Gmail window and restores unread state.
// Blueprint section 12.3. Selectors checked against live Gmail on 2026-10-10 (print view's effect
// on read state is still unknown). Every Gmail selector lives here; when Gmail changes, update
// them and bump the version.
import type { AlertCard, MailRunResult, RangeCount, SignInResult } from '../email/types';
import { parseAlert } from './alerts';

export const GMAIL_SELECTORS_VERSION = 'gmail-2026-10-10b';

const SEL = {
  main: 'div[role="main"]',
  row: 'div[role="main"] tr.zA',
  unreadRowClass: 'zE',
  threadIdAttrs: ['data-legacy-thread-id', 'data-thread-id'],
  noResults: 'div[role="main"] td.TC',
  count: ['div[role="main"] .Dj', 'span.Dj', '.ar5 .Dj'],
  checkbox: 'div[role="checkbox"]',
  markUnread: ['div[aria-label="Mark as unread"]', 'div[data-tooltip="Mark as unread"]'],
  openedBody: 'div.a3s',
  // Only a title attribute, with a capital R.
  back: [
    'div[role="button"][title="Back to Search Results" i]',
    'div.T-I.lS',
    'div[aria-label="Back to Search results" i]',
  ],
};

export interface GmailArgs {
  mode: 'signin' | 'run';
  account: number;
  /** For run: the search to read. */
  query?: string;
  /** For signin: searches to count, by import range. */
  countQueries?: Record<'7' | '30' | '90' | 'all', string>;
  /** Thread ids already read in earlier checks. */
  seen?: string[];
  max?: number;
  /** Alert sender addresses, for readers that must check each message. */
  senders?: string[];
}

export interface GmailRun extends MailRunResult {
  threadIds: string[];
  detail: string;
  /** The search found more conversations than one page shows; search a narrower range. */
  more: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(
  fn: () => T | null | undefined | false,
  timeout = 15000,
  step = 250,
): Promise<T | null> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(step);
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

function rows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(SEL.row));
}

/** Gmail's hex thread id, from a row. */
export function threadIdOf(row: Element): string | null {
  for (const attr of SEL.threadIdAttrs) {
    const el = row.querySelector(`[${attr}]`);
    const v = el?.getAttribute(attr);
    if (!v) continue;
    if (attr === 'data-legacy-thread-id') return v;
    const dec = /(\d{10,})/.exec(v)?.[1];
    if (dec) return BigInt(dec).toString(16);
  }
  return null;
}

/** Runs a Gmail search in this tab and waits for the results to settle. */
async function search(query: string): Promise<'rows' | 'none' | null> {
  location.hash = `#search/${encodeURIComponent(query)}`;
  await sleep(800);
  const got = await waitFor(
    () => (rows().length ? 'rows' : document.querySelector(SEL.noResults) ? 'none' : null),
    15000,
  );
  await sleep(1200);
  return got as 'rows' | 'none' | null;
}

/** "1–50 of 130" gives 130. "1–50 of many" has no total, so the rows on the page are a floor. */
export function countFrom(text: string, rowsOnPage: number): RangeCount {
  const m = /of\s+(?:about\s+)?([\d,]+)/i.exec(text);
  if (m) return { n: Number(m[1]!.replace(/,/g, '')), atLeast: /about/i.test(text) };
  return { n: rowsOnPage, atLeast: /\bmany\b/i.test(text) };
}

function resultCount(): RangeCount {
  return countFrom(q(SEL.count)?.textContent ?? '', rows().length);
}

async function bodyViaPrint(account: number, threadId: string): Promise<Element | null> {
  try {
    const res = await fetch(`/mail/u/${account}/?ui=2&view=pt&search=all&th=${threadId}`, {
      credentials: 'include',
    });
    if (!res.ok) return null;
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    return doc.body && doc.body.querySelector('a[href]') ? doc.body : null;
  } catch {
    return null;
  }
}

async function bodyViaClick(row: HTMLElement): Promise<Element | null> {
  row.click();
  const body = await waitFor(() => document.querySelector(SEL.openedBody), 10000);
  const clone = body ? (body.cloneNode(true) as Element) : null;
  const back = q(SEL.back);
  if (back) back.click();
  else history.back();
  await waitFor(() => rows().length > 0, 10000);
  await sleep(600);
  return clone;
}

function press(el: HTMLElement): void {
  for (const type of ['mousedown', 'mouseup', 'click'])
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
}

/** Marks rows unread again if reading them marked them read. */
async function restoreUnread(wasUnread: Set<string>): Promise<number> {
  let restored = 0;
  const toFix = rows().filter((r) => {
    const id = threadIdOf(r);
    return id && wasUnread.has(id) && !r.classList.contains(SEL.unreadRowClass);
  });
  if (!toFix.length) return 0;
  for (const r of toFix) {
    const box = r.querySelector<HTMLElement>(SEL.checkbox);
    if (box) {
      press(box);
      restored++;
    }
  }
  await sleep(400);
  const btn = q(SEL.markUnread);
  if (btn) press(btn);
  await sleep(800);
  return btn ? restored : 0;
}

export async function signInCheck(args: GmailArgs): Promise<SignInResult> {
  if (location.hostname !== 'mail.google.com')
    return { status: 'signedOut', provider: 'gmail', emailCounts: null };
  const main = await waitFor(() => document.querySelector(SEL.main), 20000);
  if (!main) return { status: 'changed', provider: 'gmail', emailCounts: null };
  // The tab title reads "Inbox (3) - name@example.com - Gmail".
  const address = document.title.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0] ?? null;
  if (!args.countQueries) return { status: 'ok', provider: 'gmail', emailCounts: null, address };
  const none = { n: 0, atLeast: false };
  const counts = { '7': none, '30': none, '90': none, all: none };
  for (const k of ['7', '30', '90', 'all'] as const) {
    const r = await search(args.countQueries[k]);
    if (r === null) return { status: 'ok', provider: 'gmail', emailCounts: null, address };
    counts[k] = r === 'none' ? none : resultCount();
  }
  return { status: 'ok', provider: 'gmail', emailCounts: counts, address };
}

export async function readAlerts(args: GmailArgs): Promise<GmailRun> {
  const fail = (status: GmailRun['status'], detail: string): GmailRun => ({
    status,
    cards: [],
    emailsRead: 0,
    threadIds: [],
    detail,
    more: false,
  });
  if (location.hostname !== 'mail.google.com') return fail('signedOut', 'host');
  if (!(await waitFor(() => document.querySelector(SEL.main), 20000))) return fail('changed', 'no main');
  const r = await search(args.query ?? '');
  if (r === null) return fail('changed', 'no results view');
  if (r === 'none')
    return { status: 'ok', cards: [], emailsRead: 0, threadIds: [], detail: 'no results', more: false };
  const count = resultCount();
  const onPage = rows().length;
  const more = count.atLeast || count.n > onPage;
  const seen = new Set(args.seen ?? []);
  const max = args.max ?? 50;
  const targets = rows()
    .map((row) => ({ row, id: threadIdOf(row), unread: row.classList.contains(SEL.unreadRowClass) }))
    .filter((x) => !x.id || !seen.has(x.id))
    .slice(0, max);
  const wasUnread = new Set(targets.filter((x) => x.unread && x.id).map((x) => x.id!));
  const cards: AlertCard[] = [];
  const ids: string[] = [];
  let viaPrint = 0;
  let viaClick = 0;
  for (const t of targets) {
    let body = t.id ? await bodyViaPrint(args.account, t.id) : null;
    if (body) viaPrint++;
    else {
      const row = t.id ? rows().find((x) => threadIdOf(x) === t.id) : t.row;
      if (!row) continue;
      body = await bodyViaClick(row);
      if (body) viaClick++;
    }
    if (!body) continue;
    cards.push(...parseAlert(body));
    if (t.id) ids.push(t.id);
  }
  // If the print view marked threads read, the list only shows it after a reload.
  if (viaPrint && wasUnread.size) {
    location.hash = '#inbox';
    await sleep(1000);
    await search(args.query ?? '');
  }
  const restored = await restoreUnread(wasUnread);
  return {
    status: 'ok',
    cards,
    emailsRead: viaPrint + viaClick,
    threadIds: ids,
    detail: `rows=${targets.length}/${onPage} print=${viaPrint} click=${viaClick} cards=${cards.length} unread=${wasUnread.size} restored=${restored}`,
    more,
  };
}

declare global {
  interface Window {
    __fulcraMail?: GmailArgs;
  }
}
