// App actions shared by the ranked list, radar, detail drawer, setup, and settings.
import { learningSuggestion, LEARN_SUPPRESS_MS } from '../core/learning';
import { matchPreset, presetWeights, type PresetId } from '../core/presets';
import { rankJobs } from '../core/rank';
import type { JobRecord, Settings } from '../core/types';
import { addOverride, overrideHistory, updateJob } from '../store/jobs';

type Update = (fn: (s: Settings) => Settings | void) => void;

/** Picks a starting profile. Movement arrows count from here. */
export function pickProfile(update: Update, jobs: JobRecord[], id: PresetId): void {
  update((s) => {
    s.weights = { ...s.weights, ...presetWeights(id, s.dimensions) };
    s.profileId = id;
    s.ui.baselineOrder = rankJobs(jobs, s).passingIds;
  });
}

export function setWeight(update: Update, id: string, value: number): void {
  update((s) => {
    s.weights = { ...s.weights, [id]: Math.max(0, Math.min(10, Math.round(value))) };
    s.profileId = matchPreset(s.weights, s.dimensions);
  });
}

/** Sets or clears the user's own score, records it, and returns a learning suggestion if one is due. */
export async function setOverride(
  job: JobRecord,
  dimId: string,
  value: number | null,
  settings: Settings,
): Promise<{ dimId: string; dir: 'up' | 'down' } | null> {
  const model = job.scores[dimId]?.score;
  if (model == null) return null;
  const v = value == null ? null : Math.max(1, Math.min(10, Math.round(value)));
  await updateJob(job.id, (j) => {
    const s = j.scores[dimId];
    if (s) j.scores[dimId] = { ...s, override: v };
    return j;
  });
  if (v == null || v === model) return null;
  await addOverride({ jobId: job.id, dimensionId: dimId, modelScore: model, userScore: v, at: Date.now() });
  const dir = learningSuggestion(await overrideHistory(dimId), dimId, settings.ui.learnSuppressed[dimId]);
  return dir ? { dimId, dir } : null;
}

/** Hides the learning card for this dimension for 30 days. */
export function suppressLearning(update: Update, dimId: string): void {
  update((s) => {
    s.ui.learnSuppressed = { ...s.ui.learnSuppressed, [dimId]: Date.now() + LEARN_SUPPRESS_MS };
  });
}
