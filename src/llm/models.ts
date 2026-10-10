// Model IDs and prices, kept in one place. Blueprint section 5.2.
// Model IDs and prices checked against OpenAI's models API and pricing page on Oct 10, 2026.
import type { ModelChoice } from '../core/types';

export interface ModelInfo {
  id: string;
  /** USD per 1M input tokens. */
  priceIn: number;
  /** USD per 1M output tokens. */
  priceOut: number;
}

export const MODELS: Record<ModelChoice, ModelInfo> = {
  standard: { id: 'gpt-5.6-luna', priceIn: 0.2, priceOut: 1.2 },
  sharper: { id: 'gpt-5.4-mini', priceIn: 0.75, priceOut: 4.5 },
};

/** Lowest reasoning effort these models accept (checked Oct 10, 2026): reasoning tokens bill as output. */
export const REASONING_EFFORT = 'none';
