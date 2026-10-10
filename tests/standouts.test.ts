import { describe, expect, it } from 'vitest';
import { presetWeights } from '../src/core/presets';
import { rankJobs } from '../src/core/rank';
import { bestFitDetail, bestFitLabel, standoutLines, topLine } from '../src/core/standouts';
import { sampleJobs, sampleSettings } from './helpers';

describe('best fit and standouts', () => {
  it('words the best fit for equal and single-priority weights', () => {
    const s = sampleSettings();
    let view = rankJobs(sampleJobs(), s);
    expect(bestFitLabel(view)).toBe('Best fit with everything weighted the same');
    s.weights = presetWeights('money', s.dimensions);
    view = rankJobs(sampleJobs(), s);
    expect(bestFitLabel(view)).toBe('Best fit if pay is your priority');
    expect(bestFitDetail(view, view.openPass[0]!)).toBe(
      'Scores 6.6 of 10. Weakest on life cost (2) and location and social (2).',
    );
    expect(topLine(view, view.openPass[0]!)).toBe('Most from pay 5.6, enjoyment 0.2');
  });

  it('names multiple priorities', () => {
    const s = sampleSettings();
    s.weights = { ...presetWeights('balanced', s.dimensions), impact: 9, life: 9 };
    expect(bestFitLabel(rankJobs(sampleJobs(), s))).toBe(
      'Best fit if impact and life cost are your priorities',
    );
  });

  it('computes what stands out among picked jobs', () => {
    const view = rankJobs(sampleJobs(), sampleSettings());
    const pick = ['sample-dev', 'sample-contract', 'sample-sales'].map((id) => view.byId.get(id)!);
    const lines = standoutLines(view, pick);
    expect(lines[0]).toBe('Clinic operations internship leads on career leverage (10).');
    expect(lines[1]).toBe('Remote scheduling contract leads on location and social (10).');
    expect(lines[2]).toBe('Summer sales rep leads on pay (9.0) but trails on life cost (2).');
    expect(lines[3]).toBe('They differ most on location and social, from 2 to 10.');
    expect(standoutLines(view, [])).toEqual(['Pick up to three jobs to compare their shapes.']);
  });
});
