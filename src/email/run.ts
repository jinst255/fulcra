// One email check: open each inbox in a tucked-away background tab, read new alerts, close it,
// and queue preliminary scores. Blueprint sections 4.3, 9.4, and 12.3.
import type { EmailAccount } from '../core/types';
import { accountId, getApiKey, getSettings, updateSettings, updateStatus } from '../store/settings';
import { t } from '../i18n/t';
import { addLog } from '../store/log';
import { findDuplicate, putJob, updateJob } from '../store/jobs';
import { newJobRecord } from '../pipeline/jobs';
import { queueUnscored } from '../pipeline/queue';
import type { GmailArgs, GmailRun } from '../readers/gmail';
import { isOutlookHost } from '../readers/outlook';
import type {
  AccountResult,
  AlertCard,
  CheckStatus,
  EmailCheckResult,
  Provider,
  SavedCounts,
  SignInResult,
} from './types';

const SEEN_KEY = 'emailSeen';
const SEEN_MAX = 5000;
const NOTIFY_KEY = 'emailNotify';
export const COUNTS_KEY = 'emailCounts';
const LOAD_TIMEOUT_MS = 30_000;
const CHUNK_TIMEOUT_MS = 4 * 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Most alert emails one check reads; an import reads more. */
const MAX_EMAILS = { check: 100, import: 400 };
/** Most searches one check runs, so a huge inbox can't keep the window open forever. */
const MAX_SEARCHES = 40;

/** Pages to try, in order. Personal Outlook accounts live on outlook.live.com, work ones on office.com. */
export function mailUrls(provider: Provider, account: number): string[] {
  return provider === 'gmail'
    ? [`https://mail.google.com/mail/u/${account}/#inbox`]
    : ['https://outlook.live.com/mail/0/', 'https://outlook.office.com/mail/'];
}

export function mailUrl(provider: Provider, account: number): string {
  return mailUrls(provider, account)[0]!;
}

/** A Gmail search for the alert senders between `olderDays` and `newerDays` days ago. */
export function buildQuery(
  provider: Provider,
  senders: string[],
  newerDays: number | null,
  olderDays = 0,
): string {
  if (provider === 'outlook') return senders.map((s) => `from:${s}`).join(' OR ');
  const from = senders.length ? `from:(${senders.join(' OR ')})` : '';
  return [
    from,
    olderDays > 0 ? `older_than:${olderDays}d` : '',
    newerDays != null ? `newer_than:${newerDays}d` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Days a scheduled check looks back: since the last check plus a day of overlap, 2 to 30. */
export function checkWindowDays(lastAt: number | null, now = Date.now()): number {
  if (!lastAt) return 2;
  return Math.max(2, Math.min(30, Math.ceil((now - lastAt) / DAY_MS) + 1));
}

/** A search range in days ago: newer than `newer` (null means no limit), older than `older`. */
export interface Win {
  older: number;
  newer: number | null;
}

/** Splits a range that had more results than one page, newer half first. Null when it can't split. */
export function splitWindow(w: Win): Win[] | null {
  if (w.newer == null) {
    const span = Math.max(30, w.older);
    return [
      { older: w.older, newer: w.older + span },
      { older: w.older + span, newer: null },
    ];
  }
  if (w.newer - w.older <= 1) return null;
  const mid = Math.floor((w.older + w.newer) / 2);
  return [
    { older: w.older, newer: mid },
    { older: mid, newer: w.newer },
  ];
}

function isMailHost(url: string | undefined, provider: Provider): boolean {
  if (!url) return false;
  try {
    const h = new URL(url).hostname;
    return provider === 'gmail' ? h === 'mail.google.com' : isOutlookHost(h);
  } catch {
    return false;
  }
}

function waitForComplete(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      chrome.tabs.onUpdated.removeListener(l);
      clearTimeout(timer);
      resolve();
    };
    const l = (id: number, info: { status?: string }) => id === tabId && info.status === 'complete' && done();
    const timer = setTimeout(done, LOAD_TIMEOUT_MS);
    chrome.tabs.onUpdated.addListener(l);
  });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

/**
 * A background tab tucked into a collapsed tab group named Fulcra, so it doesn't pop up or sit
 * among the person's tabs. With no browser window open, a minimized window instead.
 */
