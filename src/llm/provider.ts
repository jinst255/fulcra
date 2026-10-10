// Provider interface, so another provider can be added later. Only OpenAI ships in v1.
import type { About, Dimension, ModelChoice, PayPeriod } from '../core/types';
import type { ScoringOutput } from './schema';

export type ProviderErrorCode =
  'KEY_MISSING' | 'KEY_INVALID' | 'NO_CREDIT' | 'RATE_LIMIT' | 'OFFLINE' | 'BAD_JSON' | 'UNKNOWN';

export class ProviderError extends Error {
  constructor(
    public code: ProviderErrorCode,
    /** Short, key-free detail for the local log. */
    public detail = '',
  ) {
    super(code);
  }
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

export interface ScoreRequest {
  model: ModelChoice;
  about: About;
  dims: Dimension[];
  listing: string;
  preliminary: boolean;
  sourceUrl?: string | null;
  /** Score only these dimensions and skip facts (re-scoring). */
  onlyDims?: string[];
}

export interface Suggestions {
  weightChanges: { dimensionId: string; to: number }[];
  newDimensions: { name: string; definition: string; anchorLow: string; anchorHigh: string }[];
}

export interface Provider {
  testKey(key: string): Promise<'ok' | 'bad' | 'nocredit' | 'offline'>;
  score(key: string, req: ScoreRequest): Promise<{ output: ScoringOutput; raw: string; usage: Usage }>;
  checkPayUnit(
    key: string,
    model: ModelChoice,
    req: { title: string; location: string | null; amount: number; period: PayPeriod; listing: string },
  ): Promise<{ unit: PayPeriod | 'unchanged'; reason: string }>;
  suggestPriorities(
    key: string,
    model: ModelChoice,
    req: { text: string; dims: Dimension[]; weights: Record<string, number> },
  ): Promise<Suggestions>;
}
