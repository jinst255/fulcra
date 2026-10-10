// Builds the JSON schema sent to OpenAI and the zod validator from the current
// dimension list, so they never drift apart. Blueprint section 5.8. Pay is excluded from scores.
import { z } from 'zod';
import type { Dimension, Facts } from '../core/types';

type JsonSchema = Record<string, unknown>;

const PERIODS = ['hour', 'week', 'month', 'year', 'total', 'unknown'] as const;
const JOB_TYPES = ['full_time', 'part_time', 'internship', 'seasonal', 'contract', 'unknown'] as const;
const YNU = ['yes', 'no', 'unknown'] as const;
const REMOTE = ['yes', 'no', 'hybrid', 'unknown'] as const;
const STATUS = ['open', 'closed', 'unknown'] as const;
export const FLAGS = ['language_gap', 'commission_only', 'unpaid', 'scam_risk'] as const;

const nullableNumber: JsonSchema = { type: ['number', 'null'] };
const nullableString: JsonSchema = { type: ['string', 'null'] };

function obj(properties: Record<string, JsonSchema>): JsonSchema {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}

const factsJson: JsonSchema = obj({
  title: { type: 'string' },
  company: nullableString,
  location: nullableString,
  remote: { type: 'string', enum: REMOTE },
  pay: obj({
    min: nullableNumber,
    max: nullableNumber,
    period: { type: 'string', enum: PERIODS },
    currency: { type: 'string' },
    is_estimate: { type: 'boolean' },
  }),
  hours_per_week: nullableNumber,
  duration_weeks: nullableNumber,
  job_type: { type: 'string', enum: JOB_TYPES },
  commission_or_variable: { type: 'string', enum: YNU },
  relocation_required: { type: 'string', enum: YNU },
  languages_required: { type: 'array', items: { type: 'string' } },
  status: { type: 'string', enum: STATUS },
});

const nn = z.number().nullable();
export const factsZod = z.object({
  title: z.string(),
  company: z.string().nullable(),
  location: z.string().nullable(),
  remote: z.enum(REMOTE),
  pay: z.object({
    min: nn,
    max: nn,
    period: z.enum(PERIODS),
    currency: z.string(),
    is_estimate: z.boolean(),
  }),
  hours_per_week: nn,
  duration_weeks: nn,
  job_type: z.enum(JOB_TYPES),
  commission_or_variable: z.enum(YNU),
  relocation_required: z.enum(YNU),
  languages_required: z.array(z.string()),
  status: z.enum(STATUS),
}) satisfies z.ZodType<Facts>;

const scoreJson: JsonSchema = obj({
  score: { type: 'integer', minimum: 1, maximum: 10 },
  reason: { type: 'string' },
});
const scoreZod = z.object({
  score: z.number().min(1).max(10),
  reason: z.string().min(1),
});

export interface ScoringOutput {
  facts?: Facts;
  scores: Record<string, { score: number; reason: string }>;
  flags: string[];
}

/**
 * Schema for a scoring call. With `includeFacts` false, only the listed
 * dimensions are scored (re-scoring one dimension).
 */
export function buildScoringSchema(dims: Dimension[], includeFacts = true) {
  const scored = dims.filter((d) => d.active && !d.computedByApp);
  const scoreProps: Record<string, JsonSchema> = {};
  const scoreShape: Record<string, typeof scoreZod> = {};
  for (const d of scored) {
    scoreProps[d.id] = scoreJson;
    scoreShape[d.id] = scoreZod;
  }
  const props: Record<string, JsonSchema> = {};
  if (includeFacts) props.facts = factsJson;
  props.scores = obj(scoreProps);
  props.flags = { type: 'array', items: { type: 'string', enum: FLAGS } };
  const json = obj(props);
  const zod = z.object({
    ...(includeFacts ? { facts: factsZod } : {}),
    scores: z.object(scoreShape),
    flags: z.array(z.string()),
  });
  return {
    json,
    zod: zod as unknown as z.ZodType<ScoringOutput>,
    name: includeFacts ? 'job_score' : 'dimension_score',
  };
}

export const payUnitSchema = {
  name: 'pay_unit',
  json: obj({
    unit: { type: 'string', enum: ['hour', 'week', 'month', 'year', 'total', 'unchanged'] },
    reason: { type: 'string' },
  }),
  zod: z.object({
    unit: z.enum(['hour', 'week', 'month', 'year', 'total', 'unchanged']),
    reason: z.string(),
  }),
};

export const describeSchema = {
  name: 'priority_suggestions',
  json: obj({
    weight_changes: {
      type: 'array',
      items: obj({ dimension_id: { type: 'string' }, to: { type: 'integer', minimum: 0, maximum: 10 } }),
    },
    new_dimensions: {
      type: 'array',
      items: obj({
        name: { type: 'string' },
        definition: { type: 'string' },
        anchor_low: { type: 'string' },
        anchor_high: { type: 'string' },
      }),
    },
  }),
  zod: z.object({
    weight_changes: z.array(z.object({ dimension_id: z.string(), to: z.number().min(0).max(10) })),
    new_dimensions: z.array(
      z.object({ name: z.string(), definition: z.string(), anchor_low: z.string(), anchor_high: z.string() }),
    ),
  }),
};
