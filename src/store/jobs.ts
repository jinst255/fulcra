// Job CRUD, dedupe on save, overrides history, and retention cleanup. Blueprint sections 12.3 to 12.6.
import { factsKey, mergeJobs } from '../core/dedupe';
import type { JobRecord, OverrideEntry } from '../core/types';
import { db, isQuotaError, StorageFullError } from './db';
import { bumpJobsVersion } from './settings';

const DAY = 24 * 60 * 60 * 1000;

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isQuotaError(e)) throw new StorageFullError();
    throw e;
  }
}

export async function allJobs(): Promise<JobRecord[]> {
  return (await db()).getAll('jobs');
}

export async function getJob(id: string): Promise<JobRecord | undefined> {
  return (await db()).get('jobs', id);
}

export async function putJob(job: JobRecord): Promise<void> {
  await guard(async () => (await db()).put('jobs', { ...job, updatedAt: Date.now() }));
  await bumpJobsVersion();
}

export async function updateJob(id: string, fn: (j: JobRecord) => JobRecord): Promise<JobRecord | undefined> {
  const d = await db();
  const cur = await d.get('jobs', id);
  if (!cur) return undefined;
  const next = { ...fn(structuredClone(cur)), updatedAt: Date.now() };
  await guard(() => d.put('jobs', next));
  await bumpJobsVersion();
  return next;
}

/** Finds an existing record for the same job: site id key first, then company, title, and location. */
export async function findDuplicate(
  job: Pick<JobRecord, 'dedupeKey' | 'facts' | 'id'>,
): Promise<JobRecord | undefined> {
  const d = await db();
  const byKey = await d.getFromIndex('jobs', 'dedupeKey', job.dedupeKey);
  if (byKey && byKey.id !== job.id) return byKey;
  if (!job.facts.title) return undefined;
  const fk = factsKey(job);
  const all = await d.getAll('jobs');
  return all.find((j) => j.id !== job.id && (j.dedupeKey === fk || factsKey(j) === fk));
}

/** Saves a job, merging it into an existing record for the same job. Returns the stored record. */
export async function upsertJob(job: JobRecord): Promise<JobRecord> {
  const dup = await findDuplicate(job);
  const out = dup ? mergeJobs(dup, job) : job;
  await putJob(out);
  return out;
}

export async function deleteJob(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['jobs', 'queue'], 'readwrite');
  await tx.objectStore('jobs').delete(id);
  for (const k of await tx.objectStore('queue').index('jobId').getAllKeys(id))
    await tx.objectStore('queue').delete(k);
  await tx.done;
  await bumpJobsVersion();
}

export async function deleteWhere(pred: (j: JobRecord) => boolean): Promise<number> {
  const d = await db();
  const ids = (await d.getAll('jobs')).filter(pred).map((j) => j.id);
  const tx = d.transaction(['jobs', 'queue'], 'readwrite');
  for (const id of ids) {
    await tx.objectStore('jobs').delete(id);
    for (const k of await tx.objectStore('queue').index('jobId').getAllKeys(id))
      await tx.objectStore('queue').delete(k);
  }
  await tx.done;
  if (ids.length) await bumpJobsVersion();
  return ids.length;
}

export function deleteClosedJobs(): Promise<number> {
  return deleteWhere((j) => j.status === 'closed');
}

/** Deletes jobs not seen within the retention window. Null keeps them forever. */
export function retentionCleanup(retentionDays: number | null, now = Date.now()): Promise<number> {
  if (retentionDays == null) return Promise.resolve(0);
  const cutoff = now - retentionDays * DAY;
  return deleteWhere((j) => j.lastSeenAt < cutoff);
}

export async function putSampleJobs(jobs: JobRecord[]): Promise<void> {
  const d = await db();
  const tx = d.transaction('jobs', 'readwrite');
  for (const j of jobs) await tx.store.put(j);
  await tx.done;
  await bumpJobsVersion();
}

export function clearSampleJobs(): Promise<number> {
  return deleteWhere((j) => !!j.sample);
}

export async function addOverride(e: OverrideEntry): Promise<void> {
  await (await db()).add('overrides', e);
}

export async function overrideHistory(dimensionId?: string): Promise<OverrideEntry[]> {
  const d = await db();
  return dimensionId ? d.getAllFromIndex('overrides', 'dimensionId', dimensionId) : d.getAll('overrides');
}

export async function jobCounts(): Promise<Record<string, number>> {
  const jobs = await allJobs();
  const out: Record<string, number> = {
    total: jobs.length,
    open: 0,
    closed: 0,
    unknown: 0,
    preliminary: 0,
    notScored: 0,
  };
  for (const j of jobs) {
    out[j.status] = (out[j.status] ?? 0) + 1;
    if (j.preliminary) out.preliminary!++;
    if (j.scoring !== 'scored') out.notScored!++;
  }
  return out;
}
