// Creating job records and applying model output to them. Pure functions, tested directly.
import { dedupeKey } from '../core/dedupe';
import type { Dimension, Facts, JobRecord, PayPeriod, Source } from '../core/types';
import type { ScoringOutput } from '../llm/schema';

export interface ListingInput {
  source: Source;
  sourceUrl: string | null;
  site: string | null;
  siteJobId: string | null;
  text: string;
  /** What the page or email said, before the model reads it. */
  title?: string | null;
  company?: string | null;
  location?: string | null;
  pay?: string | null;
  closed?: boolean;
  /** Email-only jobs get a preliminary score. */
  preliminary?: boolean;
}

export function emptyFacts(title = ''): Facts {
  return {
    title,
    company: null,
    location: null,
    remote: 'unknown',
    pay: { min: null, max: null, period: 'unknown', currency: 'USD', is_estimate: true },
    hours_per_week: null,
    duration_weeks: null,
    job_type: 'unknown',
    commission_or_variable: 'unknown',
    relocation_required: 'unknown',
    languages_required: [],
    status: 'unknown',
  };
}

function uuid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function newJobRecord(input: ListingInput, now = Date.now()): JobRecord {
  const facts = emptyFacts(input.title?.trim() || '');
  facts.company = input.company?.trim() || null;
  facts.location = input.location?.trim() || null;
  if (input.closed) facts.status = 'closed';
  return {
    id: uuid(),
    dedupeKey: dedupeKey({
      site: input.site,
      siteJobId: input.siteJobId,
      company: facts.company,
      title: facts.title,
      location: facts.location,
    }),
    source: input.source,
    sourceUrl: input.sourceUrl,
    siteJobId: input.siteJobId,
    listingText: input.text.slice(0, 30_000),
    facts,
    payUnitCorrection: null,
    scores: {},
    status: input.closed ? 'closed' : 'unknown',
    addedAt: now,
    updatedAt: now,
    lastSeenAt: now,
    flags: [],
    preliminary: !!input.preliminary,
    scoring: 'notScored',
    scoreError: null,
    knownCosts: 0,
    rawOutput: null,
  };
}

/** Writes a full scoring result into a job. */
export function applyFullScore(
  job: JobRecord,
  out: ScoringOutput,
  dims: Dimension[],
  raw: string,
): JobRecord {
  const facts = out.facts!;
  const scores: JobRecord['scores'] = { ...job.scores };
  for (const d of dims) {
    const s = out.scores[d.id];
    if (!s) continue;
    scores[d.id] = {
      score: s.score,
      reason: s.reason,
      dimVersion: d.version,
      state: job.preliminary ? 'preliminary' : 'current',
      override: job.scores[d.id]?.override ?? null,
    };
  }
  // Page or email facts win where the model left a blank.
  const merged: Facts = {
    ...facts,
    title: facts.title || job.facts.title,
    company: facts.company ?? job.facts.company,
    location: facts.location ?? job.facts.location,
  };
  const status = job.status === 'closed' ? 'closed' : facts.status;
  merged.status = status;
  return {
    ...job,
    facts: merged,
    scores,
    flags: out.flags,
    status,
    scoring: 'scored',
    scoreError: null,
    rawOutput: raw,
    payUnitCorrection: null,
  };
}

/** Writes a re-score of some dimensions into a job, leaving facts alone. */
export function applyDimScores(job: JobRecord, out: ScoringOutput, dims: Dimension[]): JobRecord {
  const scores = { ...job.scores };
  for (const d of dims) {
    const s = out.scores[d.id];
    if (!s) continue;
    scores[d.id] = {
      score: s.score,
      reason: s.reason,
      dimVersion: d.version,
      state: job.preliminary ? 'preliminary' : 'current',
      override: job.scores[d.id]?.override ?? null,
    };
  }
  return { ...job, scores };
}

export function applyPayUnit(job: JobRecord, to: PayPeriod, reason: string): JobRecord {
  return {
    ...job,
    facts: { ...job.facts, pay: { ...job.facts.pay, period: to } },
    payUnitCorrection: { from: job.facts.pay.period, to, reason },
  };
}

export function undoPayUnit(job: JobRecord): JobRecord {
  if (!job.payUnitCorrection) return job;
  return {
    ...job,
    facts: { ...job.facts, pay: { ...job.facts.pay, period: job.payUnitCorrection.from } },
    payUnitCorrection: null,
  };
}
