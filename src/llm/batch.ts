// OpenAI Batch API: half price, finished within 24 hours (usually much sooner).
// One model per batch. The key is only ever sent to https://api.openai.com.
import { ProviderError } from './provider';

const API = 'https://api.openai.com/v1';

export interface BatchLine {
  custom_id: string;
  body: Record<string, unknown>;
}

export interface BatchInfo {
  id: string;
  status:
    | 'validating'
    | 'failed'
    | 'in_progress'
    | 'finalizing'
    | 'completed'
    | 'expired'
    | 'cancelling'
    | 'cancelled';
  input_file_id?: string | null;
  output_file_id: string | null;
  error_file_id: string | null;
  request_counts?: { total: number; completed: number; failed: number };
}

/** One line of a batch's output or error file. */
export interface BatchResult {
  custom_id: string;
  response: { status_code: number; body: unknown } | null;
  error: { code?: string; message?: string } | null;
}

export const FINISHED = new Set<BatchInfo['status']>(['completed', 'failed', 'expired', 'cancelled']);

type Fetch = typeof fetch;

export class BatchClient {
  constructor(private fetchImpl: Fetch = (...a) => fetch(...a)) {}

  private async call(key: string, path: string, init: RequestInit = {}): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${API}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
      });
    } catch {
      throw new ProviderError('OFFLINE', 'network');
    }
    if (res.ok) return res;
    if (res.status === 401 || res.status === 403)
      throw new ProviderError('KEY_INVALID', `batch http ${res.status}`);
    if (res.status === 429) throw new ProviderError('RATE_LIMIT', 'batch http 429');
    throw new ProviderError('UNKNOWN', `batch http ${res.status}`);
  }

  /** Uploads the requests and starts the batch. Returns its id. */
  async submit(key: string, lines: BatchLine[]): Promise<string> {
    const jsonl = lines
      .map((l) =>
        JSON.stringify({ custom_id: l.custom_id, method: 'POST', url: '/v1/responses', body: l.body }),
      )
      .join('\n');
    const form = new FormData();
    form.append('purpose', 'batch');
    form.append('file', new Blob([jsonl], { type: 'application/jsonl' }), 'fulcra-batch.jsonl');
    const file = (await (await this.call(key, '/files', { method: 'POST', body: form })).json()) as {
      id: string;
    };
    const batch = (await (
      await this.call(key, '/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input_file_id: file.id, endpoint: '/v1/responses', completion_window: '24h' }),
      })
    ).json()) as { id: string };
    return batch.id;
  }

  async get(key: string, id: string): Promise<BatchInfo> {
    return (await (await this.call(key, `/batches/${id}`)).json()) as BatchInfo;
  }

  async cancel(key: string, id: string): Promise<void> {
    await this.call(key, `/batches/${id}/cancel`, { method: 'POST' });
  }

  /** Deletes an uploaded or result file, so job text doesn't stay in the OpenAI account. */
  async deleteFile(key: string, fileId: string): Promise<void> {
    await this.call(key, `/files/${fileId}`, { method: 'DELETE' });
  }

  /** Reads an output or error file. */
  async results(key: string, fileId: string): Promise<BatchResult[]> {
    const text = await (await this.call(key, `/files/${fileId}/content`)).text();
    const out: BatchResult[] = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as BatchResult);
      } catch {
        // A broken line just falls back to a direct call.
      }
    }
    return out;
  }
}

export const batchClient = new BatchClient();
