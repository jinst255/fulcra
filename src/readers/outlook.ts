// Reads job alert emails in Outlook on the web (outlook.live.com or outlook.office.com) and
// restores unread state. [Unverified] Outlook selectors are untested; every one lives here.
import type { AlertCard, MailRunResult, SignInResult } from '../email/types';
import { parseAlert } from './alerts';
import type { GmailRun } from './gmail';

export const OUTLOOK_SELECTORS_VERSION = 'outlook-2026-10-10';

const SEL = {
  ready: ['div[role="main"]', '#MainModule', 'div[aria-label="Message list"]'],
  search: ['input[aria-label="Search"]', '#topSearchInput', 'input[placeholder="Search"]'],
  row: 'div[role="option"][data-convid], div[role="listbox"] div[role="option"]',
  body: ['div[aria-label="Message body"]', 'div[role="document"]', '#UniqueMessageBody'],
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

function onOutlook(): boolean {
  return /^outlook\.(live|office)\.com$/.test(location.hostname);
}

async function runSearch(query: string): Promise<boolean> {
  const box = (await waitFor(() => q(SEL.search), 15000)) as HTMLInputElement | null;
  if (!box) return false;
  box.focus();
  box.value = query;
  box.dispatchEvent(new Event('input', { bubbles: true }));
  box.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }),
  );
  await sleep(2500);
  return true;
}

export async function outlookSignInCheck(): Promise<SignInResult> {
  if (!onOutlook()) return { status: 'signedOut', provider: 'outlook', emailCounts: null };
  const ready = await waitFor(() => q(SEL.ready), 20000);
  return { status: ready ? 'ok' : 'changed', provider: 'outlook', emailCounts: null };
}

export async function outlookReadAlerts(args: {
  query: string;
  seen: string[];
  max: number;
}): Promise<GmailRun> {
  const fail = (status: MailRunResult['status'], detail: string): GmailRun => ({
    status,
    cards: [],
    emailsRead: 0,
    threadIds: [],
    detail,
  });
  if (!onOutlook()) return fail('signedOut', 'host');
  if (!(await waitFor(() => q(SEL.ready), 20000))) return fail('changed', 'not ready');
  if (!(await runSearch(args.query))) return fail('changed', 'no search box');
  await waitFor(() => rows().length > 0, 8000);
  const seen = new Set(args.seen);
  const targets = rows()
    .map((r) => ({ id: idOf(r), unread: isUnread(r) }))
    .filter((x) => x.id && !seen.has(x.id))
    .slice(0, args.max);
  const cards: AlertCard[] = [];
  const ids: string[] = [];
  let restored = 0;
  for (const t of targets) {
    const row = rows().find((r) => idOf(r) === t.id);
    if (!row) continue;
    row.click();
    const body = await waitFor(() => q(SEL.body), 10000);
    if (!body) continue;
    await sleep(500);
    cards.push(...parseAlert(body.cloneNode(true) as Element));
    ids.push(t.id!);
    if (t.unread) {
      const btn = q(SEL.markUnread);
      if (btn) {
        btn.click();
        restored++;
        await sleep(400);
      }
    }
  }
  return {
    status: 'ok',
    cards,
    emailsRead: ids.length,
    threadIds: ids,
    detail: `rows=${targets.length} read=${ids.length} cards=${cards.length} restored=${restored}`,
  };
}
