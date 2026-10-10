// Take-home pay, the pay score, and the pay-unit outlier check. Blueprint sections 5.5 and 5.6.
import type { Facts, JobRecord, Pay, PayPeriod } from './types';

export const DEFAULT_HOURS = 40;

export interface TakeHome {
  /** Take-home over the window, before tax. Null when pay can't be worked out. */
  total: number | null;
  /** Weeks counted: min(job length, window). */
  weeks: number;
  /** True when the pay or the hours were estimated. */
  estimate: boolean;
}

/** The middle of the pay range. Zero pay is treated as missing: listings almost never mean it. */
function midpoint(pay: Pay): number | null {
  const lo = pay.min ?? pay.max;
  const hi = pay.max ?? pay.min;
  if (lo == null || hi == null || hi <= 0) return null;
  return (lo + hi) / 2;
}

/** Weekly pay p_w from the midpoint rate. */
export function weeklyPay(
  pay: Pay,
  hoursPerWeek: number | null,
  durationWeeks: number | null,
  windowWeeks: number,
): { weekly: number | null; hoursEstimated: boolean } {
  const r = midpoint(pay);
  if (r == null) return { weekly: null, hoursEstimated: false };
  const d = durationWeeks && durationWeeks > 0 ? durationWeeks : windowWeeks;
  switch (pay.period) {
    case 'hour':
      return {
        weekly: r * (hoursPerWeek && hoursPerWeek > 0 ? hoursPerWeek : DEFAULT_HOURS),
        hoursEstimated: !hoursPerWeek,
      };
    case 'week':
      return { weekly: r, hoursEstimated: false };
    case 'month':
      return { weekly: (r * 12) / 52, hoursEstimated: false };
    case 'year':
      return { weekly: r / 52, hoursEstimated: false };
    case 'total':
      return { weekly: r / d, hoursEstimated: false };
    default:
      return { weekly: null, hoursEstimated: false };
  }
}

/** T = p_w × min(d, W) − c. A job flagged unpaid takes home nothing. */
export function takeHome(facts: Facts, windowWeeks: number, knownCosts = 0, unpaid = false): TakeHome {
  const d = facts.duration_weeks && facts.duration_weeks > 0 ? facts.duration_weeks : windowWeeks;
  const weeks = Math.min(d, windowWeeks);
  if (unpaid) return { total: -knownCosts, weeks, estimate: false };
  const { weekly, hoursEstimated } = weeklyPay(
    facts.pay,
    facts.hours_per_week,
    facts.duration_weeks,
    windowWeeks,
  );
  if (weekly == null) return { total: null, weeks, estimate: true };
  return { total: weekly * weeks - knownCosts, weeks, estimate: facts.pay.is_estimate || hoursEstimated };
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** s = 1 + 9 · min(1, max(0, T / G)), rounded to one decimal. */
export function payScore(total: number | null, goal: number): number | null {
  if (total == null) return null;
  const g = goal > 0 ? goal : 1;
  return round1(1 + 9 * Math.min(1, Math.max(0, total / g)));
}

/**
 * G: the user's pay goal, or the largest take-home among open, scored jobs
 * so the best-paying job scores 10.
 */
export function payGoal(goal: number | null, jobs: JobRecord[], windowWeeks: number): number {
  if (goal && goal > 0) return goal;
  let best = 0;
  for (const j of jobs) {
    if (j.status === 'closed' || j.scoring !== 'scored') continue;
    const T = takeHome(j.facts, windowWeeks, j.knownCosts).total;
    if (T != null && T > best) best = T;
  }
  return best > 0 ? best : 1;
}

/** Rounds for display: nearest $100 at or above $1,000. */
export function approxAmount(n: number): number {
  return n >= 1000 ? Math.round(n / 100) * 100 : Math.round(n);
}

export function formatMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

const OUTLIER_BOUNDS: Partial<Record<PayPeriod, [number, number]>> = {
  hour: [3, 500],
  week: [100, 20000],
  month: [400, 80000],
  year: [5000, 2000000],
};

/** True when the midpoint is orders of magnitude off for its unit (section 5.6). */
export function isPayOutlier(pay: Pay): boolean {
  const r = midpoint(pay);
  const b = OUTLIER_BOUNDS[pay.period];
  if (r == null || !b || r <= 0) return false;
  return r < b[0] || r > b[1];
}

/** Applies a model's unit answer. Returns null when nothing changes. */
export function correctedPeriod(
  current: PayPeriod,
  answer: PayPeriod | 'unchanged',
): { from: PayPeriod; to: PayPeriod } | null {
  if (answer === 'unchanged' || answer === current || answer === 'unknown') return null;
  return { from: current, to: answer };
}
