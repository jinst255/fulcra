// Radar: hand-drawn SVG, any number of jobs, tappable axes. Blueprint section 9.2,
// matched to the approved demo. "What stands out" is worked out from scores, no AI call.
// A point with no score sits at the center in red, so missing information never looks like a score.
import { useMemo, useState } from 'react';
import { byValue, isNotAJob, type RankedJob } from '../core/rank';
import { fmtDimScore, standoutLines } from '../core/standouts';
import type { Dimension } from '../core/types';
import { t } from '../i18n/t';
import { useApp } from './AppContext';
import { failText, jobTitle, payReason } from './format';
import { DealbreakerMark } from './Icons';
import { EmptyState } from './RankedList';

const CX = 340;
const CY = 232;
const R = 160;
const COLORS = 8;
const SHAPES = ['circle', 'square', 'triangle', 'diamond'] as const;
const DASHES = ['', '6 4', '2 3', '8 3 2 3'];
/** Line style for the k-th picked job: color from the theme, shape and dash to tell them apart. */
function slot(k: number) {
  return {
    color: `var(--series-${(k % COLORS) + 1})`,
    shape: SHAPES[k % SHAPES.length]!,
    dash: DASHES[Math.floor(k / COLORS + k) % DASHES.length]!,
  };
}

const f1 = (n: number) => n.toFixed(1);

function marker(shape: string, x: number, y: number): string {
  if (shape === 'circle') return `M${f1(x - 4)} ${f1(y)}a4 4 0 1 0 8 0a4 4 0 1 0 -8 0Z`;
  if (shape === 'square') return `M${f1(x - 3.5)} ${f1(y - 3.5)}h7v7h-7Z`;
  if (shape === 'diamond')
    return `M${f1(x)} ${f1(y - 5)}L${f1(x + 5)} ${f1(y)}L${f1(x)} ${f1(y + 5)}L${f1(x - 5)} ${f1(y)}Z`;
  return `M${f1(x)} ${f1(y - 5)}L${f1(x + 4.5)} ${f1(y + 3.5)}L${f1(x - 4.5)} ${f1(y + 3.5)}Z`;
}

function LineKey({ k }: { k: number }) {
  const s = slot(k);
  return (
    <svg width="36" height="16" viewBox="0 0 36 16" aria-hidden="true" style={{ flex: 'none' }}>
      <line
        x1="2"
        y1="8"
        x2="34"
        y2="8"
        style={{ stroke: s.color }}
        strokeWidth="2.25"
        strokeDasharray={s.dash}
      />
      <path d={marker(s.shape, 18, 8)} style={{ fill: s.color }} />
    </svg>
  );
}

