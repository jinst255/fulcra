// Cost estimates. Blueprint section 5.2.
import type { ModelChoice } from '../core/types';
import { MODELS } from './models';

// The rubrics for built-in dimensions add about 800 tokens to a full score, about 150 to one dimension.
export const TOKENS_FULL = { in: 3800, out: 500 };
/** One-dimension re-score: same listing in, one short score out. */
export const TOKENS_ONE_DIM = { in: 3200, out: 80 };

export function costPerCall(model: ModelChoice, tokens: { in: number; out: number }): number {
  const m = MODELS[model];
  return (tokens.in * m.priceIn + tokens.out * m.priceOut) / 1e6;
}

/** About $0.0014 per job on Standard. */
export function costPerJob(model: ModelChoice = 'standard'): number {
  return costPerCall(model, TOKENS_FULL);
}

/** About $0.0007 per job on Standard. */
export function costPerDimension(model: ModelChoice = 'standard'): number {
  return costPerCall(model, TOKENS_ONE_DIM);
}

/** "$0.14": two decimals, at least a cent. */
export function formatCost(usd: number): string {
  return '$' + Math.max(0.01, usd).toFixed(2);
}

/** OpenAI's Batch API costs half. */
export function halfPrice(usd: number): number {
  return usd / 2;
}
