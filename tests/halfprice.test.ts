import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { BatchClient, type BatchInfo, type BatchLine, type BatchResult } from '../src/llm/batch';
import type { Provider } from '../src/llm/provider';
import { initHalfPrice, pollHalfPrice, setBatchClientForTests, speedUp } from '../src/pipeline/halfprice';
import { newJobRecord } from '../src/pipeline/jobs';
import { isPresent, markPresent, resetPresenceForTests } from '../src/pipeline/presence';
import { pump, queueSize, queueUnscored, setProviderForTests } from '../src/pipeline/queue';
import { db, resetDbForTests } from '../src/store/db';
import { getJob, putJob } from '../src/store/jobs';
import { getApiKey, getStatus, setApiKey } from '../src/store/settings';
import { hardReset } from '../src/pipeline/reset';
import { allJobs } from '../src/store/jobs';

const facts = {
  title: 'Front desk coordinator',
  company: 'Lakeview',
  location: 'Columbus, OH',
  remote: 'no',
  pay: { min: 18, max: 18, period: 'hour', currency: 'USD', is_estimate: false },
  hours_per_week: 40,
  duration_weeks: null,
  job_type: 'full_time',
  commission_or_variable: 'no',
  relocation_required: 'no',
  languages_required: ['English'],
  status: 'open',
};
const scores = Object.fromEntries(
  ['enjoyment', 'impact', 'career', 'life', 'risk', 'location'].map((id) => [
    id,
    { score: 7, reason: 'Fine.' },
  ]),
);
const answer = (text: string) => ({
  status_code: 200,
  body: { output: [{ type: 'message', content: [{ type: 'output_text', text }] }] },
});

class FakeBatches extends BatchClient {
  sent: BatchLine[][] = [];
  status: BatchInfo['status'] = 'in_progress';
  cancelled: string[] = [];
  deleted: string[] = [];
  /** custom_ids to answer with junk, so they fall back to a direct call. */
  junk = new Set<string>();
  constructor() {
    super(async () => new Response(''));
  }
  override async submit(_k: string, lines: BatchLine[]) {
    this.sent.push(lines);
    return `batch_${this.sent.length}`;
  }
  override async get(_k: string, id: string): Promise<BatchInfo> {
    return { id, status: this.status, input_file_id: 'in', output_file_id: 'out', error_file_id: null };
  }
  override async deleteFile(_k: string, id: string) {
    this.deleted.push(id);
  }
  override async cancel(_k: string, id: string) {
    this.cancelled.push(id);
  }
  override async results(): Promise<BatchResult[]> {
    return this.sent.flat().map((l) => ({
      custom_id: l.custom_id,
      response: answer(
        this.junk.has(l.custom_id) ? 'not json' : JSON.stringify({ facts, scores, flags: [] }),
      ),
      error: null,
    }));
  }
}

function direct(): Provider & { calls: number } {
  const p = {
    calls: 0,
    async testKey() {
      return 'ok' as const;
    },
    async score() {
      p.calls++;
      return {
        output: { facts: facts as never, scores, flags: [] },
        raw: '{}',
        usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 },
      };
    },
    async checkPayUnit() {
      return { unit: 'unchanged' as const, reason: '' };
    },
    async suggestPriorities() {
      return { weightChanges: [], newDimensions: [] };
    },
  };
  return p;
}

async function twelveNewJobs(): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < 12; i++) {
    const j = newJobRecord({
      source: 'email',
      sourceUrl: null,
      site: null,
      siteJobId: null,
      text: 'x',
      title: `Job ${i}`,
    });
    await putJob(j);
    ids.push(j.id);
  }
  return ids;
}

async function settle() {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5));
    if ((await queueSize()) === 0) return;
  }
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  resetPresenceForTests();
});

