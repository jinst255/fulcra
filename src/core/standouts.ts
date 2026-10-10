// Best-fit wording, breakdown lines, and "What stands out". Computed from scores, no AI call.
// Blueprint sections 9.2 and 19.4, matched to the approved demo.
import { t } from '../i18n/t';
import { formatScore } from './overall';
import type { RankView, RankedJob } from './rank';
import type { Dimension } from './types';

export function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export function listWords(xs: string[]): string {
  if (xs.length <= 1) return xs.join('');
  return xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];
}

export function fmtDimScore(s: number | null, d: Dimension): string {
  return formatScore(s, d.computedByApp);
}

export function bestFitLabel(view: RankView): string {
  const ws = view.dims.map((d) => view.weight(d));
  if (!ws.length) return t('ranked.bestFit.many');
  const max = Math.max(...ws);
  const min = Math.min(...ws);
  const top = view.dims.filter((d) => view.weight(d) === max).map((d) => lowerFirst(d.name));
  if (max === min) return t('ranked.bestFit.equal');
  if (top.length === 1) return t('ranked.bestFit.single', { dimension: top[0]! });
  if (top.length <= 3) return t('ranked.bestFit.multi', { dimensions: listWords(top) });
  return t('ranked.bestFit.many');
}

/** "Scores 6.6 of 10. Weakest on life cost (2) and location and social (2)." */
export function bestFitDetail(view: RankView, best: RankedJob): string {
  const weak = view.dims
    .map((d) => ({ d, s: view.scoreOf(best, d) }))
    .filter((x): x is { d: Dimension; s: number } => x.s != null)
    .sort((a, b) => a.s - b.s || view.weight(b.d) - view.weight(a.d))
    .slice(0, 2)
    .map((x) => `${lowerFirst(x.d.name)} (${fmtDimScore(x.s, x.d)})`);
  return t('ranked.bestFit.detail', { score: best.value.toFixed(1), weakest: weak.join(' and ') });
}

/** Dimensions ordered by weight, largest first, keeping list order on ties. */
export function dimsByWeight(view: RankView): Dimension[] {
  return view.dims
    .slice()
    .sort((a, b) => view.weight(b) - view.weight(a) || view.dims.indexOf(a) - view.dims.indexOf(b));
}

/** The dimensions that add the most to a job's overall score. */
export function topContributors(view: RankView, r: RankedJob, n: number): Dimension[] {
  return view.dims
    .filter((d) => (r.parts[d.id] ?? 0) > 0.001)
    .sort((a, b) => r.parts[b.id]! - r.parts[a.id]! || view.dims.indexOf(a) - view.dims.indexOf(b))
    .slice(0, n);
}

/** "Most from pay 5.9, enjoyment 0.2" */
export function topLine(view: RankView, r: RankedJob): string {
  const items = topContributors(view, r, 2)
    .map((d) => `${lowerFirst(d.name)} ${r.parts[d.id]!.toFixed(1)}`)
    .join(', ');
  return t('ranked.breakdown.top', { items });
}

/** Radar "What stands out" lines for up to three picked jobs. */
export function standoutLines(view: RankView, picked: RankedJob[]): string[] {
  const dims = view.dims;
  const s = (r: RankedJob, d: Dimension) => view.scoreOf(r, d) ?? 0;
  if (!picked.length) return [t('radar.standout.pickAny')];
  if (picked.length === 1) return [t('radar.standout.pickMore')];
  const out: string[] = [];
  for (const p of picked) {
    const leads = dims.filter((d) => picked.every((q) => q === p || s(q, d) < s(p, d)));
    if (!leads.length) {
      out.push(t('radar.standout.none', { job: p.job.facts.title }));
      continue;
    }
    leads.sort((a, b) => view.weight(b) - view.weight(a) || s(p, b) - s(p, a));
    const main = leads[0]!;
    let weakest = dims[0]!;
    for (const d of dims) if (s(p, d) < s(p, weakest)) weakest = d;
    let line = t('radar.standout.leads', {
      job: p.job.facts.title,
      dimension: lowerFirst(main.name),
      score: fmtDimScore(s(p, main), main),
    });
    if (s(p, weakest) <= 3)
      line +=
        ' ' +
        t('radar.standout.trails', {
          dimension: lowerFirst(weakest.name),
          score: fmtDimScore(s(p, weakest), weakest),
        });
    out.push(line + '.');
  }
  let spreadDim: Dimension | null = null;
  let spread = -1;
  let lo = 0;
  let hi = 0;
  for (const d of dims) {
    const vals = picked.map((p) => s(p, d));
    const dd = Math.max(...vals) - Math.min(...vals);
    if (dd > spread) {
      spread = dd;
      spreadDim = d;
      lo = Math.min(...vals);
      hi = Math.max(...vals);
    }
  }
  if (spreadDim)
    out.push(
      t('radar.standout.differ', {
        dimension: lowerFirst(spreadDim.name),
        low: fmtDimScore(lo, spreadDim),
        high: fmtDimScore(hi, spreadDim),
      }),
    );
  return out;
}
