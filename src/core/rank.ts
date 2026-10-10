// Puts pay, overall score, and dealbreakers together for every job, so the
// ranked list, radar, popup, and notifications all rank the same way.
import { evaluateDealbreakers, type FailReason } from './dealbreakers';
import { effectiveScore, overallScore } from './overall';
import { payGoal, payScore, round1, takeHome, type TakeHome } from './pay';
import { weightOf } from './presets';
import type { Dimension, JobRecord, JobType, Settings } from './types';

export interface RankedJob {
  job: JobRecord;
  take: TakeHome;
  pay: number | null;
  value: number;
  parts: Record<string, number>;
  fails: FailReason[];
  /** True when at least one model dimension has a score. */
  scored: boolean;
}

export interface RankView {
  dims: Dimension[];
  windowWeeks: number;
  goal: number;
  all: RankedJob[];
  /** Scored open jobs that pass every dealbreaker, best first. */
  openPass: RankedJob[];
  passingIds: string[];
  byId: Map<string, RankedJob>;
  scoreOf: (r: RankedJob, d: Dimension) => number | null;
  weight: (d: Dimension) => number;
}

export function byValue(a: RankedJob, b: RankedJob): number {
  // Ties within float noise fall back to the older job first.
  if (Math.abs(b.value - a.value) > 1e-9) return b.value - a.value;
  return a.job.addedAt - b.job.addedAt;
}

/** The model found the text wasn't a job offer (a newsletter or promotion, say). */
export function isNotAJob(job: JobRecord): boolean {
  return job.flags.includes('not_a_job');
}

/** The jobs of the given types; every job when no type is picked. */
export function ofTypes(jobs: JobRecord[], types: JobType[]): JobRecord[] {
  if (!types.length) return jobs;
  const want = new Set(types);
  return jobs.filter((j) => want.has(j.facts.job_type));
}

/** Fewest scored open jobs before spreading means anything. */
export const SPREAD_MIN_JOBS = 3;

export interface Scale {
  min: number;
  max: number;
}

/** Each model dimension's lowest and highest model score across scored, open jobs. */
export function spreadScales(jobs: JobRecord[], dims: Dimension[]): Map<string, Scale> {
  const out = new Map<string, Scale>();
  const pool = jobs.filter((j) => j.status !== 'closed' && j.scoring === 'scored' && !isNotAJob(j));
  if (pool.length < SPREAD_MIN_JOBS) return out;
  for (const d of dims) {
    if (d.computedByApp) continue;
    let min = Infinity;
    let max = -Infinity;
    for (const j of pool) {
      const s = j.scores[d.id]?.score;
      if (s == null) continue;
      min = Math.min(min, s);
      max = Math.max(max, s);
    }
    // Too little difference to stretch: spreading would turn noise into big gaps.
    if (max - min >= 1) out.set(d.id, { min, max });
  }
  return out;
}

/** Maps a model score onto 1 to 10 within its dimension's range. */
export function spreadScore(score: number, sc: Scale | undefined): number {
  if (!sc) return score;
  const v = 1 + (9 * (score - sc.min)) / (sc.max - sc.min);
  return round1(Math.max(1, Math.min(10, v)));
}

export function rankJobs(jobs: JobRecord[], settings: Settings): RankView {
  const W = settings.about.windowWeeks > 0 ? settings.about.windowWeeks : 52;
  const dims = settings.dimensions.filter((d) => d.active);
  const goal = payGoal(settings.about.payGoal, jobs, W);
  const scales = settings.scoring.spread ? spreadScales(jobs, dims) : new Map<string, Scale>();
  /** Your own score as given; the model's score spread across your jobs. */
  const shown = (job: JobRecord, d: Dimension, pay: number | null): number | null => {
    const s = effectiveScore(job, d, pay);
    if (s == null || d.computedByApp || job.scores[d.id]?.override != null) return s;
    return spreadScore(s, scales.get(d.id));
  };
  const all: RankedJob[] = jobs.map((job) => {
    const take = takeHome(job.facts, W, job.knownCosts, job.flags.includes('unpaid'));
    const scored = job.scoring === 'scored' || Object.keys(job.scores).length > 0;
    const pay = scored ? payScore(take.total, goal) : null;
    const o = overallScore((d) => shown(job, d, pay), dims, settings.weights);
    const fails = evaluateDealbreakers(
      job.facts,
      take.total,
      settings.dealbreakers,
      settings.about.languages,
      job.flags,
    );
    return { job, take, pay, value: scored ? o.value : 0, parts: o.parts, fails, scored };
  });
  // Unscored jobs don't take a rank; the list shows them in their own group.
  const openPass = all
    .filter((x) => x.scored && x.job.status !== 'closed' && x.fails.length === 0 && !isNotAJob(x.job))
    .sort(byValue);
  return {
    dims,
    windowWeeks: W,
    goal,
    all,
    openPass,
    passingIds: openPass.map((x) => x.job.id),
    byId: new Map(all.map((x) => [x.job.id, x])),
    scoreOf: (r, d) => shown(r.job, d, r.pay),
    weight: (d) => weightOf(settings.weights, d.id),
  };
}

/** Movement since the baseline order: positive means the job moved up. */
export function movement(baseline: string[], now: string[], id: string): number {
  const before = baseline.indexOf(id);
  const after = now.indexOf(id);
  if (before < 0 || after < 0) return 0;
  return before - after;
}
