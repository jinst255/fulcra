// Half-price scoring through OpenAI's Batch API. Runs in the service worker.
// Bulk scoring uses it while the person is away (presence.ts); results usually arrive within an hour
// and always within 24. Anything the batch can't answer falls back to a normal (full-price) call.
// "Score now" cancels what's out and scores the rest directly.
import {
  batchClient,
  FINISHED,
  type BatchClient,
  type BatchInfo,
  type BatchLine,
  type BatchResult,
} from '../llm/batch';
import { readStructured, responsesBody, scoringCall, type ResponsesBody } from '../llm/openai';
import { ProviderError } from '../llm/provider';
import { db, type QueueItem } from '../store/db';
import { getJob } from '../store/jobs';
import { addLog } from '../store/log';
import { getApiKey, getSettings, getStatus, updateStatus } from '../store/settings';
import { applyResult, finishItem, pump, scoreRequest, setHalfPriceStarter } from './queue';

export const BATCH_POLL_ALARM = 'openai-batch';
/** Cancelled batches whose files still need deleting once OpenAI finishes cancelling. */
const CLEANUP_KEY = 'openaiBatchCleanup';
const POLL_MINUTES = 2;
/** OpenAI allows 50,000 requests per batch; smaller ones finish sooner. */
const MAX_LINES = 2000;

let client: BatchClient = batchClient;
export function setBatchClientForTests(c: BatchClient): void {
  client = c;
}

async function items(batchId: string): Promise<QueueItem[]> {
  return (await (await db()).getAll('queue')).filter((i) => i.batch === batchId);
}

let sending: Promise<void> = Promise.resolve();

/**
 * Sends the batch's items that aren't out yet to OpenAI. Calls run one at a time, so jobs added
 * while a send is under way are never sent twice. On failure, the batch carries on at full price.
 */
export function submitHalfPrice(batchId: string): Promise<void> {
  sending = sending.then(() => send(batchId)).catch(() => undefined);
  return sending;
}

async function send(batchId: string): Promise<void> {
  const key = await getApiKey();
  if (!key) return;
  const settings = await getSettings();
  const d = await db();
  const pending = (await items(batchId)).filter((i) => !i.remote);
  const remoteIds: string[] = [];
  try {
    for (let start = 0; start < pending.length; start += MAX_LINES) {
      const chunk = pending.slice(start, start + MAX_LINES);
      const lines: BatchLine[] = [];
      for (const item of chunk) {
        const job = await getJob(item.jobId);
        if (!job) {
          await finishItem(item);
          continue;
        }
        lines.push({
          custom_id: item.id,
          body: responsesBody(scoringCall(scoreRequest(item, job, settings)).opts),
        });
      }
      if (!lines.length) continue;
      const remote = await client.submit(key, lines);
      remoteIds.push(remote);
      const sent = new Set(lines.map((l) => l.custom_id));
      for (const item of chunk) if (sent.has(item.id)) await d.put('queue', { ...item, remote });
    }
    await updateStatus((s) =>
      s.batch?.id === batchId
        ? { batch: { ...s.batch, remoteIds: [...s.batch.remoteIds, ...remoteIds], submittedAt: Date.now() } }
        : {},
    );
    await addLog('BATCH_SENT', 'background', `${pending.length} requests in ${remoteIds.length} batch(es)`);
    await chrome.alarms.create(BATCH_POLL_ALARM, {
      periodInMinutes: POLL_MINUTES,
      delayInMinutes: POLL_MINUTES,
    });
  } catch (e) {
    await addLog(
      'BATCH_FAILED',
      'background',
      e instanceof ProviderError ? `${e.code} ${e.detail}` : 'submit failed',
    );
    // Whatever was sent stays out; the rest is scored now.
    await updateStatus((s) =>
      s.batch?.id === batchId
        ? { batch: { ...s.batch, mode: 'now', remoteIds: [...s.batch.remoteIds, ...remoteIds] } }
        : {},
    );
    void pump();
  }
}

/** Takes an item out of its OpenAI batch so the normal queue scores it. */
async function fallBack(item: QueueItem): Promise<void> {
  await (await db()).put('queue', { ...item, remote: null });
}

async function applyLine(r: BatchResult, remote: string, key: string): Promise<boolean> {
  const item = await (await db()).get('queue', r.custom_id);
  if (!item || item.remote !== remote) return true;
  const job = await getJob(item.jobId);
  if (!job) {
    await finishItem(item);
    return true;
  }
  if (r.error || !r.response || r.response.status_code !== 200) {
    await fallBack(item);
    return false;
  }
  const settings = await getSettings();
  const call = scoringCall(scoreRequest(item, job, settings));
  const got = readStructured(r.response.body as ResponsesBody, call.validator);
  if (!got.ok) {
    // The direct path retries with the problem explained.
    await fallBack(item);
    return false;
  }
  await applyResult(item, job, call.finish(got.value), got.raw, key, settings);
  await finishItem(item);
  return true;
}