async function openBackground(url: string): Promise<{ tabId: number; close: () => Promise<void> }> {
  const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null);
  if (win?.id != null && win.state !== 'minimized' && !win.incognito) {
    const tab = await chrome.tabs.create({ windowId: win.id, url, active: false });
    const tabId = tab.id!;
    try {
      const groupId = await chrome.tabs.group({ tabIds: tabId, createProperties: { windowId: win.id } });
      await chrome.tabGroups.update(groupId, { title: t('email.tabGroup'), color: 'green', collapsed: true });
    } catch {
      // Tab groups aren't available: an inactive tab still works.
    }
    return { tabId, close: () => chrome.tabs.remove(tabId).catch(() => undefined) };
  }
  try {
    const w = await chrome.windows.create({ url, state: 'minimized', focused: false, type: 'normal' });
    const tabId = w?.tabs?.[0]?.id;
    if (w?.id != null && tabId != null)
      return { tabId, close: () => chrome.windows.remove(w.id!).catch(() => undefined) };
  } catch {
    // Fall through to an inactive tab.
  }
  const tab = await chrome.tabs.create({ url, active: false });
  return { tabId: tab.id!, close: () => chrome.tabs.remove(tab.id!).catch(() => undefined) };
}

async function inject<T>(tabId: number, provider: Provider, args: GmailArgs): Promise<T | null> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (a: GmailArgs) => {
      (window as unknown as { __fulcraMail: GmailArgs }).__fulcraMail = a;
    },
    args: [args],
  });
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    files: [provider === 'gmail' ? '/content-scripts/gmail.js' : '/content-scripts/outlook.js'],
  });
  return (res?.result as T | undefined) ?? null;
}

/** The person closed the mail tab while Fulcra was reading it. */
export class TabClosedError extends Error {}

/** Opens the mail page, trying each address in turn. Null when none of them stays on the mail site. */
async function withMailTab<T>(
  provider: Provider,
  account: number,
  fn: (tabId: number) => Promise<T>,
): Promise<T | null> {
  const urls = mailUrls(provider, account);
  const { tabId, close } = await openBackground(urls[0]!);
  let closed = false;
  const onRemoved = (id: number) => {
    if (id === tabId) closed = true;
  };
  chrome.tabs.onRemoved.addListener(onRemoved);
  try {
    for (let i = 0; i < urls.length; i++) {
      if (i > 0) await chrome.tabs.update(tabId, { url: urls[i] });
      await waitForComplete(tabId);
      await new Promise((r) => setTimeout(r, 1500));
      if (closed) throw new TabClosedError();
      const tab = await chrome.tabs.get(tabId);
      if (!isMailHost(tab.url, provider)) continue;
      const out = await fn(tabId);
      if (closed) throw new TabClosedError();
      return out;
    }
    return null;
  } catch (e) {
    // Someone closed the tab part way: say so, rather than "something went wrong".
    throw closed ? new TabClosedError() : e;
  } finally {
    chrome.tabs.onRemoved.removeListener(onRemoved);
    if (!closed) await close();
  }
}

/** One mail check at a time, including sign-in checks: each opens its own tab. */
let busy = false;

/** Saved import estimates, one per inbox. */
export async function savedCounts(): Promise<Record<string, SavedCounts>> {
  const v = (await chrome.storage.local.get(COUNTS_KEY))[COUNTS_KEY] as
    Record<string, SavedCounts> | SavedCounts | undefined;
  // Older builds saved one inbox's counts.
  if (!v || 'counts' in v) return {};
  return v;
}

/**
 * Checks the user is signed in to an inbox and reads its address. For Gmail it also counts alert
 * emails per import range.
 */
