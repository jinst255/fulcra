// Re-scoring planner. Blueprint section 12.4.
// Weight changes need no calls. New dimensions are "pending" until scored;
// edited dimensions are "outdated" (still used for ranking) until re-scored.
import { costPerDimension, costPerJob } from '../llm/cost';
import { modelDimensions } from './dimensions';
import type { Dimension, JobRecord, ModelChoice } from './types';

export interface RescoreTask {
  jobId: string;
  dimIds: string[];
}

export interface RescorePlan {
  tasks: RescoreTask[];
  cost: number;
  /** Dimension names involved, for the banner. */
  dimNames: string[];
  kind: 'new' | 'edit' | 'mixed';
}

export function staleDimensions(
  job: JobRecord,
  dims: Dimension[],
): { pending: string[]; outdated: string[] } {
  const pending: string[] = [];
  const outdated: string[] = [];
  for (const d of modelDimensions(dims)) {
    const s = job.scores[d.id];
    if (!s) pending.push(d.id);
    else if (s.dimVersion < d.version) outdated.push(d.id);
  }
  return { pending, outdated };
}

/** Jobs that already have scores but miss or have outdated scores for some dimensions. */
export function planRescore(jobs: JobRecord[], dims: Dimension[], model: ModelChoice): RescorePlan {
  const tasks: RescoreTask[] = [];
  const names = new Set<string>();
  let anyNew = false;
  let anyEdit = false;
  let cost = 0;
  for (const j of jobs) {
    if (j.scoring !== 'scored') continue;
    const { pending, outdated } = staleDimensions(j, dims);
    const ids = [...pending, ...outdated];
    if (!ids.length) continue;
    if (pending.length) anyNew = true;
    if (outdated.length) anyEdit = true;
    for (const id of ids) names.add(dims.find((d) => d.id === id)!.name);
    tasks.push({ jobId: j.id, dimIds: ids });
    cost += Math.min(costPerJob(model), costPerDimension(model) * ids.length);
  }
  return { tasks, cost, dimNames: [...names], kind: anyNew && anyEdit ? 'mixed' : anyNew ? 'new' : 'edit' };
}

/** Jobs "Re-score all" covers: every open job, scored or not. */
export function rescoreAllPick(j: JobRecord): boolean {
  return j.status !== 'closed' && !j.sample && j.scoring !== 'queued';
}

/** Small batches score without a progress banner. */
export function isSmallBatch(count: number, cost: number): boolean {
  return count < 10 && cost < 0.25;
}

/** Marks scores of edited dimensions as outdated so the UI can show "Updating". */
export function markOutdated(job: JobRecord, dims: Dimension[]): JobRecord {
  let changed = false;
  const scores = { ...job.scores };
  for (const d of dims) {
    const s = scores[d.id];
    if (s && s.dimVersion < d.version && s.state !== 'outdated') {
      scores[d.id] = { ...s, state: 'outdated' };
      changed = true;
    }
  }
  return changed ? { ...job, scores } : job;
}
