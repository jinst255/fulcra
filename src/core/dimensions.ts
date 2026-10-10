// Default dimensions as data, plus versioning helpers. Blueprint section 5.4.
import { t } from '../i18n/t';
import type { Dimension } from './types';

export const MAX_DIMENSIONS = 12;
export const DEFAULT_ORDER = ['pay', 'enjoyment', 'impact', 'career', 'life', 'risk', 'location'] as const;
export const CUSTOM_COLORS = ['#7A8F3A', '#B0527E', '#3A8FA0', '#8A6D3B', '#5C5CA8'];

export function defaultDimensions(): Dimension[] {
  const d = (
    id: string,
    name: string,
    color: string,
    definition: string,
    anchorLow: string,
    anchorHigh: string,
  ): Dimension => ({
    id,
    name,
    color,
    definition,
    anchorLow,
    anchorHigh,
    version: 1,
    active: true,
    computedByApp: id === 'pay',
  });
  return [
    d('pay', t('dim.pay'), '#0F6B5F', '', '', ''),
    d(
      'enjoyment',
      t('dim.enjoyment'),
      '#E0A040',
      'How much this person would enjoy the day-to-day work, given their stated interests',
      'Dreaded daily',
      "Work they'd do for fun",
    ),
    d(
      'impact',
      t('dim.impact'),
      '#3E6FB0',
      'How much the work actually helps real people',
      'No one is helped, or some are harmed',
      'Clear, direct help to people',
    ),
    d(
      'career',
      t('dim.career'),
      '#8C5BB0',
      'How much this job moves the person toward their stated target work',
      'Unrelated',
      'Direct experience in the target work',
    ),
    d(
      'life',
      t('dim.life'),
      '#9CC9BC',
      'Hours, stress, and room left for life outside work (high score = low cost)',
      'Consumes everything',
      'Plenty of time and energy left',
    ),
    d(
      'risk',
      t('dim.risk'),
      '#C2562F',
      'Income stability, commitment length, and ease of starting (high score = low risk)',
      'Unpredictable, hard to start',
      'Stable, easy to start',
    ),
    d(
      'location',
      t('dim.location'),
      '#6B7280',
      'How well the job lets them live where and near whom they want',
      'Requires leaving their community',
      'Fully compatible',
    ),
  ];
}

export function activeDimensions(dims: Dimension[]): Dimension[] {
  return dims.filter((d) => d.active);
}

/** Dimensions the model scores (everything except pay). */
export function modelDimensions(dims: Dimension[]): Dimension[] {
  return dims.filter((d) => d.active && !d.computedByApp);
}

export function isDefaultDimension(id: string): boolean {
  return (DEFAULT_ORDER as readonly string[]).includes(id);
}

export function nextCustomColor(dims: Dimension[]): string {
  const custom = dims.filter((d) => !isDefaultDimension(d.id)).length;
  return CUSTOM_COLORS[custom % CUSTOM_COLORS.length]!;
}

/** A stable id from a name, unique among existing dimensions. */
export function dimensionIdFor(name: string, dims: Dimension[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'custom';
  let id = base;
  let n = 2;
  while (dims.some((d) => d.id === id)) id = `${base}_${n++}`;
  return id;
}

export interface DimensionDraft {
  name: string;
  definition: string;
  anchorLow: string;
  anchorHigh: string;
}

/**
 * Adds a dimension, or re-activates a removed one with the same id, which
 * brings its hidden scores back (section 12.4).
 */
export function addDimension(dims: Dimension[], draft: DimensionDraft, id?: string): Dimension[] {
  const existing = id ? dims.find((d) => d.id === id) : undefined;
  if (existing) return dims.map((d) => (d.id === existing.id ? { ...d, active: true } : d));
  if (activeDimensions(dims).length >= MAX_DIMENSIONS) return dims;
  const nd: Dimension = {
    id: id ?? dimensionIdFor(draft.name, dims),
    name: draft.name.trim(),
    definition: draft.definition.trim(),
    anchorLow: draft.anchorLow.trim(),
    anchorHigh: draft.anchorHigh.trim(),
    version: 1,
    active: true,
    color: nextCustomColor(dims),
    computedByApp: false,
  };
  return [...dims, nd];
}

/** Edits a dimension. Changing what it means bumps the version, which marks old scores outdated. */
export function editDimension(dims: Dimension[], id: string, draft: DimensionDraft): Dimension[] {
  return dims.map((d) => {
    if (d.id !== id) return d;
    const changed =
      d.definition !== draft.definition.trim() ||
      d.anchorLow !== draft.anchorLow.trim() ||
      d.anchorHigh !== draft.anchorHigh.trim();
    return {
      ...d,
      name: draft.name.trim() || d.name,
      definition: draft.definition.trim(),
      anchorLow: draft.anchorLow.trim(),
      anchorHigh: draft.anchorHigh.trim(),
      version: changed ? d.version + 1 : d.version,
    };
  });
}

export function removeDimension(dims: Dimension[], id: string): Dimension[] {
  return dims.map((d) => (d.id === id && !d.computedByApp ? { ...d, active: false } : d));
}

/** Moves a dimension up or down among the active ones. */
export function moveDimension(dims: Dimension[], id: string, dir: -1 | 1): Dimension[] {
  const out = dims.slice();
  const act = out.filter((d) => d.active);
  const i = act.findIndex((d) => d.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= act.length) return dims;
  const a = out.indexOf(act[i]!);
  const b = out.indexOf(act[j]!);
  [out[a], out[b]] = [out[b]!, out[a]!];
  return out;
}
