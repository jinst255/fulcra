// Ranked list (home). Blueprint section 9.2, matched to the approved demo.
import { useEffect, useMemo, useState } from 'react';
import { byValue, isNotAJob, movement, type RankedJob } from '../core/rank';
import { bestFitDetail, bestFitLabel, dimsByWeight, topLine } from '../core/standouts';
import type { JobRecord } from '../core/types';
import { t } from '../i18n/t';
import { useApp } from './AppContext';
import { Switch, Swatch, Tag } from './components';
import { failText, jobSub, jobTitle } from './format';
import { DealbreakerMark, Search } from './Icons';
import { FilteredOut, TypeFilter } from './TypeFilter';
import { WeightPanel } from './WeightPanel';
import { deleteWhere } from '../store/jobs';
import { LearnCard, type Learn } from './LearnCard';

const UP = 'M5 1.5L9 8H1z';
const DOWN = 'M5 8.5L1 2h8z';
const SAME = 'M1 4h8v2H1z';

export function rowTags(
  job: JobRecord,
  dimIds: string[],
): { text: string; kind: 'amber' | 'gray' | 'teal' | 'red' }[] {
  const tags: { text: string; kind: 'amber' | 'gray' | 'teal' | 'red' }[] = [];
  if (job.status === 'closed') tags.push({ text: t('tag.closed'), kind: 'gray' });
  if (job.preliminary) tags.push({ text: t('common.preliminary'), kind: 'amber' });
  if (job.scoring === 'scored' && job.facts.pay.is_estimate)
    tags.push({ text: t('common.estimate'), kind: 'gray' });
  if (job.payUnitCorrection) tags.push({ text: t('msg.payUnitCorrected'), kind: 'teal' });
  if (job.scoring === 'failed') tags.push({ text: t('ranked.couldntScore'), kind: 'red' });
  else if (job.scoring !== 'scored') tags.push({ text: t('ranked.notScored'), kind: 'gray' });
  else {
    if (dimIds.some((id) => job.scores[id]?.state === 'outdated'))
      tags.push({ text: t('tag.updating'), kind: 'gray' });
    if (dimIds.some((id) => !job.scores[id])) tags.push({ text: t('ranked.notScored'), kind: 'gray' });
  }
  return tags;
}

