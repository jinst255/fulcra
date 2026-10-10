// The scoring queue. Runs in the service worker, persists in IndexedDB, 6 requests in flight.
// Bulk scoring while the person is away goes through OpenAI's Batch API at half price (halfprice.ts).
// Blueprint sections 4, 7, and 12.4.
import { modelDimensions } from '../core/dimensions';
import { isPayOutlier, obviousPeriod, thousandsFix } from '../core/pay';
import { planRescore, isSmallBatch, markOutdated, rescoreAllPick } from '../core/rescore';
import type { JobRecord, Settings } from '../core/types';
import { costPerJob } from '../llm/cost';
import { openai } from '../llm/openai';
import type { ScoringOutput } from '../llm/schema';
import { ProviderError, type Provider, type ScoreRequest } from '../llm/provider';
import { db, StorageFullError, type QueueItem } from '../store/db';
import { getJob, putJob, allJobs } from '../store/jobs';
import { addLog } from '../store/log';
import { getApiKey, getSettings, getStatus, updateStatus, type AppStatus } from '../store/settings';
import { applyDimScores, applyFullScore, applyPayUnit } from './jobs';
import { isPresent } from './presence';

export const CONCURRENCY = 6;
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
    remote: existing?.remote ?? null,
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
      .filter((i) => !inFlight.has(i.id) && i.notBefore <= now && !i.remote)
      .filter(
        (i) =>
          !(
            status.batch &&
            i.batch === status.batch.id &&
            (status.batch.paused || status.batch.mode === 'half')
          ),
      )
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

export async function finishItem(item: QueueItem): Promise<void> {
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
      const r = await provider.score(key, scoreRequest(item, job, settings));
      await applyResult(item, job, r.output, r.raw, key, settings);
    } else if (item.kind === 'dims') {
      const dims = modelDimensions(settings.dimensions).filter((d) => item.dimIds.includes(d.id));
      if (dims.length) {
        const r = await provider.score(key, scoreRequest(item, job, settings));
        await applyResult(item, job, r.output, r.raw, key, settings);
      }
    }
    await updateStatus((s) => (s.rateLimited ? { rateLimited: false } : {}));
    await finishItem(item);
  } catch (e) {
    await handleError(e, item, job);
  }
}

/** The scoring request for a queue item: every dimension, or only the ones being re-scored. */
export function scoreRequest(item: QueueItem, job: JobRecord, settings: Settings): ScoreRequest {
  const all = modelDimensions(settings.dimensions);
  if (item.kind === 'dims') {
    const dims = all.filter((d) => item.dimIds.includes(d.id));
    return {
      model: settings.model,
      about: settings.about,
      dims,
      listing: job.listingText,
      preliminary: job.preliminary,
      onlyDims: dims.map((d) => d.id),
    };
  }
  return {
    model: settings.model,
    about: settings.about,
    dims: all,
    listing: job.listingText,
    preliminary: job.preliminary,
    sourceUrl: job.sourceUrl,
  };
}

/** Writes a scoring answer into the job, direct or from a batch, and tells listeners. */
export async function applyResult(
  item: QueueItem,
  job: JobRecord,
  output: ScoringOutput,
  raw: string,
  key: string,
  settings: Settings,
): Promise<void> {
  const req = scoreRequest(item, job, settings);
  const cur = await getJob(job.id);
  // Deleted while it was being scored (or Fulcra was reset): don't bring it back.
  if (!cur) return;
  if (item.kind === 'full') {
    let next = applyFullScore(cur, output, req.dims, raw);
    if (isPayOutlier(next.facts.pay)) next = await checkUnit(next, key, settings.model);
    await putJob(next);
    await addLog('SCORE_OK', 'background', job.preliminary ? 'preliminary' : 'full');
    for (const fn of scoredListeners) fn(next, item);
  } else {
    await putJob(applyDimScores(cur, output, req.dims));
    await addLog('RESCORE_OK', 'background', `${req.dims.length} dimension(s)`);
  }
}

/**
 * Pay that can't be right for its unit ($110,000 an hour). Obvious cases are fixed here: "$110K" read
 * as 110, a unit the listing states, or the only unit the amount fits. Otherwise the model is asked.
 */
