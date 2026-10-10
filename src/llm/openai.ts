// OpenAI Responses API client: structured output, retries, and error mapping. Blueprint sections 5 and 7.
// The key is only ever sent to https://api.openai.com and never appears in errors or logs.
import type { z } from 'zod';
import { MODELS, REASONING_EFFORT } from './models';
import {
  DESCRIBE_SYSTEM,
  PAY_UNIT_SYSTEM,
  SCORING_SYSTEM,
  describeUserMessage,
  payUnitUserMessage,
  scoringUserMessage,
} from './prompts';
import { ProviderError, type Provider, type ScoreRequest, type Usage } from './provider';
import { buildScoringSchema, describeSchema, payUnitSchema, type ScoringOutput } from './schema';

const API = 'https://api.openai.com/v1';
export const RETRY_DELAYS_MS = [2000, 8000, 30000];

type Fetch = typeof fetch;
type Sleep = (ms: number) => Promise<void>;

export interface CallOpts {
  model: string;
  system: string;
  user: string;
  schema: { name: string; json: Record<string, unknown> };
  maxOutputTokens: number;
}

export interface ResponsesBody {
  output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
  };
  status?: string;
  incomplete_details?: { reason?: string };
}

function outputText(body: ResponsesBody): string | null {
  for (const item of body.output ?? []) {
    if (item.type !== 'message') continue;
    for (const c of item.content ?? [])
      if (c.type === 'output_text' && typeof c.text === 'string') return c.text;
  }
  return null;
}

async function mapHttpError(res: Response): Promise<ProviderError> {
  let code = '';
  try {
    const j = (await res.json()) as { error?: { code?: string; type?: string } };
    code = j.error?.code ?? j.error?.type ?? '';
  } catch {
    // Body isn't JSON.
  }
  if (res.status === 401 || res.status === 403) return new ProviderError('KEY_INVALID', `http ${res.status}`);
  if (res.status === 429 && code === 'insufficient_quota')
    return new ProviderError('NO_CREDIT', 'insufficient_quota');
  if (res.status === 429 || res.status >= 500)
    return new ProviderError('RATE_LIMIT', `http ${res.status} ${code}`);
  return new ProviderError('UNKNOWN', `http ${res.status} ${code}`.trim());
}

/** The Responses API request for one structured call. Batches send the same body. */
export function responsesBody(opts: CallOpts, user = opts.user): Record<string, unknown> {
  return {
    model: opts.model,
    input: [
      { role: 'system', content: opts.system },
      { role: 'user', content: user },
    ],
    text: {
      format: { type: 'json_schema', name: opts.schema.name, schema: opts.schema.json, strict: true },
    },
    reasoning: { effort: REASONING_EFFORT },
    max_output_tokens: opts.maxOutputTokens,
    store: false,
  };
}

/** Reads and validates a structured answer. A problem string explains a rejection, for the retry. */
export function readStructured<T>(
  body: ResponsesBody,
  validator: z.ZodType<T>,
): { ok: true; value: T; raw: string } | { ok: false; problem: string } {
  const text = outputText(body);
  if (text == null)
    return {
      ok: false,
      problem: body.incomplete_details?.reason
        ? `incomplete: ${body.incomplete_details.reason}`
        : 'no output text',
    };
  try {
    const parsed = validator.safeParse(JSON.parse(text));
    if (parsed.success) return { ok: true, value: parsed.data, raw: text };
    return {
      ok: false,
      problem: parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
    };
  } catch {
    return { ok: false, problem: 'not valid JSON' };
  }
}

/** A scoring request, how to validate the answer, and how to tidy the result. */
export function scoringCall(req: ScoreRequest) {
  const dims = req.onlyDims ? req.dims.filter((d) => req.onlyDims!.includes(d.id)) : req.dims;
  const schema = buildScoringSchema(dims, !req.onlyDims);
  const opts: CallOpts = {
    model: MODELS[req.model].id,
    system: SCORING_SYSTEM,
    user: scoringUserMessage({
      about: req.about,
      dims,
      listing: req.listing,
      preliminary: req.preliminary,
      sourceUrl: req.sourceUrl,
    }),
    schema,
    maxOutputTokens: req.onlyDims ? 400 : 1500,
  };
  const finish = (value: ScoringOutput): ScoringOutput => {
    for (const sc of Object.values(value.scores)) sc.score = Math.max(1, Math.min(10, Math.round(sc.score)));
    return value;
  };
  return { opts, validator: schema.zod as z.ZodType<ScoringOutput>, finish };
}

