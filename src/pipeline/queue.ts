// The scoring queue. Runs in the service worker, persists in IndexedDB, 3 requests in flight.
// Blueprint sections 4, 7, and 12.4.
import { modelDimensions } from '../core/dimensions';
import { isPayOutlier } from '../core/pay';
import { planRescore, isSmallBatch, markOutdated } from '../core/rescore';
import type { JobRecord } from '../core/types';
import { batchSeconds, costPerJob } from '../llm/cost';
import { openai } from '../llm/openai';
import { ProviderError, type Provider } from '../llm/provider';
import { db, StorageFullError, type QueueItem } from '../store/db';
import { getJob, putJob, allJobs } from '../store/jobs';
import { addLog } from '../store/log';
import { getApiKey, getSettings, getStatus, updateStatus } from '../store/settings';
import { applyDimScores, applyFullScore, applyPayUnit } from './jobs';

export const CONCURRENCY = 3;
const REQUEUE_MS = 5 * 60 * 1000;
const OFFLINE_RETRY_MS = 60 * 1000;

type Listener = (job: JobRecord, item: QueueItem) => void;
const scoredListeners: Listener[] = [];
/** Called after each job is scored, for the badge and notifications. */
export function onScored(fn: Listener): void {
  scoredListeners.push(fn);
}

let provider: Provider = openai;
export function setProviderForTests(p: Provider): void {
  provider = p;
}

function itemId(jobId: string, kind: QueueItem['kind']): string {
  return `${jobId}:${kind}`;
}

export async function enqueue(
  jobId: string,
  opts: { kind?: QueueItem['kind']; dimIds?: string[]; preliminary?: boolean; batch?: string | null } = {},
): Promise<void> {
  const kind = opts.kind ?? 'full';
  const d = await db();
  const id = itemId(jobId, kind);
  const existing = await d.get('queue', id);
  const item: QueueItem = {
    id,
    jobId,
    kind,
    dimIds: [...new Set([...(existing?.dimIds ?? []), ...(opts.dimIds ?? [])])],
    preliminary: opts.preliminary ?? false,
    attempts: 0,
    notBefore: 0,
    addedAt: existing?.addedAt ?? Date.now(),
    batch: opts.batch ?? existing?.batch ?? null,
  };
  await d.put('queue', item);
  // A full score covers any pending dimension re-score.
  if (kind === 'full') await d.delete('queue', itemId(jobId, 'dims'));
}

export async function queueSize(): Promise<number> {
  return (await db()).count('queue');
}

let running = 0;
let pumping = false;
const inFlight = new Set<string>();

/** Starts as many queued items as concurrency allows. Safe to call often. */
export async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    const status = await getStatus();
    if (status.scoringBlocked) return;
    const key = await getApiKey();
    if (!key) return;
    const d = await db();
    const now = Date.now();
    const items = (await d.getAll('queue'))
      .filter((i) => !inFlight.has(i.id) && i.notBefore <= now)
      .filter((i) => !(status.batch?.paused && i.batch === status.batch.id))
      .sort((a, b) => (a.batch ? 1 : 0) - (b.batch ? 1 : 0) || a.addedAt - b.addedAt);
    while (running < CONCURRENCY && items.length) {
      const item = items.shift()!;
      inFlight.add(item.id);
      running++;
      void runItem(item, key).finally(() => {
        running--;
        inFlight.delete(item.id);
        void pump();
      });
    }
  } finally {
    pumping = false;
  }
}

async function finishItem(item: QueueItem): Promise<void> {
  await (await db()).delete('queue', item.id);
  if (item.batch) {
    const st = await updateStatus((s) =>
      s.batch && s.batch.id === item.batch ? { batch: { ...s.batch, done: s.batch.done + 1 } } : {},
    );
    if (st.batch && st.batch.done >= st.batch.total) await updateStatus({ batch: null });
  }
}

async function runItem(item: QueueItem, key: string): Promise<void> {
  const job = await getJob(item.jobId);
  if (!job) return finishItem(item);
  const settings = await getSettings();
  if (settings.verboseLog)
    await addLog('QUEUE_START', 'background', `${item.kind} attempt ${item.attempts + 1}`);
  try {
    if (item.kind === 'full') {
      await putJob({ ...job, scoring: 'queued' });
      const dims = modelDimensions(settings.dimensions);
      const r = await provider.score(key, {
        model: settings.model,
        about: settings.about,
        dims,
        listing: job.listingText,
        preliminary: job.preliminary,
        sourceUrl: job.sourceUrl,
      });
      let next = applyFullScore((await getJob(job.id)) ?? job, r.output, dims, r.raw);
      if (isPayOutlier(next.facts.pay)) next = await checkUnit(next, key, settings.model);
      await putJob(next);
      await addLog('SCORE_OK', 'background', job.preliminary ? 'preliminary' : 'full');
      for (const fn of scoredListeners) fn(next, item);
    } else if (item.kind === 'dims') {
      const dims = modelDimensions(settings.dimensions).filter((d) => item.dimIds.includes(d.id));
      if (dims.length) {
        const r = await provider.score(key, {
          model: settings.model,
          about: settings.about,
          dims,
          listing: job.listingText,
          preliminary: job.preliminary,
          onlyDims: dims.map((d) => d.id),
        });
        await putJob(applyDimScores((await getJob(job.id)) ?? job, r.output, dims));
        await addLog('RESCORE_OK', 'background', `${dims.length} dimension(s)`);
      }
    }
    await updateStatus((s) => (s.rateLimited ? { rateLimited: false } : {}));
    await finishItem(item);
  } catch (e) {
    await handleError(e, item, job);
  }
}