export function RankedList({
  onOpen,
  learn,
  setLearn,
}: {
  onOpen: (id: string) => void;
  learn: Learn | null;
  setLearn: (l: Learn | null) => void;
}) {
  const { settings, update, view, jobs, go, confirm, toast } = useApp();
  const [search, setSearch] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [showNotJobs, setShowNotJobs] = useState(false);
  const [breakdown, setBreakdown] = useState(false);
  const [page, setPage] = useState(1);
  const [extra, setExtra] = useState<Record<'unscored' | 'fail' | 'closed', number>>({
    unscored: 1,
    fail: 1,
    closed: 1,
  });

  const q = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      view.all.filter((x) => {
        if (!q) return true;
        return [x.job.facts.title, x.job.facts.company, x.job.facts.location]
          .join(' ')
          .toLowerCase()
          .includes(q);
      }),
    [view, q],
  );
  const notJobs = visible.filter((x) => isNotAJob(x.job));
  const open = visible.filter((x) => x.job.status !== 'closed' && !isNotAJob(x.job));
  const passing = open.filter((x) => x.scored && !x.fails.length).sort(byValue);
  const failing = open.filter((x) => x.scored && x.fails.length).sort(byValue);
  const unscored = open.filter((x) => !x.scored).sort((a, b) => b.job.addedAt - a.job.addedAt);
  // Closed and expired postings go to the bottom, folded away.
  const closed = visible
    .filter((x) => x.job.status === 'closed' && !isNotAJob(x.job))
    .sort((a, b) => b.job.lastSeenAt - a.job.lastSeenAt);

  const size = settings.ui.pageSize > 0 ? settings.ui.pageSize : Infinity;
  const pages = Math.max(1, Math.ceil(passing.length / size));
  const cur = Math.min(page, pages);
  const first = (cur - 1) * (Number.isFinite(size) ? size : 0);
  const pageRows = Number.isFinite(size) ? passing.slice(first, first + size) : passing;
  useEffect(() => setPage(1), [q, settings.ui.pageSize]);
  const limited = (xs: RankedJob[], k: keyof typeof extra) =>
    Number.isFinite(size) ? xs.slice(0, size * extra[k]) : xs;
  const more = (xs: RankedJob[], k: keyof typeof extra) =>
    Number.isFinite(size) && xs.length > size * extra[k] ? (
      <button
        type="button"
        className="link-btn"
        style={{ alignSelf: 'flex-start', margin: '4px 8px' }}
        onClick={() => setExtra({ ...extra, [k]: extra[k] + 1 })}
      >
        {t('ranked.showMore', { count: Math.min(size, xs.length - size * extra[k]) })}
      </button>
    ) : null;

  const passCount = view.openPass.length;
  const auto = passCount < 5;
  const sticky = settings.ui.showOutsideDealbreakers;
  const showFailing = sticky === null ? auto : sticky;
  const failingHint =
    sticky === null
      ? auto
        ? t('ranked.outside.shownFew')
        : t('ranked.outside.hidden')
      : showFailing
        ? t('ranked.outside.shown')
        : t('ranked.outside.hidden');

  const byWeight = dimsByWeight(view);
  // Movement counts only the jobs the type filter shows, so filtering doesn't look like movement.
  const shownIds = new Set(view.passingIds);
  const baseline = settings.ui.baselineOrder.filter((id) => shownIds.has(id));
  const best = view.openPass[0];
  const dimIds = view.dims.filter((d) => !d.computedByApp).map((d) => d.id);

  if (!jobs.length) {
    return (
      <div className="wrap page">
        <section className="main-col" aria-label={t('app.tab.ranked')}>
          <h1 className="sr-only">{t('app.tab.ranked')}</h1>
          {settings.ui.setupSkipped && <FinishCard onFinish={() => go('setup/2')} />}
          <EmptyState />
        </section>
        <WeightPanel />
      </div>
    );
  }

  const row = (x: RankedJob, idx: number, mode: 'pass' | 'fail' | 'unscored' | 'closed') => {
    const j = x.job;
    const top = x.scored ? topLine(view, x) : '';
    const segs = byWeight.filter((d) => (x.parts[d.id] ?? 0) > 0.001);
    const tags = rowTags(j, dimIds);
    const delta = mode === 'pass' ? movement(baseline, view.passingIds, j.id) : 0;
    return (
      <button
        key={j.id}
        type="button"
        className={`job-row ${mode === 'fail' ? 'failing' : ''}`}
        onClick={() => onOpen(j.id)}
      >
        <span className="rank">{mode === 'fail' ? <DealbreakerMark /> : mode === 'pass' ? idx + 1 : ''}</span>
        <span className="who">
          <span style={{ fontSize: 14, fontWeight: mode === 'pass' && idx === 0 ? 500 : 400 }}>
            {jobTitle(j)}
          </span>
          {mode === 'fail' ? (
            <span style={{ fontSize: 12, color: 'var(--red)' }}>{failText(x.fails)}</span>
          ) : (
            <span className="sub">{jobSub(j)}</span>
          )}
          {tags.length > 0 && (
            <span className="row-wrap" style={{ gap: 4 }}>
              {tags.map((tg) => (
                <Tag key={tg.text} kind={tg.kind}>
                  {tg.text}
                </Tag>
              ))}
            </span>
          )}
        </span>
        <span className="bars" style={mode === 'fail' ? { opacity: 0.6 } : undefined}>
          {x.scored &&
            (breakdown ? (
              <>
                <span
                  role="img"
                  aria-label={t('ranked.barAria', { job: jobTitle(j), score: x.value.toFixed(1), top })}
                  className="stack-bar dim-color"
                >
                  {segs.map((d, k) => (
                    <span
                      key={d.id}
                      title={t('ranked.segment', {
                        dimension: d.name,
                        score: (view.scoreOf(x, d) ?? 0).toFixed(d.computedByApp ? 1 : 0),
                        part: x.parts[d.id]!.toFixed(1),
                      })}
                      style={{
                        width: `${(x.parts[d.id]! * 10).toFixed(2)}%`,
                        background: d.color,
                        boxShadow: k < segs.length - 1 ? 'inset -2px 0 0 var(--card)' : undefined,
                      }}
                    />
                  ))}
                </span>
                <span className="top-line" style={mode === 'fail' ? { color: 'var(--text-3)' } : undefined}>
                  {top}
                </span>
              </>
            ) : (
              <span aria-hidden="true" className="simple-bar">
                <span
                  style={{
                    width: `${(x.value * 10).toFixed(1)}%`,
                    background: mode === 'pass' && idx === 0 ? 'var(--teal)' : 'var(--teal-mid)',
                  }}
                />
              </span>
            ))}
        </span>
        <span className="score">{x.scored ? x.value.toFixed(1) : '–'}</span>
        {mode === 'pass' ? (
          <span
            className="move"
            style={{ color: delta > 0 ? 'var(--teal-dark)' : undefined, fontWeight: delta !== 0 ? 500 : 400 }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d={delta > 0 ? UP : delta < 0 ? DOWN : SAME} fill="currentColor" />
            </svg>
            {delta > 0
              ? t('ranked.move.up', { n: delta })
              : delta < 0
                ? t('ranked.move.down', { n: -delta })
                : t('ranked.move.same')}
          </span>
        ) : (
          <span style={{ width: 64, flex: 'none' }} />
        )}
      </button>
    );
  };

  return (
    <div className="wrap page">
      <section aria-label={t('app.tab.ranked')} className="main-col">
        <h1 className="sr-only">{t('app.tab.ranked')}</h1>
        {settings.ui.setupSkipped && <FinishCard onFinish={() => go('setup/2')} />}
        {learn && <LearnCard learn={learn} onDone={() => setLearn(null)} />}
        <div className="card panel">
          {best && (
            <button type="button" className="best" onClick={() => onOpen(best.job.id)}>
              <span className="label">{bestFitLabel(view)}</span>
              <span className="name">{jobTitle(best.job)}</span>
              <span className="detail">{bestFitDetail(view, best)}</span>
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px 16px', flexWrap: 'wrap' }}>
            <div className="search">
              <label htmlFor="rk-search" className="sr-only">
                {t('ranked.search')}
              </label>
              <Search />
              <input
                id="rk-search"
                type="search"
                className="input"
                placeholder={t('ranked.search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
              <label htmlFor="rk-size" style={{ fontSize: 13 }}>
                {t('ranked.perPage')}
              </label>
              <select
                id="rk-size"
                className="select"
                style={{ width: 'auto', minHeight: 36 }}
                value={settings.ui.pageSize}
                onChange={(e) => update((s) => void (s.ui.pageSize = Number(e.target.value)))}
              >
                {[10, 20, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
                <option value={0}>{t('ranked.perPageAll')}</option>
              </select>
            </div>
          </div>
          <TypeFilter />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px 10px',
              minHeight: 44,
              flexWrap: 'wrap',
              borderTop: '1px solid var(--rule)',
              paddingTop: 4,
            }}
          >
            <span id="lbl-breakdown" style={{ fontSize: 13, fontWeight: 500 }}>
              {t('ranked.breakdown.label')}
            </span>
            <span className="small-note">
              {breakdown ? t('ranked.breakdown.on') : t('ranked.breakdown.off')}
            </span>
            <span style={{ marginLeft: 'auto' }}>
              <Switch on={breakdown} onToggle={() => setBreakdown(!breakdown)} labelledBy="lbl-breakdown" />
            </span>
          </div>
          {breakdown && (
            <div
              style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', padding: '0 8px 2px' }}
              aria-label={t('ranked.breakdownLegend')}
            >
              {byWeight
                .filter((d) => view.weight(d) > 0)
                .map((d) => (
                  <span
                    key={d.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      color: 'var(--text-3)',
                    }}
                  >
                    <Swatch color={d.color} size={12} />
                    {d.name}
                    <span className="mono muted">x{view.weight(d)}</span>
                  </span>
                ))}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {pageRows.map((x, i) => row(x, first + i, 'pass'))}
          </div>
          {pages > 1 && (
            <nav className="pager" aria-label={t('ranked.pages')}>
              <span className="small-note mono">
                {t('ranked.range', {
                  from: first + 1,
                  to: Math.min(first + pageRows.length, passing.length),
                  total: passing.length,
                })}
              </span>
              <span className="row-wrap" style={{ marginLeft: 'auto' }}>
                <button type="button" className="btn" disabled={cur <= 1} onClick={() => setPage(cur - 1)}>
                  {t('ranked.prev')}
                </button>
                <span className="small-note" aria-live="polite">
                  {t('ranked.pageOf', { page: cur, pages })}
                </span>
                <button
                  type="button"
                  className="btn"
                  disabled={cur >= pages}
                  onClick={() => setPage(cur + 1)}
                >
                  {t('ranked.next')}
                </button>
              </span>
            </nav>
          )}
          {view.all.length === 0 ? (
            <FilteredOut />
          ) : (
            passing.length === 0 && (
              <div style={{ padding: '16px 8px', fontSize: 14, color: 'var(--text-2)' }}>
                {q ? t('ranked.noMatch') : t('ranked.nonePass')}
              </div>
            )
          )}
          {unscored.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="section-head">
                <span style={{ fontSize: 13, fontWeight: 500 }}>{t('ranked.notScored')}</span>
                <span className="small-note">
                  {unscored.length === 1
                    ? t('ranked.outside.one')
                    : t('ranked.outside.count', { count: unscored.length })}
                </span>
              </div>
              {limited(unscored, 'unscored').map((x, i) => row(x, i, 'unscored'))}
              {more(unscored, 'unscored')}
            </div>
          )}
          {failing.length > 0 && (
            <>
              <div className="section-head">
                <span style={{ fontSize: 13, fontWeight: 500 }}>{t('ranked.outside.title')}</span>
                <span className="small-note">
                  {failing.length === 1
                    ? t('ranked.outside.one')
                    : t('ranked.outside.count', { count: failing.length })}
                </span>
                <span
                  style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}
                  className="small-note"
                >
                  <span>{failingHint}</span>
                  <Switch
                    on={showFailing}
                    label={t('ranked.outside.toggle')}
                    onToggle={() => update((s) => void (s.ui.showOutsideDealbreakers = !showFailing))}
                  />
                </span>
              </div>
              {showFailing && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {limited(failing, 'fail').map((x, i) => row(x, i, 'fail'))}
                  {more(failing, 'fail')}
                </div>
              )}
            </>
          )}
          {notJobs.length > 0 && (
            <>
              <button
                type="button"
                className="section-head fold"
                aria-expanded={showNotJobs}
                onClick={() => setShowNotJobs(!showNotJobs)}
              >
                <span aria-hidden="true" className="chev">
                  {showNotJobs ? '▾' : '▸'}
                </span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{t('ranked.notJobsTitle')}</span>
                <span className="small-note">
                  {notJobs.length === 1
                    ? t('ranked.outside.one')
                    : t('ranked.outside.count', { count: notJobs.length })}
                </span>
                <span className="small-note" style={{ marginLeft: 'auto' }}>
                  {showNotJobs ? t('ranked.outside.shown') : t('ranked.outside.hidden')}
                </span>
              </button>
              {showNotJobs && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div className="small-note" style={{ padding: '4px 8px' }}>
                    {t('ranked.notJobsHint')}
                  </div>
                  <div style={{ opacity: 0.75 }}>{notJobs.map((x, i) => row(x, i, 'closed'))}</div>
                  <button
                    type="button"
                    className="btn danger"
                    style={{ alignSelf: 'flex-start', margin: 8 }}
                    onClick={() =>
                      confirm({
                        text: t('ranked.notJobsDeleteConfirm', { count: notJobs.length }),
                        confirmLabel: t('detail.delete'),
                        onConfirm: async () => {
                          const ids = new Set(notJobs.map((x) => x.job.id));
                          await deleteWhere((j) => ids.has(j.id));
                          toast(t('ranked.notJobsDeleted', { count: ids.size }));
                        },
                      })
                    }
                  >
                    {t('ranked.notJobsDelete')}
                  </button>
                </div>
              )}
            </>
          )}
          {closed.length > 0 && (
            <>
              <button
                type="button"
                className="section-head fold"
                aria-expanded={showClosed}
                onClick={() => setShowClosed(!showClosed)}
              >
                <span aria-hidden="true" className="chev">
                  {showClosed ? '▾' : '▸'}
                </span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{t('ranked.closedTitle')}</span>
                <span className="small-note">
                  {closed.length === 1
                    ? t('ranked.outside.one')
                    : t('ranked.outside.count', { count: closed.length })}
                </span>
                <span className="small-note" style={{ marginLeft: 'auto' }}>
                  {showClosed ? t('ranked.outside.shown') : t('ranked.outside.hidden')}
                </span>
              </button>
              {showClosed && (
                <div style={{ display: 'flex', flexDirection: 'column', opacity: 0.75 }}>
                  {limited(closed, 'closed').map((x, i) => row(x, i, 'closed'))}
                  {more(closed, 'closed')}
                </div>
              )}
            </>
          )}
        </div>
      </section>
      <WeightPanel />
    </div>
  );
}

export function FinishCard({ onFinish }: { onFinish: () => void }) {
  return (
    <div
      className="card"
      style={{ padding: 16, display: 'flex', alignItems: 'center', gap: '12px 16px', flexWrap: 'wrap' }}
    >
      <div style={{ flex: '1 1 260px' }}>
        <div style={{ fontSize: 15, fontWeight: 500 }}>{t('setup.finishCard.title')}</div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>{t('setup.finishCard.body')}</div>
      </div>
      <button type="button" className="btn primary" onClick={onFinish}>
        {t('setup.finishCard.button')}
      </button>
    </div>
  );
}

export function EmptyState() {
  return (
    <div
      className="card"
      style={{
        padding: '40px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 10,
      }}
    >
      <svg width="64" height="48" viewBox="0 0 64 48" aria-hidden="true">
        <rect x="4" y="8" width="56" height="8" rx="4" style={{ fill: 'var(--rule)' }} />
        <rect x="4" y="22" width="40" height="8" rx="4" style={{ fill: 'var(--rule)' }} />
        <rect x="4" y="36" width="24" height="8" rx="4" style={{ fill: 'var(--rule)' }} />
      </svg>
      <h2 style={{ fontSize: 20 }}>{t('ranked.empty.title')}</h2>
      <p style={{ maxWidth: 460, fontSize: 14, lineHeight: 1.5, color: 'var(--text-3)' }}>
        {t('ranked.empty.body')}
      </p>
    </div>
  );
}
