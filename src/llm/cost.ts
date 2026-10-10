// Cost estimates. Blueprint section 5.2.
import type { ModelChoice } from '../core/types';
import { MODELS } from './models';

export const TOKENS_FULL = { in: 3000, out: 500 };
/** One-dimension re-score: same listing in, one short score out. */
export const TOKENS_ONE_DIM = { in: 3000, out: 80 };

export function costPerCall(model: ModelChoice, tokens: { in: number; out: number }): number {
  const m = MODELS[model];
  return (tokens.in * m.priceIn + tokens.out * m.priceOut) / 1e6;
}

/** About $0.0012 per job on Standard. */
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

/** Rough seconds for a batch with 3 requests in flight. */
export function batchSeconds(count: number): number {
  return Math.ceil(count / 3) * 3;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} seconds`;
  const m = Math.round(seconds / 60);
  return m === 1 ? '1 minute' : `${m} minutes`;
}
