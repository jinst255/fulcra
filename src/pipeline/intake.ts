// Turning a page, pasted text, or a link into a saved job and a queued score.
// Runs in the service worker. Blueprint sections 4 and 7.
import type { JobRecord } from '../core/types';
import type { ReadTabResult, ScoreTabResult } from '../messages';
import type { PageExtraction } from '../readers/extract';
import { isUrl, siteFor } from '../readers/generic';
import { findDuplicate, getJob, putJob, updateJob, upsertJob } from '../store/jobs';
import { addLog } from '../store/log';
import { StorageFullError } from '../store/db';
import { getApiKey, getSettings, updateStatus } from '../store/settings';
import { newJobRecord, type ListingInput } from './jobs';
import { enqueue, pump } from './queue';

const LOAD_TIMEOUT_MS = 20_000;
const SETTLE_MS = 2500;

export async function readTab(tabId: number): Promise<PageExtraction | null> {
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, files: ['/reader.js'] });
    return (res?.result as PageExtraction | undefined) ?? null;
  } catch {
    // chrome:// pages, the Web Store, PDFs, or no permission.
    return null;
  }
}

function inputFromPage(page: PageExtraction, source: 'page' | 'paste'): ListingInput {
  return {
    source,
    sourceUrl: page.url,
    site: page.site,
    siteJobId: page.siteJobId,
    text: page.text,
    title: page.title,
    company: page.company,
    location: page.location,
    pay: page.pay,
    closed: page.closed,
  };
}

async function existingFor(page: PageExtraction): Promise<JobRecord | undefined> {
  const probe = newJobRecord(inputFromPage(page, 'page'));
  return findDuplicate(probe);
}

/** For the popup: is this tab a job page, and is it already saved? */
export async function describeTab(tabId: number): Promise<ReadTabResult> {
  const page = await readTab(tabId);
  if (!page || !page.isJobPage) return { ok: false };
  const existing = await existingFor(page);
  return { ok: true, page, jobId: existing?.id ?? null };
}

/** Saves a job read from a page and queues it. A job scored before comes back as "already". */
export async function intakePage(
  page: PageExtraction,
  source: 'page' | 'paste' = 'page',
): Promise<ScoreTabResult> {
  try {
    return await intakePageInner(page, source);
  } catch (e) {
    return storageFailure(e);
  }
}

async function storageFailure(e: unknown): Promise<ScoreTabResult> {
  if (e instanceof StorageFullError) {
    await addLog('STORAGE_FULL', 'background', 'intake');
    await updateStatus({ storageFull: true });
  } else await addLog('UNKNOWN', 'background', 'intake');
  return { ok: false, code: 'UNKNOWN' };
}

async function intakePageInner(page: PageExtraction, source: 'page' | 'paste'): Promise<ScoreTabResult> {
  if (!page.isJobPage || page.text.length < 80)
    return { ok: false, code: page.selectorsFailed ? 'PAGE_CHANGED' : 'PAGE_UNSUPPORTED' };
  if (page.selectorsFailed) await addLog('PAGE_CHANGED', 'background', page.site ?? '');
  const existing = await existingFor(page);
  if (existing && existing.scoring === 'scored' && !existing.preliminary) {
    await updateJob(existing.id, (j) => ({
      ...j,
      lastSeenAt: Date.now(),
      status: page.closed ? 'closed' : j.status,
    }));
    return { ok: true, jobId: existing.id, already: true };
  }
  const saved = await upsertJob({ ...newJobRecord(inputFromPage(page, source)), preliminary: false });
  if (page.closed) {
    await updateJob(saved.id, (j) => ({ ...j, status: 'closed', facts: { ...j.facts, status: 'closed' } }));
    await addLog('JOB_CLOSED', 'background', page.site ?? 'page');
  }
  await enqueue(saved.id);
  if (!(await getApiKey())) return { ok: false, code: 'KEY_MISSING', jobId: saved.id };
  void pump();
  return { ok: true, jobId: saved.id, already: false };
}

export async function scoreTab(tabId: number): Promise<ScoreTabResult> {
  const page = await readTab(tabId);
  if (!page) return { ok: false, code: 'PAGE_UNSUPPORTED' };
  return intakePage(page);
}

function waitForLoad(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      chrome.tabs.onUpdated.removeListener(l);
      clearTimeout(timer);
      setTimeout(resolve, SETTLE_MS);
    };
    const l = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === 'complete') done();
    };
    const timer = setTimeout(done, LOAD_TIMEOUT_MS);
    chrome.tabs.onUpdated.addListener(l);
  });
}

/** Opens a link in a background tab, reads it, and closes the tab. */
export async function readLink(url: string): Promise<PageExtraction | null> {
  const tab = await chrome.tabs.create({ url, active: false });
  if (tab.id == null) return null;
  try {
    await waitForLoad(tab.id);
    return await readTab(tab.id);
  } finally {
    void chrome.tabs.remove(tab.id).catch(() => undefined);
  }
}

/** Pasted text or a link from the popup or the right-click menu. */
export async function addPaste(text: string): Promise<ScoreTabResult> {
  const t = text.trim();
  if (!t) return { ok: false, code: 'PAGE_UNSUPPORTED' };
  if (isUrl(t)) {
    const page = await readLink(t);
    if (!page) return { ok: false, code: 'PAGE_UNSUPPORTED' };
    return intakePage({ ...page, isJobPage: page.isJobPage || !!siteFor(t) }, 'paste');
  }
  const job = newJobRecord({ source: 'paste', sourceUrl: null, site: null, siteJobId: null, text: t });
  try {
    await putJob(job);
  } catch (e) {
    return storageFailure(e);
  }
  await enqueue(job.id);
  if (!(await getApiKey())) return { ok: false, code: 'KEY_MISSING', jobId: job.id };
  void pump();
  return { ok: true, jobId: job.id, already: false };
}

/**
 * A site content script saw a job page. Upgrades a preliminary score when the setting
 * is on, records closed postings, and auto-scores when that setting is on.
 */
export async function pageSeen(page: PageExtraction): Promise<void> {
  if (!page.siteJobId || !page.isJobPage) return;
  const settings = await getSettings();
  const existing = await existingFor(page);
  if (existing) {
    const upgrade =
      existing.preliminary &&
      settings.scoring.upgradeOnVisit &&
      page.text.length > existing.listingText.length;
    await updateJob(existing.id, (j) => ({
      ...j,
      lastSeenAt: Date.now(),
      status: page.closed ? 'closed' : j.status,
      ...(upgrade
        ? {
            listingText: page.text,
            preliminary: false,
            sourceUrl: page.url,
            siteJobId: page.siteJobId,
            dedupeKey: `${page.site}:${page.siteJobId}`,
          }
        : {}),
    }));
    if (upgrade && !page.closed) {
      await enqueue(existing.id);
      void pump();
    }
    return;
  }
  if (settings.scoring.autoScore && !page.closed) await intakePage(page);
}

export async function rescoreJob(jobId: string): Promise<boolean> {
  const job = await getJob(jobId);
  if (!job) return false;
  await enqueue(jobId, { preliminary: job.preliminary });
  void pump();
  return true;
}
