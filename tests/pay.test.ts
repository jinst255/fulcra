import { describe, expect, it } from 'vitest';
import { isPayOutlier, payGoal, payScore, takeHome, weeklyPay, correctedPeriod } from '../src/core/pay';
import { SAMPLE_JOBS } from '../src/dev/sample';
import { sampleJobs } from './helpers';

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
});
