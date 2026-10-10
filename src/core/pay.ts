// Take-home pay, the pay score, and the pay-unit outlier check. Blueprint sections 5.5 and 5.6.
import { t } from '../i18n/t';
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

const UNIT_WORDS: [RegExp, PayPeriod][] = [
  [/^(hour|hr|h)\b/, 'hour'],
  [/^(year|yr|annum|annual|annually)\b/, 'year'],
  [/^(month|mo)\b/, 'month'],
  [/^(week|wk)\b/, 'week'],
];

const unitWord = (p: PayPeriod) => t(`period.${p === 'unknown' ? 'total' : p}`).toLowerCase();

/** "110K" or "110,000" or "18.50" as a number. */
function moneyValue(num: string, k: string | undefined): number {
  const n = Number(num.replace(/,/g, ''));
  return k ? n * 1000 : n;
}

/**
 * The unit the listing writes next to an amount close to `amount`: "$110K / year", "$18 an hour",
 * "$52,000 per yr", "$20/hr". Null when the listing doesn't say.
 */
export function statedPeriod(listing: string, amount: number): PayPeriod | null {
  const re =
    /\$\s?([\d.,]+)\s?([kK])?(?:\s?[-–]\s?\$?\s?([\d.,]+)\s?([kK])?)?\s*(?:\/|per\b|an?\b|each\b)\s*([a-zA-Z]+)/g;
  for (const m of listing.matchAll(re)) {
    const lo = moneyValue(m[1]!, m[2]);
    const hi = m[3] ? moneyValue(m[3], m[4] ?? m[2]) : lo;
    if (!(amount >= lo * 0.67 && amount <= hi * 1.5)) continue;
    const word = m[5]!.toLowerCase();
    const hit = UNIT_WORDS.find(([w]) => w.test(word));
    if (hit) return hit[1];
  }
  return null;
}

/** Units in which this amount is a believable rate. */
export function plausiblePeriods(amount: number): PayPeriod[] {
  return (Object.keys(OUTLIER_BOUNDS) as PayPeriod[]).filter((p) => {
    const [lo, hi] = OUTLIER_BOUNDS[p]!;
    return amount >= lo && amount <= hi;
  });
}

/**
 * Fixes a pay unit that can't be right without asking the model: the unit the listing states, or
 * the only unit the amount makes sense in ($110,000 can only be yearly). Null when it can't tell.
 */
export function obviousPeriod(pay: Pay, listing: string): { to: PayPeriod; reason: string } | null {
  if (!isPayOutlier(pay)) return null;
  const r = midpoint(pay)!;
  const stated = statedPeriod(listing, r);
  if (stated && stated !== pay.period && !isPayOutlier({ ...pay, period: stated }))
    return { to: stated, reason: t('pay.fix.stated', { unit: unitWord(stated) }) };
  const fits = plausiblePeriods(r);
  if (fits.length === 1 && fits[0] !== pay.period)
    return {
      to: fits[0]!,
      reason: t('pay.fix.onlyFits', {
        amount: formatMoney(r),
        unit: unitWord(fits[0]!),
      }),
    };
  return null;
}

/**
 * "$110K" read as 110: when the listing writes the amount with a K and the thousands make sense in
 * the stated unit, returns the pay in full. Null otherwise.
 */
export function thousandsFix(pay: Pay, listing: string): Pay | null {
  if (!isPayOutlier(pay)) return null;
  const r = midpoint(pay)!;
  if (r >= 1000) return null;
  const amount = String(pay.min ?? pay.max).replace('.', '\\.');
  if (!new RegExp(`\\$\\s?${amount}\\s?[kK]\\b`).test(listing)) return null;
  const scaled: Pay = {
    ...pay,
    min: pay.min == null ? null : pay.min * 1000,
    max: pay.max == null ? null : pay.max * 1000,
  };
  return isPayOutlier(scaled) ? null : scaled;
}

/** Applies a model's unit answer. Returns null when nothing changes. */
export function correctedPeriod(
  current: PayPeriod,
  answer: PayPeriod | 'unchanged',
): { from: PayPeriod; to: PayPeriod } | null {
  if (answer === 'unchanged' || answer === current || answer === 'unknown') return null;
  return { from: current, to: answer };
}