export async function signInCheck(provider: Provider, index = 0): Promise<SignInResult> {
  if (busy) return { status: 'busy', provider, emailCounts: null };
  busy = true;
  const s = await getSettings();
  try {
    const senders = s.email.senders;
    const r =
      (await withMailTab<SignInResult>(provider, index, async (tabId) => {
        const got = await withTimeout(
          inject<SignInResult>(tabId, provider, {
            mode: 'signin',
            account: index,
            countQueries:
              provider === 'gmail'
                ? {
                    '7': buildQuery('gmail', senders, 7),
                    '30': buildQuery('gmail', senders, 30),
                    '90': buildQuery('gmail', senders, 90),
                    all: buildQuery('gmail', senders, null),
                  }
                : undefined,
          }),
          CHUNK_TIMEOUT_MS,
        );
        return got ?? { status: 'changed', provider, emailCounts: null };
      })) ?? ({ status: 'signedOut', provider, emailCounts: null } satisfies SignInResult);
    await addLog(
      r.status === 'ok' ? 'MAIL_SIGNIN_OK' : r.status === 'signedOut' ? 'MAIL_SIGNED_OUT' : 'MAIL_CHANGED',
      'background',
      `${provider}:${index}${r.detail ? ` ${r.detail}` : ''}`,
    );
    if (r.status === 'ok' && r.emailCounts) {
      const id = accountId(provider, index);
      await chrome.storage.local.set({
        [COUNTS_KEY]: {
          ...(await savedCounts()),
          [id]: { account: id, at: Date.now(), counts: r.emailCounts } satisfies SavedCounts,
        },
      });
    }
    return { ...r, provider };
  } catch (e) {
    await addLog(
      'MAIL_ERROR',
      'background',
      `${provider} signin ${String((e as Error)?.message ?? e).slice(0, 60)}`,
    );
    return { status: 'error', provider, emailCounts: null };
  } finally {
    busy = false;
  }
}

function cardText(c: AlertCard): string {
  return [c.title, c.company, c.location, c.pay, c.url ? `Posting: ${c.url}` : null]
    .filter(Boolean)
    .join('\n');
}

/** Saves new jobs from alert cards. Returns the ids of jobs that weren't saved before. */
async function saveCards(cards: AlertCard[]): Promise<string[]> {
  const ids: string[] = [];
  for (const c of cards) {
    const job = newJobRecord({
      source: 'email',
      sourceUrl: c.url,
      site: c.site,
      siteJobId: c.siteJobId,
      text: cardText(c),
      title: c.title,
      company: c.company,
      location: c.location,
      pay: c.pay,
      preliminary: true,
    });
    const dup = await findDuplicate(job);
    if (dup) {
      await updateJob(dup.id, (j) => ({ ...j, lastSeenAt: Date.now() }));
      continue;
    }
    await putJob(job);
    ids.push(job.id);
  }
  return ids;
}

const PROBLEM: Record<Exclude<CheckStatus, 'ok'>, string> = {
  signedOut: 'MAIL_SIGNED_OUT',
  changed: 'MAIL_CHANGED',
  error: 'MAIL_ERROR',
  closed: 'MAIL_CLOSED',
};

/**
 * Reads one inbox's alerts and saves their jobs. Ranges with more than one page of results are
 * split until each fits. Jobs are saved as they're read, so a failure part way keeps what was read.
 */
async function checkAccount(
  account: EmailAccount,
  senders: string[],
  days: number | null,
  max: number,
  newIds: string[],
): Promise<AccountResult & { details: string[] }> {
  const out = { id: account.id, status: 'ok' as CheckStatus, emails: 0, newJobs: 0, details: [] as string[] };
  const { provider, index } = account;
  let seen = ((await chrome.storage.local.get(SEEN_KEY))[SEEN_KEY] as string[] | undefined) ?? [];
  const before = newIds.length;
  const opened = await withMailTab(provider, index, async (tabId) => {
    const stack: Win[] = [{ older: 0, newer: days }];
    for (let searches = 0; stack.length && out.emails < max && searches < MAX_SEARCHES; searches++) {
      const w = stack.shift()!;
      const r =
        (await withTimeout(
          inject<GmailRun>(tabId, provider, {
            mode: 'run',
            account: index,
            query: buildQuery(provider, senders, w.newer, w.older),
            senders,
            seen,
            max: max - out.emails,
          }),
          CHUNK_TIMEOUT_MS,
        ).catch((e: unknown): GmailRun => ({
          status: 'error',
          cards: [],
          emailsRead: 0,
          threadIds: [],
          detail: String((e as Error)?.message ?? e).slice(0, 60),
          more: false,
        }))) ??
        ({
          status: 'changed',
          cards: [],
          emailsRead: 0,
          threadIds: [],
          detail: 'no result',
          more: false,
        } satisfies GmailRun);
      out.details.push(`[${w.older}-${w.newer ?? 'all'}] ${r.detail}`);
      // Keep whatever was read before a failure.
      out.emails += r.emailsRead;
      newIds.push(...(await saveCards(r.cards)));
      seen = [...seen, ...r.threadIds].slice(-SEEN_MAX);
      await chrome.storage.local.set({ [SEEN_KEY]: seen });
      if (r.status !== 'ok') {
        out.status = r.status;
        return;
      }
      const parts = r.more ? splitWindow(w) : null;
      if (parts) stack.unshift(...parts);
    }
  }).catch((e: unknown) => {
    out.status = e instanceof TabClosedError ? 'closed' : 'error';
    return true;
  });
  if (opened === null) out.status = 'signedOut';
  out.newJobs = newIds.length - before;
  return out;
}