export class OpenAIProvider implements Provider {
  constructor(
    private fetchImpl: Fetch = (...a) => fetch(...a),
    private sleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  /** One HTTP call with backoff on rate limits and server errors: 2s, 8s, 30s. */
  private async post(key: string, path: string, body: unknown): Promise<ResponsesBody> {
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(`${API}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify(body),
        });
      } catch {
        throw new ProviderError('OFFLINE', 'network');
      }
      if (res.ok) return (await res.json()) as ResponsesBody;
      const err = await mapHttpError(res);
      if (err.code !== 'RATE_LIMIT' || attempt >= RETRY_DELAYS_MS.length) throw err;
      await this.sleep(RETRY_DELAYS_MS[attempt]!);
    }
  }

  private async structured<T>(
    key: string,
    opts: CallOpts,
    validator: z.ZodType<T>,
  ): Promise<{ value: T; raw: string; usage: Usage }> {
    const usage: Usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
    let user = opts.user;
    for (let attempt = 0; attempt < 2; attempt++) {
      const body = await this.post(key, '/responses', responsesBody(opts, user));
      usage.inputTokens += body.usage?.input_tokens ?? 0;
      usage.outputTokens += body.usage?.output_tokens ?? 0;
      usage.cachedTokens += body.usage?.input_tokens_details?.cached_tokens ?? 0;
      const r = readStructured(body, validator);
      if (r.ok) return { value: r.value, raw: r.raw, usage };
      user = `${opts.user}\n\nYour previous answer was rejected: ${r.problem}. Return JSON that matches the schema exactly.`;
    }
    throw new ProviderError('BAD_JSON', 'validation failed twice');
  }

  async testKey(key: string): Promise<'ok' | 'bad' | 'nocredit' | 'offline'> {
    try {
      // A tiny request: it checks the key and that the account has credit.
      await this.post(key, '/responses', {
        model: MODELS.standard.id,
        input: 'Reply with OK.',
        max_output_tokens: 16,
        reasoning: { effort: REASONING_EFFORT },
        store: false,
      });
      return 'ok';
    } catch (e) {
      if (e instanceof ProviderError) {
        if (e.code === 'NO_CREDIT') return 'nocredit';
        if (e.code === 'OFFLINE') return 'offline';
        // Busy after retries still means the key was accepted.
        if (e.code === 'RATE_LIMIT') return 'ok';
      }
      return 'bad';
    }
  }

  async score(key: string, req: ScoreRequest) {
    const call = scoringCall(req);
    const { value, raw, usage } = await this.structured(key, call.opts, call.validator);
    return { output: call.finish(value), raw, usage };
  }

  async checkPayUnit(
    key: string,
    model: Parameters<Provider['checkPayUnit']>[1],
    req: Parameters<Provider['checkPayUnit']>[2],
  ) {
    const { value } = await this.structured(
      key,
      {
        model: MODELS[model].id,
        system: PAY_UNIT_SYSTEM,
        user: payUnitUserMessage(req),
        schema: payUnitSchema,
        maxOutputTokens: 300,
      },
      payUnitSchema.zod,
    );
    return value;
  }

  async suggestPriorities(
    key: string,
    model: Parameters<Provider['suggestPriorities']>[1],
    req: Parameters<Provider['suggestPriorities']>[2],
  ) {
    const { value } = await this.structured(
      key,
      {
        model: MODELS[model].id,
        system: DESCRIBE_SYSTEM,
        user: describeUserMessage(req),
        schema: describeSchema,
        maxOutputTokens: 800,
      },
      describeSchema.zod,
    );
    const ids = new Set(req.dims.filter((d) => d.active).map((d) => d.id));
    return {
      weightChanges: value.weight_changes
        .filter((w) => ids.has(w.dimension_id) && w.to !== (req.weights[w.dimension_id] ?? 5))
        .map((w) => ({ dimensionId: w.dimension_id, to: Math.round(w.to) })),
      newDimensions: value.new_dimensions.slice(0, 3).map((n) => ({
        name: n.name,
        definition: n.definition,
        anchorLow: n.anchor_low,
        anchorHigh: n.anchor_high,
      })),
    };
  }
}

export const openai = new OpenAIProvider();
