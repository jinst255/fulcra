// Puts pay, overall score, and dealbreakers together for every job, so the
// ranked list, radar, popup, and notifications all rank the same way.
import { evaluateDealbreakers, type FailReason } from './dealbreakers';
import { effectiveScore, overallScore } from './overall';
import { payGoal, payScore, takeHome, type TakeHome } from './pay';
import { weightOf } from './presets';
import type { Dimension, JobRecord, Settings } from './types';

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

export function rankJobs(jobs: JobRecord[], settings: Settings): RankView {
  const W = settings.about.windowWeeks > 0 ? settings.about.windowWeeks : 52;
  const dims = settings.dimensions.filter((d) => d.active);
  const goal = payGoal(settings.about.payGoal, jobs, W);
  const all: RankedJob[] = jobs.map((job) => {
    const take = takeHome(job.facts, W, job.knownCosts);
    const scored = job.scoring === 'scored' || Object.keys(job.scores).length > 0;
    const pay = scored ? payScore(take.total, goal) : null;
    const o = overallScore((d) => effectiveScore(job, d, pay), dims, settings.weights);
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
    .filter((x) => x.scored && x.job.status !== 'closed' && x.fails.length === 0)
    .sort(byValue);
  return {
    dims,
    windowWeeks: W,
    goal,
    all,
    openPass,
    passingIds: openPass.map((x) => x.job.id),
    byId: new Map(all.map((x) => [x.job.id, x])),
    scoreOf: (r, d) => effectiveScore(r.job, d, r.pay),
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