/**
 * Reads alerts from every inbox, one after another, and saves their jobs. A scheduled check looks
 * back to each inbox's last good check; an import looks back `importDays` (null means everything).
 */
export async function runEmailCheck(opts: {
  importDays?: number | null;
  reason: 'scheduled' | 'now' | 'import' | 'catchup';
  /** Only this inbox; every inbox when left out. */
  accountId?: string;
}): Promise<EmailCheckResult> {
  const s = await getSettings();
  const accounts = s.email.accounts.filter((a) => !opts.accountId || a.id === opts.accountId);
  const result: EmailCheckResult = { status: 'ok', accounts: [], emails: 0, newJobs: 0 };
  if (!accounts.length) return { ...result, status: 'off' };
  if (busy) return { ...result, status: 'busy' };
  busy = true;
  await updateStatus({ emailRunning: true });
  const newIds: string[] = [];
  try {
    const max = opts.reason === 'import' ? MAX_EMAILS.import : MAX_EMAILS.check;
    for (const account of accounts) {
      const days = opts.reason === 'import' ? (opts.importDays ?? null) : checkWindowDays(account.lastOkAt);
      const r = await checkAccount(account, s.email.senders, days, max, newIds);
      const { details, ...res } = r;
      result.accounts.push(res);
      result.emails += r.emails;
      if (r.status !== 'ok' && result.status === 'ok') result.status = r.status;
      const code = r.status === 'ok' ? 'EMAIL_CHECK' : PROBLEM[r.status];
      await addLog(
        code,
        'background',
        `${account.id} ${opts.reason} days=${days ?? 'all'} new=${r.newJobs} ${details.join(' ')}`.slice(
          0,
          500,
        ),
      );
      const now = Date.now();
      await updateSettings((x) => {
        const a = x.email.accounts.find((y) => y.id === account.id);
        if (!a) return;
        a.lastCheck = { at: now, result: r.status === 'ok' ? 'ok' : code, count: r.newJobs };
        if (r.status === 'ok') a.lastOkAt = now;
      });
    }
    result.newJobs = newIds.length;

    // The banner names the first inbox that needs the person's help.
    const bad = result.accounts.find((a) => a.status === 'signedOut' || a.status === 'changed');
    await updateStatus({
      emailProblem: bad ? (bad.status === 'signedOut' ? 'MAIL_SIGNED_OUT' : 'MAIL_CHANGED') : null,
      emailProblemAccount: bad?.id ?? null,
    });
    await updateSettings((x) => {
      x.email.lastCheck = {
        at: Date.now(),
        result: result.status === 'ok' ? 'ok' : PROBLEM[result.status as Exclude<CheckStatus, 'ok'>],
        count: newIds.length,
      };
    });

    if (newIds.length && (await getApiKey())) {
      // Scored now if the person is using Fulcra, at half price if they're away.
      await queueUnscored();
      await chrome.storage.local.set({ [NOTIFY_KEY]: { ids: newIds, at: Date.now() } });
    }
    return result;
  } finally {
    busy = false;
    await updateStatus({ emailRunning: false });
  }
}

export const EMAIL_NOTIFY_KEY = NOTIFY_KEY;
