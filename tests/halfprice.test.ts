import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { BatchClient, type BatchInfo, type BatchLine, type BatchResult } from '../src/llm/batch';
import type { Provider } from '../src/llm/provider';
import { initHalfPrice, pollHalfPrice, setBatchClientForTests, speedUp } from '../src/pipeline/halfprice';
import { newJobRecord } from '../src/pipeline/jobs';
import {
  pump,
  queueSize,
  queueUnscored,
  setProviderForTests,
  startPlannedBatch,
} from '../src/pipeline/queue';
import { db, resetDbForTests } from '../src/store/db';
import { getJob, putJob } from '../src/store/jobs';
import { getStatus, setApiKey } from '../src/store/settings';

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
});

describe('half-price scoring (Batch API)', () => {
  it('sends an approved batch to OpenAI, applies results, and scores bad answers directly', async () => {
    const batches = new FakeBatches();
    setBatchClientForTests(batches);
    const p = direct();
    setProviderForTests(p);
    initHalfPrice();
    await setApiKey('sk-test-0000000000000000');
    const ids = await twelveNewJobs();
    await queueUnscored();
    expect((await getStatus()).askBatch).toMatchObject({ kind: 'unscored', count: 12 });

    await startPlannedBatch('half');
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

  it('finishes at full price when asked, cancelling the OpenAI batch', async () => {
    const batches = new FakeBatches();
    setBatchClientForTests(batches);
    const p = direct();
    setProviderForTests(p);
    initHalfPrice();
    await setApiKey('sk-test-0000000000000000');
    await twelveNewJobs();
    await queueUnscored();
    await startPlannedBatch('half');
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
});
