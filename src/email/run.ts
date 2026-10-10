// One email check: open the mail page in a minimized window, read new alerts, close it,
// and queue preliminary scores. Blueprint sections 4.3, 9.4, and 12.3.
import { getApiKey, getSettings, updateSettings, updateStatus } from '../store/settings';
import { addLog } from '../store/log';
import { findDuplicate, putJob, updateJob } from '../store/jobs';
import { newJobRecord } from '../pipeline/jobs';
import { enqueue, pump } from '../pipeline/queue';
import type { GmailArgs, GmailRun } from '../readers/gmail';
import type { AlertCard, SignInResult } from './types';

const SEEN_KEY = 'emailSeen';
const SEEN_MAX = 3000;
const NOTIFY_KEY = 'emailNotify';
const LOAD_TIMEOUT_MS = 30_000;
const RUN_TIMEOUT_MS = 4 * 60_000;

type Provider = 'gmail' | 'outlook';

export function mailUrl(provider: Provider, account: number): string {
  // [Unverified] Work accounts use outlook.office.com; personal accounts outlook.live.com.
  return provider === 'gmail'
    ? `https://mail.google.com/mail/u/${account}/#inbox`
    : 'https://outlook.live.com/mail/0/';
}

export function buildQuery(provider: Provider, senders: string[], days: number | null): string {
  const from = senders.length ? `from:(${senders.join(' OR ')})` : '';
  if (provider === 'outlook') return senders.map((s) => `from:${s}`).join(' OR ');
  return [from, days != null ? `newer_than:${days}d` : ''].filter(Boolean).join(' ');
}

function isMailHost(url: string | undefined, provider: Provider): boolean {
  if (!url) return false;
  try {
    const h = new URL(url).hostname;
    return provider === 'gmail' ? h === 'mail.google.com' : /^outlook\.(live|office)\.com$/.test(h);
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

/** A minimized, unfocused window, or an inactive tab if minimized windows aren't allowed. */
async function openBackground(url: string): Promise<{ tabId: number; close: () => Promise<void> }> {
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

async function withMailTab<T>(
  provider: Provider,
  account: number,
  fn: (tabId: number) => Promise<T>,
  onSignedOut: () => T,
): Promise<T> {
  const { tabId, close } = await openBackground(mailUrl(provider, account));
  try {
    await waitForComplete(tabId);
    await new Promise((r) => setTimeout(r, 1500));
    const tab = await chrome.tabs.get(tabId);
    if (!isMailHost(tab.url, provider)) return onSignedOut();
    return await Promise.race([
      fn(tabId),
      new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), RUN_TIMEOUT_MS)),
    ]);
  } finally {
    await close();
  }
}

export async function signInCheck(provider: Provider): Promise<SignInResult> {
  const s = await getSettings();
  try {
    const r = await withMailTab<SignInResult>(
      provider,
      s.email.accountIndex,
      async (tabId) =>
        (await inject<SignInResult>(tabId, provider, {
          mode: 'signin',
          account: s.email.accountIndex,
          countQueries:
            provider === 'gmail'
              ? {
                  '7': buildQuery('gmail', s.email.senders, 7),
                  '30': buildQuery('gmail', s.email.senders, 30),
                  '90': buildQuery('gmail', s.email.senders, 90),
                  all: buildQuery('gmail', s.email.senders, null),
                }
              : undefined,
        })) ?? { status: 'changed', provider, emailCounts: null },
      () => ({ status: 'signedOut', provider, emailCounts: null }),
    );
    await addLog(
      r.status === 'ok' ? 'MAIL_SIGNIN_OK' : r.status === 'signedOut' ? 'MAIL_SIGNED_OUT' : 'MAIL_CHANGED',
      'background',
      provider,
    );
    return { ...r, provider };
  } catch {
    await addLog('MAIL_CHANGED', 'background', `${provider} signin error`);
    return { status: 'error', provider, emailCounts: null };
  }
}

function cardText(c: AlertCard): string {
  return [c.title, c.company, c.location, c.pay, c.url ? `Posting: ${c.url}` : null]
    .filter(Boolean)
    .join('\n');
}

let running = false;

/** Reads alerts and queues preliminary scores. `days` null means the scheduled window. */
export async function runEmailCheck(opts: {
  importDays?: number | null;
  reason: 'scheduled' | 'now' | 'import' | 'catchup';
}): Promise<void> {
  const s = await getSettings();
  const provider = s.email.provider;
  if (!provider || running) return;
  running = true;
  await updateStatus({ emailRunning: true });
  try {
    const days = opts.reason === 'import' ? (opts.importDays ?? null) : 2;
    const seen = ((await chrome.storage.local.get(SEEN_KEY))[SEEN_KEY] as string[] | undefined) ?? [];
    const result = await withMailTab<GmailRun>(
      provider,
      s.email.accountIndex,
      async (tabId) =>
        (await inject<GmailRun>(tabId, provider, {
          mode: 'run',
          account: s.email.accountIndex,
          query: buildQuery(provider, s.email.senders, days),
          seen,
          max: opts.reason === 'import' ? 200 : 40,
        })) ?? { status: 'changed', cards: [], emailsRead: 0, threadIds: [], detail: 'no result' },
      () => ({ status: 'signedOut', cards: [], emailsRead: 0, threadIds: [], detail: 'signed out' }),
    ).catch((e: unknown): GmailRun => ({
      status: 'error',
      cards: [],
      emailsRead: 0,
      threadIds: [],
      detail: String((e as Error)?.message ?? e).slice(0, 80),
    }));

    if (result.status === 'signedOut' || result.status === 'changed') {
      const code = result.status === 'signedOut' ? 'MAIL_SIGNED_OUT' : 'MAIL_CHANGED';
      await addLog(code, 'background', `${provider} ${result.detail}`);
      await updateStatus({ emailProblem: code });
      await updateSettings((x) => void (x.email.lastCheck = { at: Date.now(), result: code, count: null }));
      return;
    }
    if (result.status === 'error') {
      await addLog('MAIL_ERROR', 'background', `${provider} ${result.detail}`);
      return;
    }

    const hasKey = !!(await getApiKey());
    const newIds: string[] = [];
    for (const c of result.cards) {
      const job = {
        ...newJobRecord({
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
        }),
      };
      const dup = await findDuplicate(job);
      if (dup) {
        await updateJob(dup.id, (j) => ({ ...j, lastSeenAt: Date.now() }));
        continue;
      }
      await putJob(job);
      newIds.push(job.id);
      if (hasKey) await enqueue(job.id, { preliminary: true });
    }
    const nextSeen = [...seen, ...result.threadIds].slice(-SEEN_MAX);
    await chrome.storage.local.set({ [SEEN_KEY]: nextSeen });
    await chrome.storage.local.set({ [NOTIFY_KEY]: { ids: newIds, at: Date.now() } });
    await addLog(
      'EMAIL_CHECK',
      'background',
      `${provider} ${opts.reason} ${result.detail} new=${newIds.length}`,
    );
    await updateStatus({ emailProblem: null });
    await updateSettings(
      (x) => void (x.email.lastCheck = { at: Date.now(), result: 'ok', count: newIds.length }),
    );
    if (hasKey) void pump();
  } finally {
    running = false;
    await updateStatus({ emailRunning: false });
  }
}

export const EMAIL_NOTIFY_KEY = NOTIFY_KEY;