async function checkUnit(job: JobRecord, key: string, model: 'standard' | 'sharper'): Promise<JobRecord> {
  const scaled = thousandsFix(job.facts.pay, job.listingText);
  if (scaled) {
    await addLog('PAY_THOUSANDS', 'background', job.facts.pay.period);
    job = { ...job, facts: { ...job.facts, pay: scaled } };
    if (!isPayOutlier(scaled)) return job;
  }
  const obvious = obviousPeriod(job.facts.pay, job.listingText);
  if (obvious) {
    await addLog('PAY_UNIT', 'background', `${job.facts.pay.period} to ${obvious.to} (obvious)`);
    return applyPayUnit(job, obvious.to, obvious.reason);
  }
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

type Batch = NonNullable<AppStatus['batch']>;

interface Work {
  jobId: string;
  kind: QueueItem['kind'];
  dimIds?: string[];
  preliminary?: boolean;
}

type HalfPriceStarter = (batchId: string) => Promise<void>;
let startHalfPrice: HalfPriceStarter = async () => undefined;
/** halfprice.ts registers itself here, so the queue doesn't import the Batch API client. */
export function setHalfPriceStarter(fn: HalfPriceStarter): void {
  startHalfPrice = fn;
}

/**
 * Scores a group of jobs without asking. When the person is using Fulcra, they're scored now with
 * direct calls, with a progress banner unless it's a few new jobs. When they're away, they go to OpenAI's
 * Batch API at half price (joining a half-price batch already out); the banner then offers
 * "Score now" for when they come back.
 */
function scoreGroup(work: Work[], meta: GroupMeta): Promise<void> {
  // One at a time, so two groups (an email check as the app opens, say) can't both start a batch.
  const run = grouping.then(() => group(work, meta));
  grouping = run.catch(() => undefined);
  return run;
}

type GroupMeta = { kind: Batch['kind']; label: string; cost: number };
let grouping: Promise<void> = Promise.resolve();

async function group(work: Work[], meta: GroupMeta): Promise<void> {
  const d = await db();
  const fresh: Work[] = [];
  for (const w of work) {
    // Already queued: keep its place, adding any newly changed dimensions.
    if (await d.get('queue', itemId(w.jobId, w.kind))) {
      if (w.kind === 'dims') await enqueue(w.jobId, w);
    } else fresh.push(w);
  }
  if (!fresh.length) return void pump();
  const cost = (meta.cost * fresh.length) / work.length;
  const here = await isPresent();
  const cur = (await getStatus()).batch;
  const direct = async () => {
    for (const w of fresh) await enqueue(w.jobId, w);
    void pump();
  };
  // Without a key nothing can be sent; the jobs wait in the queue for one.
  if (!(await getApiKey())) return direct();
  // A few new jobs don't need a progress banner; re-scores always show one.
  if (here && (cur || (meta.kind === 'unscored' && isSmallBatch(fresh.length, cost)))) return direct();
  if (cur?.mode === 'half') {
    for (const w of fresh) await enqueue(w.jobId, { ...w, batch: cur.id });
    await updateStatus((s) =>
      s.batch?.id === cur.id
        ? { batch: { ...s.batch, total: s.batch.total + fresh.length, cost: s.batch.cost + cost } }
        : {},
    );
    return startHalfPrice(cur.id);
  }
  // A full-price batch is already running; one batch at a time, so these go direct too.
  if (cur) return direct();
  const batch: Batch = {
    id: `b${Date.now()}`,
    label: meta.label,
    kind: meta.kind,
    done: 0,
    total: fresh.length,
    cost,
    paused: false,
    mode: here ? 'now' : 'half',
    remoteIds: [],
    submittedAt: null,
  };
  for (const w of fresh) await enqueue(w.jobId, { ...w, batch: batch.id });
  await updateStatus({ batch });
  await addLog('BATCH_START', 'background', `${batch.kind} ${batch.total} ${batch.mode}`);
  if (batch.mode === 'half') await startHalfPrice(batch.id);
  else void pump();
}

/**
 * Scores every job that has no score yet. Runs after an email check, when a key is added,
 * when the app opens, and daily, so no job is left unscored.
 */
export async function queueUnscored(): Promise<void> {
  const jobs = (await allJobs()).filter((j) => j.scoring === 'notScored' || j.scoring === 'queued');
  if (!jobs.length) return;
  const settings = await getSettings();
  await scoreGroup(
    jobs.map((j) => ({ jobId: j.id, kind: 'full', preliminary: j.preliminary })),
    { kind: 'unscored', label: '', cost: jobs.length * costPerJob(settings.model) },
  );
}

/** After dimensions change: mark edited scores outdated and re-score what changed. */
export async function planAndMaybeStart(): Promise<void> {
  const settings = await getSettings();
  const jobs = await allJobs();
  for (const j of jobs) {
    const m = markOutdated(j, settings.dimensions);
    if (m !== j) await putJob(m);
  }
  const plan = planRescore(jobs, settings.dimensions, settings.model);
  if (!plan.tasks.length) return;
  await scoreGroup(
    plan.tasks.map((t) => ({ jobId: t.jobId, kind: 'dims', dimIds: t.dimIds })),
    { kind: plan.kind, label: plan.dimNames.join(', '), cost: plan.cost },
  );
}

/** "Re-score all jobs", after the person confirms the cost. Returns how many. */
export async function rescoreAll(): Promise<number> {
  const jobs = (await allJobs()).filter(rescoreAllPick);
  if (!jobs.length) return 0;
  const settings = await getSettings();
  await scoreGroup(
    jobs.map((j) => ({ jobId: j.id, kind: 'full', preliminary: j.preliminary })),
    { kind: 'all', label: '', cost: jobs.length * costPerJob(settings.model) },
  );
  return jobs.length;
}