export function Radar({ onOpen }: { onOpen: (id: string) => void }) {
  const { view, jobs } = useApp();
  const defaults = useMemo(() => view.openPass.slice(0, 3).map((x) => x.job.id), [view.openPass]);
  const [pickedRaw, setPicked] = useState<string[] | null>(null);
  const [axisRaw, setAxis] = useState(0);
  /** The job under the pointer or keyboard focus in a list, drawn on top of the others. */
  const [hover, setHover] = useState<string | null>(null);
  if (!jobs.length) {
    return (
      <div
        className="wrap"
        style={{ paddingTop: 16, paddingBottom: 40, display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <Heading />
        <EmptyState />
      </div>
    );
  }
  const ids = (pickedRaw ?? defaults).filter((id) => view.byId.get(id)?.scored);
  const dims = view.dims;
  const N = Math.max(dims.length, 1);
  const axis = Math.min(axisRaw, N - 1);
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / N;
  const pt = (i: number, v: number): [number, number] => [
    CX + ((R * v) / 10) * Math.cos(ang(i)),
    CY + ((R * v) / 10) * Math.sin(ang(i)),
  ];
  let grid = '';
  for (const v of [2, 4, 6, 8]) grid += 'M' + dims.map((_d, i) => pt(i, v).map(f1).join(' ')).join('L') + 'Z';
  dims.forEach((_d, i) => {
    const p = pt(i, 10);
    grid += `M${CX} ${CY}L${f1(p[0])} ${f1(p[1])}`;
  });
  const outer = dims.map((_d, i) => pt(i, 10).map(f1).join(',')).join(' ');
  const picked = ids.map((id, k) => ({ x: view.byId.get(id)!, slot: k }));
  const sOf = (x: RankedJob, d: Dimension) => view.scoreOf(x, d) ?? 0;
  const missing = (x: RankedJob, d: Dimension) => view.scoreOf(x, d) == null;
  const anyMissing = picked.some(({ x }) => dims.some((d) => missing(x, d)));
  const stand = standoutLines(
    view,
    picked.map((p) => p.x),
  );
  const end = pt(axis, 10);
  const axisDim = dims[axis];
  const pickList = view.all
    .filter((x) => x.scored && x.job.status !== 'closed' && !isNotAJob(x.job))
    .sort(byValue);

  const hovered = hover ? (view.byId.get(hover) ?? null) : null;
  const hoverPicked = hovered != null && ids.includes(hovered.job.id);
  /** Props that highlight a job on the chart while its row is hovered or focused. */
  const hoverProps = (id: string) => ({
    onMouseEnter: () => setHover(id),
    onMouseLeave: () => setHover((h) => (h === id ? null : h)),
    onFocus: () => setHover(id),
    onBlur: () => setHover((h) => (h === id ? null : h)),
  });
  // The hovered job draws last, so it sits on top.
  const drawOrder = [...picked]
    .reverse()
    .sort((a, b) => Number(a.x.job.id === hover) - Number(b.x.job.id === hover));

  const reasonOf = (x: RankedJob, d: Dimension) =>
    d.computedByApp ? payReason(x.take) : (x.job.scores[d.id]?.reason ?? t('ranked.reasonNotScored'));

  return (
    <div
      className="wrap"
      style={{ paddingTop: 16, paddingBottom: 40, display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <Heading />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <section
          aria-label={t('radar.title')}
          className="card"
          style={{
            flex: '999 1 560px',
            minWidth: 0,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <div className="radar-stage">
              <svg
                viewBox="0 0 680 460"
                role="img"
                aria-label={
                  picked.length
                    ? t('radar.chartAria', {
                        jobs: picked.map((p) => jobTitle(p.x.job)).join(', '),
                        count: dims.length,
                      }) +
                      ' ' +
                      stand.join(' ')
                    : t('radar.emptyAria')
                }
              >
                <line
                  x1={CX}
                  y1={CY}
                  x2={f1(end[0])}
                  y2={f1(end[1])}
                  style={{ stroke: 'var(--teal)' }}
                  strokeOpacity="0.12"
                  strokeWidth="22"
                  strokeLinecap="round"
                />
                <polygon
                  points={outer}
                  style={{ fill: 'var(--chart-bg)', stroke: 'var(--border-input)' }}
                  strokeWidth="1.25"
                />
                <path d={grid} fill="none" style={{ stroke: 'var(--track)' }} strokeWidth="1" />
                {drawOrder.map(({ x, slot: k }) => {
                  const s = slot(k);
                  const pts = dims.map((d, i) => pt(i, sOf(x, d)));
                  const known = pts.filter((_p, i) => !missing(x, dims[i]!));
                  const lit = hoverPicked && hover === x.job.id;
                  const faded = hoverPicked && !lit;
                  // Missing scores draw in red below, on their own axis.
                  return (
                    <g key={x.job.id} opacity={faded ? 0.25 : 1} className="radar-series">
                      <polygon
                        points={pts.map((p) => p.map(f1).join(',')).join(' ')}
                        style={{ fill: s.color, stroke: s.color }}
                        fillOpacity={lit ? 0.2 : picked.length > 3 ? 0.04 : 0.06 + 0.02 * Math.max(0, 2 - k)}
                        strokeWidth={lit ? 3.5 : 2.25}
                        strokeDasharray={s.dash}
                        strokeLinejoin="round"
                      />
                      <path
                        d={known.map((p) => marker(s.shape, p[0], p[1])).join('')}
                        style={{ fill: s.color, stroke: 'var(--card)' }}
                        strokeWidth="1"
                      />
                    </g>
                  );
                })}
                {picked.map(({ x, slot: k }) => {
                  const shape = slot(k).shape;
                  const red = dims
                    .map((d, i) => (missing(x, d) ? pt(i, 0.9) : null))
                    .filter((p): p is [number, number] => p != null);
                  return red.length ? (
                    <path
                      key={x.job.id}
                      d={red.map((p) => marker(shape, p[0], p[1])).join('')}
                      style={{ fill: 'var(--red)', stroke: 'var(--card)' }}
                      strokeWidth="1"
                    />
                  ) : null;
                })}
                {hovered && !hoverPicked && (
                  // A job not on the chart yet: a gray outline previews its shape.
                  <polygon
                    points={dims
                      .map((d, i) => pt(i, sOf(hovered, d)))
                      .map((p) => p.map(f1).join(','))
                      .join(' ')}
                    style={{ fill: 'var(--text-2)', stroke: 'var(--text-2)' }}
                    fillOpacity="0.08"
                    strokeWidth="2"
                    strokeDasharray="4 3"
                    strokeLinejoin="round"
                  />
                )}
                <g fontFamily="IBM Plex Mono, monospace" fontSize="10" style={{ fill: 'var(--text-2)' }}>
                  {[2, 4, 6, 8, 10].map((v) => (
                    <text key={v} x={CX + 6} y={CY - (R * v) / 10 + 4}>
                      {v}
                    </text>
                  ))}
                </g>
              </svg>
              {dims.map((d, i) => {
                const c = Math.cos(ang(i));
                const s = Math.sin(ang(i));
                const side = c > 0.3 ? 'left' : c < -0.3 ? 'right' : 'center';
                const rad = side === 'center' ? R + 34 : R + 14;
                const x = CX + rad * c;
                const y = CY + rad * s;
                const w = view.weight(d);
                const on = i === axis;
                return (
                  <button
                    key={d.id}
                    type="button"
                    className="axis-btn"
                    aria-pressed={on}
                    aria-label={t('radar.axisAria', { dimension: d.name, n: w })}
                    onClick={() => setAxis(i)}
                    style={{
                      left: `${((x / 680) * 100).toFixed(2)}%`,
                      top: `${((y / 460) * 100).toFixed(2)}%`,
                      transform: `translate(${side === 'left' ? '0' : side === 'right' ? '-100%' : '-50%'},-50%)`,
                      textAlign: side === 'left' ? 'left' : side === 'right' ? 'right' : 'center',
                      fontWeight: w >= 5 ? 500 : 400,
                    }}
                  >
                    <span style={{ display: 'block', fontSize: 13, lineHeight: '16px' }}>{d.name}</span>
                    <span
                      className="mono"
                      style={{
                        display: 'block',
                        fontSize: 11,
                        lineHeight: '14px',
                        fontWeight: 400,
                        color: on ? 'var(--teal-dark)' : 'var(--text-2)',
                      }}
                    >
                      {t('radar.weight', { n: w })}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          {axisDim && (
            <div
              style={{
                borderTop: '1px solid var(--rule)',
                paddingTop: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{axisDim.name}</span>
                <span className="small-note">{t('radar.axisMeta', { n: view.weight(axisDim) })}</span>
              </div>
              {picked.map(({ x, slot: k }) => (
                <div
                  key={x.job.id}
                  {...hoverProps(x.job.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    minHeight: 24,
                    fontSize: 13,
                    flexWrap: 'wrap',
                  }}
                >
                  <LineKey k={k} />
                  <button
                    type="button"
                    className="job-link"
                    style={{ width: 170, flex: 'none' }}
                    onClick={() => onOpen(x.job.id)}
                  >
                    {jobTitle(x.job)}
                  </button>
                  {missing(x, axisDim) ? (
                    <span style={{ flex: 'none', fontWeight: 500, color: 'var(--red)' }}>
                      {t('radar.missing')}
                    </span>
                  ) : (
                    <span
                      className="mono"
                      style={{ width: 32, flex: 'none', textAlign: 'right', fontWeight: 500 }}
                    >
                      {fmtDimScore(view.scoreOf(x, axisDim), axisDim)}
                    </span>
                  )}
                  <span style={{ flex: '1 1 200px', minWidth: 0, color: 'var(--text-3)' }}>
                    {reasonOf(x, axisDim)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="small-note">{t('radar.rings')}</div>
          {anyMissing && (
            <div className="small-note" style={{ color: 'var(--red)' }}>
              {t('radar.missingNote')}
            </div>
          )}
        </section>

        <aside aria-label={t('radar.pick.title')} className="card side-col">
          <div>
            <h2 style={{ fontSize: 16 }}>{t('radar.pick.title')}</h2>
            <div className="small-note" style={{ marginTop: 2 }}>
              {t('radar.pick.hintAny', { count: picked.length })}
            </div>
            <div className="row-wrap" style={{ marginTop: 6 }}>
              <button type="button" className="btn" disabled={!picked.length} onClick={() => setPicked([])}>
                {t('radar.pick.clear')}
              </button>
              <button type="button" className="link-btn" onClick={() => setPicked(defaults)}>
                {t('radar.pick.top3')}
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--rule)' }}>
            {pickList.map((x) => {
              const k = ids.indexOf(x.job.id);
              const on = k >= 0;
              const title = jobTitle(x.job);
              return (
                <div
                  key={x.job.id}
                  className={`pick-row${hover === x.job.id ? ' lit' : ''}`}
                  {...hoverProps(x.job.id)}
                >
                  <input
                    type="checkbox"
                    aria-label={t('radar.pick.compare', { job: title })}
                    checked={on}
                    style={{ width: 20, height: 20, margin: '0 0 0 4px', flex: 'none', cursor: 'pointer' }}
                    onChange={() => setPicked(on ? ids.filter((id) => id !== x.job.id) : [...ids, x.job.id])}
                  />
                  <span style={{ visibility: on ? 'visible' : 'hidden', display: 'flex' }}>
                    <LineKey k={on ? k : 0} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <button
                      type="button"
                      className="job-link"
                      aria-label={t('radar.pick.open', { job: title })}
                      onClick={() => onOpen(x.job.id)}
                    >
                      {title}
                    </button>
                    {x.fails.length > 0 && (
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 12,
                          color: 'var(--red)',
                          marginTop: 1,
                        }}
                      >
                        <DealbreakerMark size={12} stroke={2.5} />
                        {failText(x.fails)}
                      </span>
                    )}
                  </span>
                  <span className="mono" style={{ fontSize: 13, color: 'var(--text-3)' }}>
                    {x.value.toFixed(1)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="small-note">{t('radar.overallNote')}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{t('radar.standout.title')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, lineHeight: 1.4 }}>
              {stand.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
            <div className="small-note" style={{ marginTop: 8 }}>
              {t('radar.standout.note')}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Heading() {
  return (
    <div>
      <h1 style={{ fontSize: 22 }}>{t('radar.title')}</h1>
      <p style={{ marginTop: 4, fontSize: 14, color: 'var(--text-2)' }}>{t('radar.subtitle')}</p>
    </div>
  );
}
