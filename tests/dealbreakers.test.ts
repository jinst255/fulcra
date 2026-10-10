import { describe, expect, it } from 'vitest';
import { evaluateDealbreakers, missingLanguages } from '../src/core/dealbreakers';
import { rankJobs } from '../src/core/rank';
import { job, sampleJobs, sampleSettings } from './helpers';

describe('dealbreakers', () => {
  it('fails Tutoring and the TA job on the $8,000 minimum, five open jobs pass', () => {
    const view = rankJobs(sampleJobs(), sampleSettings());
    const failing = view.all.filter((r) => r.fails.length).map((r) => r.job.facts.title);
    expect(failing).toEqual(['Math and coding tutor', 'Math teaching assistant']);
    expect(view.openPass.length).toBe(5);
  });

  it('never fails on unknown facts', () => {
    const s = sampleSettings();
    const j = job('analyst');
    const rules = { ...s.dealbreakers, mustRemote: true, noRelocation: true, maxHours: 10 };
    j.facts.hours_per_week = null;
    expect(evaluateDealbreakers(j.facts, null, rules, s.about.languages)).toEqual([]);
  });

  it('checks hours, remote, relocation, job type, and language', () => {
    const s = sampleSettings();
    const j = job('sales');
    j.facts.languages_required = ['English', 'Portuguese'];
    const rules = {
      minTakeHome: null,
      maxHours: 50,
      mustRemote: true,
      noRelocation: true,
      excludeTypes: ['seasonal' as const],
      languageGap: true,
    };
    expect(evaluateDealbreakers(j.facts, 26700, rules, s.about.languages)).toEqual([
      'maxHours',
      'remote',
      'relocation',
      'jobType',
      'language',
    ]);
  });

  it('matches languages loosely', () => {
    expect(
      missingLanguages(
        ['spanish (fluent)', 'English'],
        [
          { name: 'Spanish', level: 'fluent' },
          { name: 'English', level: 'native' },
        ],
      ),
    ).toEqual([]);
    expect(missingLanguages(['German'], [{ name: 'English', level: 'native' }])).toEqual(['German']);
  });
});
