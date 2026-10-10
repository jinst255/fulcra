// Starting profiles. Blueprint section 12.2.
import { DEFAULT_ORDER } from './dimensions';
import type { Dimension, ProfileId } from './types';

export type PresetId = Exclude<ProfileId, 'custom'>;

/** Weights in the order pay, enjoyment, impact, career, life, risk, location. */
export const PRESETS: Record<PresetId, number[]> = {
  balanced: [5, 5, 5, 5, 5, 5, 5],
  money: [10, 1, 1, 1, 1, 1, 1],
  future: [5, 4, 4, 10, 3, 3, 2],
  good: [4, 5, 10, 4, 4, 2, 3],
  life: [4, 7, 3, 2, 10, 4, 7],
};

/** Display order for the profile menu and cards. */
export const PROFILE_ORDER: ProfileId[] = ['money', 'balanced', 'future', 'good', 'life', 'custom'];

export const CUSTOM_DEFAULT_WEIGHT = 5;

export function presetWeights(id: PresetId, dims: Dimension[]): Record<string, number> {
  const w: Record<string, number> = {};
  for (const d of dims) {
    const i = (DEFAULT_ORDER as readonly string[]).indexOf(d.id);
    w[d.id] = i >= 0 ? PRESETS[id][i]! : CUSTOM_DEFAULT_WEIGHT;
  }
  return w;
}

export function weightOf(weights: Record<string, number>, id: string): number {
  return weights[id] ?? CUSTOM_DEFAULT_WEIGHT;
}

/** The preset whose weights match exactly on the active dimensions, else "custom". */
export function matchPreset(weights: Record<string, number>, dims: Dimension[]): ProfileId {
  const act = dims.filter((d) => d.active);
  for (const id of Object.keys(PRESETS) as PresetId[]) {
    const p = presetWeights(id, act);
    if (act.every((d) => weightOf(weights, d.id) === p[d.id])) return id;
  }
  return 'custom';
}
