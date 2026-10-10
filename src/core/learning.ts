// Suggest a weight change from repeated overrides. Blueprint section 12.6.
import type { OverrideEntry } from './types';

export const LEARN_COUNT = 5;
export const LEARN_MIN_GAP = 2;
export const LEARN_SUPPRESS_MS = 30 * 24 * 60 * 60 * 1000;
export const LEARN_STEP = 2;

/**
 * After 5 overrides on one dimension that all go the same way by at least 2
 * points, returns the direction to suggest. The last 5 overrides decide.
 */
export function learningSuggestion(
  history: OverrideEntry[],
  dimensionId: string,
  suppressedUntil: number | undefined,
  now = Date.now(),
): 'up' | 'down' | null {
  if (suppressedUntil && suppressedUntil > now) return null;
  const mine = history
    .filter((h) => h.dimensionId === dimensionId)
    .sort((a, b) => a.at - b.at)
    .slice(-LEARN_COUNT);
  if (mine.length < LEARN_COUNT) return null;
  if (mine.every((h) => h.userScore - h.modelScore >= LEARN_MIN_GAP)) return 'up';
  if (mine.every((h) => h.modelScore - h.userScore >= LEARN_MIN_GAP)) return 'down';
  return null;
}
