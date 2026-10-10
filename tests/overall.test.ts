import { describe, expect, it } from 'vitest';
import { overallScore } from '../src/core/overall';
import { presetWeights, matchPreset } from '../src/core/presets';
import { rankJobs, movement } from '../src/core/rank';
import { defaultDimensions } from '../src/core/dimensions';
import { sampleJobs, sampleSettings } from './helpers';

describe('overall score (5.7) and ranking', () => {
  it('ranks the sample jobs as section 23.4 says under Balanced', () => {
    const view = rankJobs(sampleJobs(), sampleSettings());
    const rows = view.openPass.map((r) => [r.job.facts.title, r.value.toFixed(1)]);
    expect(rows).toEqual([
      ['Software dev internship', '7.3'],
      ['Contract AI work', '6.6'],
      ['Junior data analyst', '5.9'],
      ['Summer sales rep', '3.6'],
      ['Warehouse associate', '3.6'],
    ]);
  });

  it('puts the sales job first under Max money with the 9.2 wording numbers', () => {
    const s = sampleSettings();
    s.weights = presetWeights('money', s.dimensions);
    const view = rankJobs(sampleJobs(), s);
    const best = view.openPass[0]!;
    expect(best.job.facts.title).toBe('Summer sales rep');
    expect(best.value.toFixed(1)).toBe('6.6');
    expect(best.parts.pay!.toFixed(1)).toBe('5.6');
  });

  it('skips missing scores and uses equal weights when all are zero', () => {
    const dims = defaultDimensions();
    const scores: Record<string, number | null> = { pay: 10, enjoyment: 0, impact: null };
    const w = Object.fromEntries(dims.map((d) => [d.id, 0]));
    const o = overallScore((d) => scores[d.id] ?? null, dims, w);
    expect(o.value).toBe(5);
    expect(o.counted).toEqual(['pay', 'enjoyment']);
  });

  it('uses overrides in place of the model score', () => {
    const jobs = sampleJobs();
    jobs[1]!.scores.impact!.override = 10;
    const view = rankJobs(jobs, sampleSettings());
    expect(view.byId.get(jobs[1]!.id)!.value.toFixed(1)).toBe((51 / 7).toFixed(1));
  });

  it('matches presets and reports movement', () => {
    const dims = defaultDimensions();
    expect(matchPreset(presetWeights('life', dims), dims)).toBe('life');
    expect(matchPreset({ ...presetWeights('life', dims), pay: 9 }, dims)).toBe('custom');
    expect(movement(['a', 'b', 'c'], ['c', 'a', 'b'], 'c')).toBe(2);
    expect(movement(['a', 'b', 'c'], ['c', 'a', 'b'], 'a')).toBe(-1);
  });
});