async function cleanupList(): Promise<string[]> {
  return ((await chrome.storage.local.get(CLEANUP_KEY))[CLEANUP_KEY] as string[] | undefined) ?? [];
}

/** The batch's files hold job text and the person's About you answers; remove them. */
async function deleteFiles(key: string, info: BatchInfo): Promise<void> {
  for (const f of [info.input_file_id, info.output_file_id, info.error_file_id])
    if (f) await client.deleteFile(key, f).catch(() => undefined);
}

/** Deletes the files of cancelled batches once OpenAI has finished cancelling them. */
async function cleanUp(key: string): Promise<void> {
  const left: string[] = [];
  for (const id of await cleanupList()) {
    try {
      const info = await client.get(key, id);
      if (FINISHED.has(info.status)) await deleteFiles(key, info);
      else left.push(id);
    } catch {
      left.push(id);
    }
  }
  await chrome.storage.local.set({ [CLEANUP_KEY]: left });
}

async function stopPollingIfIdle(): Promise<void> {
  const s = await getStatus();
  if (!s.batch?.remoteIds.length && !(await cleanupList()).length)
    await chrome.alarms.clear(BATCH_POLL_ALARM);
}

/** Checks on the batches that are out and applies finished ones. Runs on an alarm. */
export async function pollHalfPrice(): Promise<void> {
  const key = await getApiKey();
  if (!key) return;
  await cleanUp(key);
  const b = (await getStatus()).batch;
  if (!b?.remoteIds.length) return stopPollingIfIdle();
  const done: string[] = [];
  let fellBack = 0;
  for (const remote of b.remoteIds) {
    let info: BatchInfo;
    try {
      info = await client.get(key, remote);
    } catch {
      continue;
    }
    if (!FINISHED.has(info.status)) continue;
    for (const fileId of [info.output_file_id, info.error_file_id]) {
      if (!fileId) continue;
      try {
        for (const line of await client.results(key, fileId))
          if (!(await applyLine(line, remote, key))) fellBack++;
      } catch {
        // Unreadable file: its items fall back below.
      }
    }
    // Anything the batch didn't answer is scored directly.
    for (const item of (await (await db()).getAll('queue')).filter((i) => i.remote === remote)) {
      await fallBack(item);
      fellBack++;
    }
    done.push(remote);
    await deleteFiles(key, info);
    await addLog('BATCH_DONE', 'background', `${info.status} ${JSON.stringify(info.request_counts ?? {})}`);
  }
  if (!done.length) return;
  const st = await updateStatus((s) =>
    s.batch ? { batch: { ...s.batch, remoteIds: s.batch.remoteIds.filter((id) => !done.includes(id)) } } : {},
  );
  // Leftovers run at full price.
  if (st.batch && !st.batch.remoteIds.length && fellBack)
    await updateStatus({ batch: { ...st.batch, mode: 'now' } });
  await stopPollingIfIdle();
  void pump();
}

/** "Score now": cancel what's out and score the rest directly, at full price. */
export async function speedUp(): Promise<void> {
  const status = await getStatus();
  const key = await getApiKey();
  const b = status.batch;
  if (!b) return;
  for (const remote of b.remoteIds) {
    if (key) await client.cancel(key, remote).catch(() => undefined);
    for (const item of (await (await db()).getAll('queue')).filter((i) => i.remote === remote))
      await fallBack(item);
  }
  // Their files are deleted once the cancel completes; the poll alarm keeps running for that.
  await chrome.storage.local.set({ [CLEANUP_KEY]: [...(await cleanupList()), ...b.remoteIds] });
  await updateStatus({ batch: { ...b, mode: 'now', remoteIds: [] } });
  await addLog('BATCH_SPEEDUP', 'background', `${b.total - b.done} left`);
  void pump();
}

/**
 * For a reset: cancels every batch still at OpenAI and deletes the files it can, best effort,
 * since the key is about to be deleted and nothing could clean up later.
 */
export async function cancelAllRemote(): Promise<void> {
  const key = await getApiKey();
  if (!key) return;
  const ids = [...((await getStatus()).batch?.remoteIds ?? []), ...(await cleanupList())];
  for (const id of ids) {
    await client.cancel(key, id).catch(() => undefined);
    const info = await client.get(key, id).catch(() => null);
    if (info) await deleteFiles(key, info);
  }
  await chrome.alarms.clear(BATCH_POLL_ALARM);
}

/** Wires the queue to this module. Call once in the service worker. */
export function initHalfPrice(): void {
  setHalfPriceStarter(submitHalfPrice);
  // After a restart, keep polling batches that are still out or need their files deleted.
  void Promise.all([getStatus(), cleanupList()]).then(([s, c]) => {
    if (s.batch?.remoteIds.length || c.length)
      void chrome.alarms.create(BATCH_POLL_ALARM, { periodInMinutes: POLL_MINUTES, delayInMinutes: 1 });
  });
}
