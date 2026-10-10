// Weighted overall score. Blueprint section 5.7.
// Scores marked "outdated" stay in use until the new score lands (section 12.4);
// missing ("pending") scores are left out and the other weights rebalance.
import { weightOf } from './presets';
import type { Dimension, JobRecord } from './types';

export interface Overall {
  value: number;
  /** Each dimension's share of the overall score: w_i · s_i / Σw. */
  parts: Record<string, number>;
  /** Dimensions that had a score. */
  counted: string[];
}

/** The score a dimension contributes: the user's override, else the model's, else null. */
export function effectiveScore(job: JobRecord, dim: Dimension, pay: number | null): number | null {
  if (dim.computedByApp) return pay;
  const s = job.scores[dim.id];
  if (!s) return null;
  return s.override ?? s.score;
}

/** S = Σ w_i s_i / Σ w_i over dimensions with a score. All-zero weights mean equal weights. */
export function overallScore(
  scoreOf: (dim: Dimension) => number | null,
  dims: Dimension[],
  weights: Record<string, number>,
): Overall {
  const have = dims.filter((d) => d.active && scoreOf(d) != null);
  let total = have.reduce((n, d) => n + weightOf(weights, d.id), 0);
  const equal = total <= 0;
  if (equal) total = have.length;
  const parts: Record<string, number> = {};
  let sum = 0;
  if (total > 0) {
    for (const d of have) {
      const p = ((equal ? 1 : weightOf(weights, d.id)) * scoreOf(d)!) / total;
      parts[d.id] = p;
      sum += p;
    }
  }
  return { value: sum, parts, counted: have.map((d) => d.id) };
}

export function formatScore(n: number | null, oneDecimal = true): string {
  if (n == null) return '–';
  if (oneDecimal) return n.toFixed(1);
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}
