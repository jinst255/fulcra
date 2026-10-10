import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultDimensions, addDimension } from '../src/core/dimensions';
import { ProviderError, type Provider } from '../src/llm/provider';
import { badgeFor } from '../src/pipeline/badge';
import { applyFullScore, newJobRecord, undoPayUnit } from '../src/pipeline/jobs';
import {
  enqueue,
  pump,
  queueSize,
  setProviderForTests,
  planAndMaybeStart,
  queueUnscored,
} from '../src/pipeline/queue';
import { resetDbForTests } from '../src/store/db';
import { getJob, putJob, putSampleJobs } from '../src/store/jobs';
import { defaultStatus, getStatus, setApiKey, updateSettings } from '../src/store/settings';
import { sampleJobs } from './helpers';

const facts = (period: 'hour' | 'year', amount: number) => ({
  title: 'Warehouse associate',
  company: 'Valley',
  location: 'Nampa, ID',
  remote: 'no' as const,
  pay: { min: amount, max: amount, period, currency: 'USD', is_estimate: false },
  hours_per_week: 40,
  duration_weeks: 21,
  job_type: 'seasonal' as const,
  commission_or_variable: 'no' as const,
  relocation_required: 'no' as const,
  languages_required: ['English'],
  status: 'open' as const,
});
const scores = Object.fromEntries(
  ['enjoyment', 'impact', 'career', 'life', 'risk', 'location'].map((id) => [
    id,
    { score: 6, reason: 'Okay.' },
  ]),
);

function fakeProvider(
  opts: { period?: 'hour' | 'year'; fail?: ProviderError } = {},
): Provider & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async testKey() {
      return 'ok';
    },
    async score(_k, req) {
      calls.push(req.onlyDims ? `dims:${req.onlyDims.join(',')}` : 'full');
      if (opts.fail) throw opts.fail;
      if (req.onlyDims)
        return {
          output: {
            scores: Object.fromEntries(req.onlyDims.map((d) => [d, { score: 4, reason: 'New.' }])),
            flags: [],
          },
          raw: '{}',
          usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 },
        };
      return {
        output: { facts: facts(opts.period ?? 'hour', 16), scores, flags: [] },
        raw: '{"ok":1}',
        usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 },
      };
    },
    async checkPayUnit() {
      calls.push('unit');
      return { unit: 'hour', reason: 'Only makes sense hourly.' };
    },
    async suggestPriorities() {
      return { weightChanges: [], newDimensions: [] };
    },
  };
}

async function settle() {
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 5));
    if ((await queueSize()) === 0) return;
  }
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
});

describe('job records', () => {
  it('builds a record with a site dedupe key and applies a full score', () => {
    const j = newJobRecord({
      source: 'page',
      sourceUrl: 'https://www.linkedin.com/jobs/view/42',
      site: 'linkedin',
      siteJobId: '42',
      text: 'Listing',
      title: 'Dev',
    });
    expect(j.dedupeKey).toBe('linkedin:42');
    expect(j.scoring).toBe('notScored');
    const out = applyFullScore(j, { facts: facts('hour', 16), scores, flags: [] }, defaultDimensions(), '{}');
    expect(out.scoring).toBe('scored');
    expect(out.scores.impact).toMatchObject({ score: 6, dimVersion: 1, state: 'current', override: null });
    expect(out.status).toBe('open');
  });
});

describe('queue', () => {
  it('scores a queued job, checks an outlier pay unit, and undoes it', async () => {
    const p = fakeProvider({ period: 'year' });
    setProviderForTests(p);
    await setApiKey('sk-test-0000000000000000');
    const j = newJobRecord({
      source: 'email',
      sourceUrl: null,
      site: null,
      siteJobId: null,
      text: 'Warehouse $16',
    });
    await putJob(j);
    await enqueue(j.id);
    await pump();
    await settle();
    const saved = (await getJob(j.id))!;
    expect(p.calls).toEqual(['full', 'unit']);
    expect(saved.facts.pay.period).toBe('hour');
    expect(saved.payUnitCorrection).toEqual({ from: 'year', to: 'hour', reason: 'Only makes sense hourly.' });
    expect(undoPayUnit(saved).facts.pay.period).toBe('year');
  });

  it('does nothing without a key, and pauses on a bad key', async () => {
    const p = fakeProvider({ fail: new ProviderError('KEY_INVALID') });
    setProviderForTests(p);
    const j = newJobRecord({ source: 'paste', sourceUrl: null, site: null, siteJobId: null, text: 'x' });
    await putJob(j);
    await enqueue(j.id);
    await pump();
    expect(p.calls).toEqual([]);
    await setApiKey('sk-test-0000000000000000');
    await pump();
    await new Promise((r) => setTimeout(r, 30));
    expect((await getStatus()).scoringBlocked).toBe('KEY_INVALID');
    expect(await queueSize()).toBe(1);
    expect((await getJob(j.id))!.scoring).toBe('notScored');
  });

  it('marks a job "Couldn\'t score" after bad JSON', async () => {
    setProviderForTests(fakeProvider({ fail: new ProviderError('BAD_JSON') }));
    await setApiKey('sk-test-0000000000000000');
    const j = newJobRecord({ source: 'paste', sourceUrl: null, site: null, siteJobId: null, text: 'x' });
    await putJob(j);
    await enqueue(j.id);
    await pump();
    await settle();
    expect((await getJob(j.id))!).toMatchObject({ scoring: 'failed', scoreError: 'BAD_JSON' });
  });

  it('re-scores only a new dimension as a small batch with progress', async () => {
    const p = fakeProvider();
    setProviderForTests(p);
    await setApiKey('sk-test-0000000000000000');
    await putSampleJobs(sampleJobs().slice(0, 3));
    await updateSettings((s) => {
      s.dimensions = addDimension(s.dimensions, {
        name: 'Commute',
        definition: 'Trip',
        anchorLow: 'Long',
        anchorHigh: 'None',
      });
    });
    await planAndMaybeStart();
    expect((await getStatus()).batch).toMatchObject({ label: 'Commute', total: 3, done: 0 });
    await settle();
    expect(p.calls).toEqual(['dims:commute', 'dims:commute', 'dims:commute']);
    expect((await getJob('sample-dev'))!.scores.commute).toMatchObject({ score: 4, dimVersion: 1 });
    expect((await getStatus()).batch).toBeNull();
  });

  it('asks before scoring a large backlog', async () => {
    setProviderForTests(fakeProvider());
    await setApiKey('sk-test-0000000000000000');
    for (let i = 0; i < 12; i++)
      await putJob({
        ...newJobRecord({
          source: 'email',
          sourceUrl: null,
          site: null,
          siteJobId: null,
          text: 'x',
          title: `Job ${i}`,
        }),
      });
    await queueUnscored();
    expect((await getStatus()).askBatch).toMatchObject({ kind: 'unscored', count: 12 });
    expect(await queueSize()).toBe(0);
  });
});

describe('badge', () => {
  it('shows attention, working, and new counts', () => {
    expect(badgeFor({ ...defaultStatus(), scoringBlocked: 'NO_CREDIT' }).text).toBe('!');
    expect(badgeFor({ ...defaultStatus(), emailRunning: true }).text).toBe('…');
    expect(badgeFor({ ...defaultStatus(), newScoredCount: 3 })).toMatchObject({
      text: '3',
      color: '#0F6B5F',
    });
    expect(badgeFor(defaultStatus()).text).toBe('');
  });
});