async function checkUnit(job: JobRecord, key: string, model: 'standard' | 'sharper'): Promise<JobRecord> {
  const amount = job.facts.pay.min ?? job.facts.pay.max;
  if (amount == null) return job;
  try {
    const r = await provider.checkPayUnit(key, model, {
      title: job.facts.title,
      location: job.facts.location,
      amount,
      period: job.facts.pay.period,
      listing: job.listingText,
    });
    if (r.unit !== 'unchanged' && r.unit !== job.facts.pay.period) {
      await addLog('PAY_UNIT', 'background', `${job.facts.pay.period} to ${r.unit}`);
      return applyPayUnit(job, r.unit, r.reason);
    }
  } catch {
    // Keep the job as scored; the unit check is best effort.
  }
  return job;
}

async function handleError(e: unknown, item: QueueItem, job: JobRecord): Promise<void> {
  if (e instanceof StorageFullError) {
    // Keep the queue item; scoring resumes once there's room.
    await addLog('STORAGE_FULL', 'background', 'job save failed');
    await updateStatus({ storageFull: true });
    return;
  }
  const code = e instanceof ProviderError ? e.code : 'UNKNOWN';
  const d = await db();
  await addLog(code, 'background', e instanceof ProviderError ? e.detail : 'unexpected');
  const restore = async () => {
    const cur = await getJob(job.id);
    if (cur && cur.scoring === 'queued')
      await putJob({
        ...cur,
        scoring: cur.scores && Object.keys(cur.scores).length ? 'scored' : 'notScored',
      });
  };
  switch (code) {
    case 'KEY_INVALID':
    case 'NO_CREDIT':
      // Pause everything and keep the queue until the key or credit changes.
      await updateStatus({ scoringBlocked: code });
      await restore();
      return;
    case 'RATE_LIMIT':
      await d.put('queue', { ...item, attempts: item.attempts + 1, notBefore: Date.now() + REQUEUE_MS });
      await updateStatus({ rateLimited: true });
      await restore();
      return;
    case 'OFFLINE':
      await d.put('queue', {
        ...item,
        attempts: item.attempts + 1,
        notBefore: Date.now() + OFFLINE_RETRY_MS,
      });
      await restore();
      return;
    default: {
      // BAD_JSON or anything else: mark the job so the row offers "Try again".
      const cur = (await getJob(job.id)) ?? job;
      if (item.kind === 'full')
        await putJob({ ...cur, scoring: 'failed', scoreError: code === 'BAD_JSON' ? 'BAD_JSON' : 'UNKNOWN' });
      await finishItem(item);
    }
  }
}

/** Queues every job that has no score yet, asking first when the batch is large. */
export async function queueUnscored(): Promise<void> {
  const jobs = (await allJobs()).filter((j) => j.scoring === 'notScored' || j.scoring === 'queued');
  if (!jobs.length) return;
  const settings = await getSettings();
  const cost = jobs.length * costPerJob(settings.model);
  if (isSmallBatch(jobs.length, cost)) {
    for (const j of jobs) await enqueue(j.id, { preliminary: j.preliminary });
    void pump();
  } else {
    await updateStatus({
      askBatch: { kind: 'unscored', count: jobs.length, cost, seconds: batchSeconds(jobs.length) },
    });
  }
}

/**
 * After dimensions change: mark edited scores outdated and plan the re-score.
 * Small batches start right away with a progress banner; large ones ask first.
 */
export async function planAndMaybeStart(): Promise<void> {
  const settings = await getSettings();
  const jobs = await allJobs();
  for (const j of jobs) {
    const m = markOutdated(j, settings.dimensions);
    if (m !== j) await putJob(m);
  }
  const plan = planRescore(jobs, settings.dimensions, settings.model);
  if (!plan.tasks.length) return;
  const status = await getStatus();
  if (status.batch) return;
  if (isSmallBatch(plan.tasks.length, plan.cost)) await startPlannedBatch();
  else
    await updateStatus({
      askBatch: {
        kind: 'rescore',
        count: plan.tasks.length,
        cost: plan.cost,
        seconds: batchSeconds(plan.tasks.length),
      },
    });
}

export async function startPlannedBatch(): Promise<void> {
  const settings = await getSettings();
  const plan = planRescore(await allJobs(), settings.dimensions, settings.model);
  const status = await getStatus();
  if (status.askBatch?.kind === 'unscored') {
    const jobs = (await allJobs()).filter((j) => j.scoring === 'notScored');
    for (const j of jobs) await enqueue(j.id, { preliminary: j.preliminary });
    await updateStatus({ askBatch: null });
    void pump();
    return;
  }
  if (!plan.tasks.length) {
    await updateStatus({ askBatch: null });
    return;
  }
  const id = `b${Date.now()}`;
  for (const t of plan.tasks) await enqueue(t.jobId, { kind: 'dims', dimIds: t.dimIds, batch: id });
  await updateStatus({
    askBatch: null,
    batch: {
      id,
      label: plan.dimNames.join(', '),
      kind: plan.kind,
      done: 0,
      total: plan.tasks.length,
      cost: plan.cost,
      paused: false,
    },
  });
  void pump();
}
