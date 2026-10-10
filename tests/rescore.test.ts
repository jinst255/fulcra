import { describe, expect, it } from 'vitest';
import { addDimension, editDimension, MAX_DIMENSIONS, removeDimension } from '../src/core/dimensions';
import { learningSuggestion } from '../src/core/learning';
import { isSmallBatch, planRescore } from '../src/core/rescore';
import { sampleJobs, sampleSettings } from './helpers';

describe('re-scoring (12.4)', () => {
  it('plans pending scores for a new dimension and outdated ones for an edit', () => {
    const s = sampleSettings();
    let dims = addDimension(s.dimensions, {
      name: 'Commute',
      definition: 'How long the trip is',
      anchorLow: 'Long',
      anchorHigh: 'None',
    });
    let plan = planRescore(sampleJobs(), dims, 'standard');
    expect(plan.tasks.length).toBe(8);
    expect(plan.kind).toBe('new');
    expect(plan.tasks[0]!.dimIds).toEqual(['commute']);
    expect(plan.cost).toBeCloseTo(8 * 0.000736);
    expect(isSmallBatch(plan.tasks.length, plan.cost)).toBe(true);

    dims = editDimension(s.dimensions, 'risk', {
      name: 'Risk',
      definition: 'Changed',
      anchorLow: 'a',
      anchorHigh: 'b',
    });
    expect(dims.find((d) => d.id === 'risk')!.version).toBe(2);
    plan = planRescore(sampleJobs(), dims, 'standard');
    expect(plan.kind).toBe('edit');
    expect(plan.tasks.every((t) => t.dimIds[0] === 'risk')).toBe(true);
  });

  it('hides removed dimensions and restores them by id', () => {
    const s = sampleSettings();
    const removed = removeDimension(s.dimensions, 'impact');
    expect(removed.find((d) => d.id === 'impact')!.active).toBe(false);
    const restored = addDimension(
      removed,
      { name: '', definition: '', anchorLow: '', anchorHigh: '' },
      'impact',
    );
    expect(restored.find((d) => d.id === 'impact')!.active).toBe(true);
    expect(planRescore(sampleJobs(), restored, 'standard').tasks).toEqual([]);
    expect(removeDimension(s.dimensions, 'pay').find((d) => d.id === 'pay')!.active).toBe(true);
  });

  it('caps dimensions at 12', () => {
    let dims = sampleSettings().dimensions;
    for (let i = 0; i < 10; i++)
      dims = addDimension(dims, { name: `Extra ${i}`, definition: '', anchorLow: '', anchorHigh: '' });
    expect(dims.length).toBe(MAX_DIMENSIONS);
  });
});

describe('learning from overrides (12.6)', () => {
  const entry = (m: number, u: number, at: number) => ({
    jobId: 'j',
    dimensionId: 'impact',
    modelScore: m,
    userScore: u,
    at,
  });
  it('suggests after five same-direction overrides of 2 or more', () => {
    const h = [1, 2, 3, 4].map((i) => entry(5, 8, i));
    expect(learningSuggestion(h, 'impact', undefined)).toBeNull();
    h.push(entry(4, 6, 5));
    expect(learningSuggestion(h, 'impact', undefined)).toBe('up');
    expect(learningSuggestion(h, 'impact', Date.now() + 1000)).toBeNull();
    h.push(entry(6, 5, 6));
    expect(learningSuggestion(h, 'impact', undefined)).toBeNull();
  });
});
