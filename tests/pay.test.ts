import { describe, expect, it } from 'vitest';
import {
  convertPay,
  correctedPeriod,
  inBasis,
  payBasis,
  payMeasure,
  isPayOutlier,
  obviousPeriod,
  payGoal,
  payScore,
  statedPeriod,
  takeHome,
  thousandsFix,
  weeklyPay,
} from '../src/core/pay';
import { SAMPLE_JOBS } from '../src/dev/sample';
import { job, sampleJobs } from './helpers';

describe('pay math (5.5)', () => {
  it('reproduces every sample take-home and pay score exactly', () => {
    const jobs = sampleJobs();
    for (const s of SAMPLE_JOBS) {
      const j = jobs.find((x) => x.id === `sample-${s.id}`)!;
      const T = takeHome(j.facts, 22).total!;
      expect(Math.round(T)).toBe(s.takeHome);
      expect(payScore(T, 30000)).toBe(s.scores[0]);
    }
  });

  it('converts each period to weekly pay', () => {
    const pay = (min: number, max: number, period: 'hour' | 'week' | 'month' | 'year' | 'total') => ({
      min,
      max,
      period,
      currency: 'USD',
      is_estimate: false,
    });
    expect(weeklyPay(pay(20, 30, 'hour'), 20, 10, 52).weekly).toBe(500);
    expect(weeklyPay(pay(20, 20, 'hour'), null, 10, 52)).toEqual({ weekly: 800, hoursEstimated: true });
    expect(weeklyPay(pay(900, 900, 'week'), null, null, 52).weekly).toBe(900);
    expect(weeklyPay(pay(5200, 5200, 'month'), null, null, 52).weekly).toBe(1200);
    expect(weeklyPay(pay(52000, 52000, 'year'), null, null, 52).weekly).toBe(1000);
    expect(weeklyPay(pay(10000, 10000, 'total'), null, 20, 52).weekly).toBe(500);
    expect(weeklyPay(pay(10000, 10000, 'total'), null, null, 25).weekly).toBe(400);
  });

  it('clamps and subtracts known costs', () => {
    expect(payScore(60000, 30000)).toBe(10);
    expect(payScore(-5, 30000)).toBe(1);
    expect(payScore(null, 30000)).toBeNull();
    const j = sampleJobs()[0]!;
    expect(takeHome(j.facts, 22, 1320).total).toBeCloseTo(12000);
  });

  it('uses the best open take-home when there is no goal', () => {
    const jobs = sampleJobs();
    expect(payGoal(null, jobs, 22)).toBe(26700);
    expect(payGoal(30000, jobs, 22)).toBe(30000);
  });

  it('compares pay rates when there is no time frame', () => {
    const f = (
      min: number,
      period: 'hour' | 'year' | 'total',
      hours: number | null,
      weeks: number | null,
    ) => ({
      ...job('analyst').facts,
      pay: { min, max: min, period, currency: 'USD', is_estimate: false },
      hours_per_week: hours,
      duration_weeks: weeks,
    });
    // Part time at $25 an hour beats full time at $20 an hour per hour, not per year.
    expect(payMeasure(f(25, 'hour', 20, null), { per: 'hour' }).total).toBe(25);
    expect(payMeasure(f(52000, 'year', null, null), { per: 'hour' })).toMatchObject({
      total: 25,
      estimate: true,
    });
    expect(payMeasure(f(25, 'hour', 20, null), { per: 'year' }).total).toBe(26000);
    // Length doesn't count without a time frame; it does with one.
    expect(payMeasure(f(20, 'hour', 40, 10), { per: 'year' }).total).toBe(41600);
    expect(payMeasure(f(20, 'hour', 40, 10), { per: 'window', weeks: 52 }).total).toBe(8000);
    expect(payMeasure(f(20, 'hour', 40, 10), { per: 'hour' }, 500, true).total).toBe(0);
  });

  it("turns a goal in the person's unit into the comparison basis", () => {
    expect(payBasis({ windowWeeks: null, payUnit: 'hour' })).toEqual({ per: 'hour' });
    expect(payBasis({ windowWeeks: null, payUnit: 'total' })).toEqual({ per: 'year' });
    expect(payBasis({ windowWeeks: 26, payUnit: 'hour' })).toEqual({ per: 'window', weeks: 26 });
    expect(inBasis(20, 'hour', { per: 'window', weeks: 26 })).toBe(20800);
    expect(inBasis(52000, 'year', { per: 'window', weeks: 26 })).toBe(26000);
    expect(inBasis(30000, 'total', { per: 'window', weeks: 22 })).toBe(30000);
    expect(inBasis(41600, 'year', { per: 'hour' })).toBe(20);
    expect(inBasis(20, 'hour', { per: 'year' })).toBe(41600);
    expect(convertPay(20, 'hour', 'year', null)).toBe(41600);
    expect(convertPay(41600, 'year', 'hour', null)).toBe(20);
    expect(convertPay(20, 'hour', 'total', 26)).toBe(20800);
  });

  it('flags pay-unit outliers (5.6)', () => {
    const p = (n: number, period: 'hour' | 'year' | 'week' | 'month') => ({
      min: n,
      max: n,
      period,
      currency: 'USD',
      is_estimate: false,
    });
    expect(isPayOutlier(p(16, 'year'))).toBe(true);
    expect(isPayOutlier(p(16, 'hour'))).toBe(false);
    expect(isPayOutlier(p(2, 'hour'))).toBe(true);
    expect(isPayOutlier(p(600, 'hour'))).toBe(true);
    expect(isPayOutlier(p(50, 'week'))).toBe(true);
    expect(isPayOutlier(p(90000, 'month'))).toBe(true);
    expect(isPayOutlier(p(60000, 'year'))).toBe(false);
    expect(correctedPeriod('year', 'hour')).toEqual({ from: 'year', to: 'hour' });
    expect(correctedPeriod('year', 'unchanged')).toBeNull();
  });

  it('finds the unit written next to an amount', () => {
    expect(statedPeriod('$110K-$130K / year', 120000)).toBe('year');
    expect(statedPeriod('Pay: $18.50 an hour', 18.5)).toBe('hour');
    expect(statedPeriod('$52,000 per yr, plus $500/wk stipend', 52000)).toBe('year');
    expect(statedPeriod('$52,000 per yr, plus $500/wk stipend', 500)).toBe('week');
    expect(statedPeriod('Competitive pay', 20)).toBeNull();
  });

  it('fixes only the obvious pay mistakes', () => {
    const p = (n: number, period: 'hour' | 'year' | 'week' | 'month') => ({
      min: n,
      max: n,
      period,
      currency: 'USD',
      is_estimate: false,
    });
    expect(obviousPeriod(p(110000, 'hour'), 'no unit here')?.to).toBe('year');
    expect(obviousPeriod(p(1500, 'hour'), 'no unit here')).toBeNull();
    expect(obviousPeriod(p(1500, 'hour'), '$1,500 a month')?.to).toBe('month');
    expect(obviousPeriod(p(20, 'hour'), '')).toBeNull();
    expect(thousandsFix(p(95, 'year'), 'Salary $95k')?.min).toBe(95000);
    expect(thousandsFix(p(95, 'year'), 'Salary 95')).toBeNull();
  });
});
