import { describe, expect, it } from 'vitest';
import { dedupeKey, mergeJobs, normalize } from '../src/core/dedupe';
import { job } from './helpers';

describe('dedupe (12.3)', () => {
  it('prefers the site id, else normalized company, title, location', () => {
    expect(dedupeKey({ site: 'linkedin', siteJobId: '123', title: 'x' })).toBe('linkedin:123');
    expect(
      dedupeKey({
        company: 'Northbeam, Inc.',
        title: 'Software Dev Internship!',
        location: 'Salt Lake City, UT',
      }),
    ).toBe('northbeam inc|software dev internship|salt lake city ut');
    expect(normalize('Café  Résumé')).toBe('cafe resume');
  });

  it('keeps the full score over a preliminary one and keeps overrides', () => {
    const prelim = job('analyst');
    prelim.scores.impact!.override = 9;
    const full = {
      ...job('analyst'),
      id: 'new',
      preliminary: false,
      listingText: 'A much longer listing text '.repeat(10),
      status: 'open' as const,
    };
    full.scores = Object.fromEntries(
      Object.entries(full.scores).map(([k, v]) => [k, { ...v, state: 'current' as const, score: 7 }]),
    );
    const merged = mergeJobs(prelim, full);
    expect(merged.id).toBe(prelim.id);
    expect(merged.preliminary).toBe(false);
    expect(merged.scores.enjoyment!.score).toBe(7);
    expect(merged.scores.impact!.override).toBe(9);
    expect(merged.status).toBe('open');
  });
});