describe('half-price scoring (Batch API)', () => {
  it('while you are away, sends new jobs to OpenAI, applies results, and scores bad answers directly', async () => {
    const batches = new FakeBatches();
    setBatchClientForTests(batches);
    const p = direct();
    setProviderForTests(p);
    initHalfPrice();
    await setApiKey('sk-test-0000000000000000');
    const ids = await twelveNewJobs();
    await queueUnscored();
    expect(batches.sent).toHaveLength(1);
    expect(batches.sent[0]).toHaveLength(12);
    const body = batches.sent[0]![0]!.body as { model: string; store: boolean };
    expect(body.store).toBe(false);
    expect((await getStatus()).batch).toMatchObject({ mode: 'half', remoteIds: ['batch_1'], total: 12 });
    // Nothing goes out at full price while the batch is with OpenAI.
    await pump();
    await new Promise((r) => setTimeout(r, 20));
    expect(p.calls).toBe(0);

    await pollHalfPrice();
    expect(p.calls).toBe(0);
    expect(await queueSize()).toBe(12);

    batches.junk.add(`${ids[3]}:full`);
    batches.status = 'completed';
    await pollHalfPrice();
    await settle();
    expect(p.calls).toBe(1);
    for (const id of ids) expect((await getJob(id))!.scoring).toBe('scored');
    expect((await getJob(ids[0]!))!.scores.enjoyment).toMatchObject({ score: 7 });
    expect(batches.deleted).toEqual(['in', 'out']);
    expect((await getStatus()).batch).toBeNull();
  });

  it('Score now finishes at full price, cancelling the OpenAI batch', async () => {
    const batches = new FakeBatches();
    setBatchClientForTests(batches);
    const p = direct();
    setProviderForTests(p);
    initHalfPrice();
    await setApiKey('sk-test-0000000000000000');
    await twelveNewJobs();
    await queueUnscored();
    expect((await (await db()).getAll('queue')).every((i) => i.remote === 'batch_1')).toBe(true);
    await speedUp();
    await settle();
    expect(batches.cancelled).toEqual(['batch_1']);
    // Once the cancel finishes, the next poll deletes the batch's files.
    batches.status = 'cancelled';
    await pollHalfPrice();
    expect(batches.deleted).toEqual(['in', 'out']);
    expect(p.calls).toBe(12);
    expect((await getStatus()).batch).toBeNull();
  });

  it('a reset cancels batches still at OpenAI, then deletes everything', async () => {
    const batches = new FakeBatches();
    setBatchClientForTests(batches);
    setProviderForTests(direct());
    initHalfPrice();
    await setApiKey('sk-test-0000000000000000');
    await twelveNewJobs();
    await queueUnscored();
    await hardReset();
    expect(batches.cancelled).toEqual(['batch_1']);
    expect(batches.deleted).toEqual(['in', 'out']);
    expect(await allJobs()).toEqual([]);
    expect(await queueSize()).toBe(0);
    expect(await getApiKey()).toBeNull();
    expect((await getStatus()).batch).toBeNull();
  });

  it('adds jobs found while a batch is out to it, sending only the new ones', async () => {
    const batches = new FakeBatches();
    setBatchClientForTests(batches);
    setProviderForTests(direct());
    initHalfPrice();
    await setApiKey('sk-test-0000000000000000');
    await twelveNewJobs();
    await queueUnscored();
    await twelveNewJobs();
    await queueUnscored();
    expect(batches.sent.map((l) => l.length)).toEqual([12, 12]);
    expect((await getStatus()).batch).toMatchObject({
      mode: 'half',
      total: 24,
      remoteIds: ['batch_1', 'batch_2'],
    });
  });

  it('while you are using Fulcra, scores even a large group right away', async () => {
    const batches = new FakeBatches();
    setBatchClientForTests(batches);
    const p = direct();
    setProviderForTests(p);
    initHalfPrice();
    await setApiKey('sk-test-0000000000000000');
    await markPresent();
    await twelveNewJobs();
    await queueUnscored();
    expect((await getStatus()).batch).toMatchObject({ mode: 'now', total: 12 });
    await settle();
    expect(batches.sent).toEqual([]);
    expect(p.calls).toBe(12);
    expect((await getStatus()).batch).toBeNull();
  });

  it('counts you as away 90 seconds after the last Fulcra page reported in', async () => {
    const now = Date.now();
    await markPresent(now);
    expect(await isPresent(now + 60_000)).toBe(true);
    expect(await isPresent(now + 120_000)).toBe(false);
  });
});
