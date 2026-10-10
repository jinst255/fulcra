// Job detail drawer. Blueprint section 9.2, matched to the approved demo.
import { useEffect, useRef, useState } from 'react';
import { formatScore } from '../core/overall';
import type { JobRecord, PayPeriod } from '../core/types';
import { t } from '../i18n/t';
import { send } from '../messages';
import { undoPayUnit } from '../pipeline/jobs';
import { deleteJob, updateJob } from '../store/jobs';
import { setOverride } from './actions';
import { useApp } from './AppContext';
import { Spinner, Swatch, Tag } from './components';
import { failText, jobSub, jobTitle, jobTypeName, payLine, payRate, payReason, shortDate } from './format';
import { Check, Close, DealbreakerMark, External } from './Icons';
import type { Learn } from './LearnCard';

const PERIODS: Exclude<PayPeriod, 'unknown'>[] = ['hour', 'week', 'month', 'year', 'total'];

function num(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function JobDetail({
  jobId,
  onClose,
  onLearn,
}: {
  jobId: string;
  onClose: () => void;
  onLearn: (l: Learn) => void;
}) {
  const { settings, view, confirm, key, status } = useApp();
  const [editPay, setEditPay] = useState(false);
  const [rescoreAt, setRescoreAt] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const r = view.byId.get(jobId);
  const job = r?.job;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (rescoreAt != null && job && job.updatedAt > rescoreAt && job.scoring !== 'queued') setRescoreAt(null);
  }, [rescoreAt, job]);

  if (!r || !job) return null;
  const rankIdx = view.passingIds.indexOf(job.id);
  const busy = rescoreAt != null || job.scoring === 'queued';
  const f = job.facts;
  const remoteText = {
    yes: t('remote.yes'),
    no: t('remote.no'),
    hybrid: t('remote.hybrid'),
    unknown: t('common.cantTell'),
  }[f.remote];
  const yn = (v: 'yes' | 'no' | 'unknown') =>
    v === 'yes' ? t('remote.yes') : v === 'no' ? t('remote.no') : t('common.cantTell');
  const editFacts = (fn: (j: JobRecord) => JobRecord) => void updateJob(job.id, fn);

  return (
    <div className="drawer-wrap">
      <div aria-hidden="true" className="drawer-backdrop" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="dt-title" className="drawer">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id="dt-title" style={{ fontSize: 22, lineHeight: 1.25 }}>
              {jobTitle(job)}
            </h2>
            <div style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 4 }}>{jobSub(job)}</div>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label={t('common.close')}
            className="btn icon"
            onClick={onClose}
          >
            <Close />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px 12px', flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 28, fontWeight: 500 }}>
            {r.scored ? r.value.toFixed(1) : '–'}
          </span>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
            {rankIdx >= 0
              ? t('popup.rank', { rank: rankIdx + 1, total: view.passingIds.length })
              : t('common.overall')}
          </span>
          {job.preliminary && <Tag kind="amber">{t('common.preliminary')}</Tag>}
          {job.scoring === 'scored' && f.pay.is_estimate && <Tag kind="gray">{t('common.estimate')}</Tag>}
        </div>
        {job.preliminary && <div className="note-amber">{t('common.preliminaryHelp')}</div>}
        {job.status === 'closed' && <div className="note-gray">{t('detail.closed')}</div>}
        {job.scoring === 'failed' && (
          <div
            className="note-red"
            style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
          >
            <span style={{ flex: 1 }}>{t('err.badJson')}</span>
          </div>
        )}
        {job.scoring !== 'scored' && job.scoring !== 'failed' && !key.hasKey && (
          <div className="note-amber">{t('err.keyMissing')}</div>
        )}
        {r.fails.length === 0 ? (
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--teal-dark)' }}
          >
            <Check size={18} />
            {t('popup.passes')}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--red)' }}>
            <DealbreakerMark />
            {failText(r.fails)}
          </div>
        )}
        {job.sourceUrl && (
          <div>
            <a
              href={job.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, fontSize: 14 }}
            >
              {t('detail.openPosting')}
              <External />
            </a>
          </div>
        )}

        <section aria-labelledby="dt-pay" className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h3 id="dt-pay" style={{ fontSize: 15, flex: 1 }}>
              {t('detail.pay')}
            </h3>
            <button
              type="button"
              className="btn"
              aria-expanded={editPay}
              onClick={() => setEditPay(!editPay)}
            >
              {editPay ? t('detail.closePay') : t('detail.editPay')}
            </button>
          </div>
          <div style={{ fontSize: 15 }}>{payRate(job)}</div>
          <div style={{ fontSize: 14, color: 'var(--text-3)' }}>
            {payLine(r.take.total, r.take.weeks, r.take.estimate)}
          </div>
          {job.payUnitCorrection && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px 12px',
                flexWrap: 'wrap',
                background: 'var(--teal-light)',
                borderRadius: 8,
                padding: '6px 6px 6px 12px',
              }}
            >
              <span style={{ flex: '1 1 240px', fontSize: 13, color: 'var(--teal-dark)', lineHeight: 1.4 }}>
                {t('detail.payUnit', {
                  from: periodWord(job.payUnitCorrection.from),
                  to: periodWord(job.payUnitCorrection.to),
                  reason: job.payUnitCorrection.reason,
                })}
              </span>
              <button
                type="button"
                className="btn"
                style={{ borderColor: 'var(--teal)', color: 'var(--teal-dark)' }}
                onClick={() => editFacts(undoPayUnit)}
              >
                {t('common.undo')}
              </button>
            </div>
          )}
          {editPay && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))',
                gap: 10,
                background: 'var(--bg)',
                borderRadius: 8,
                padding: 12,
              }}
            >
              <PayField
                id="pe-min"
                label={t('detail.payMin')}
                value={f.pay.min}
                onChange={(v) =>
                  editFacts((j) => ({
                    ...j,
                    facts: { ...j.facts, pay: { ...j.facts.pay, min: v, is_estimate: false } },
                  }))
                }
              />
              <PayField
                id="pe-max"
                label={t('detail.payMax')}
                value={f.pay.max}
                onChange={(v) =>
                  editFacts((j) => ({
                    ...j,
                    facts: { ...j.facts, pay: { ...j.facts.pay, max: v, is_estimate: false } },
                  }))
                }
              />
              <div>
                <label htmlFor="pe-per" className="field-label" style={{ fontSize: 12, marginBottom: 4 }}>
                  {t('detail.payPer')}
                </label>
                <select
                  id="pe-per"
                  className="select"
                  value={f.pay.period === 'unknown' ? 'hour' : f.pay.period}
                  onChange={(e) =>
                    editFacts((j) => ({
                      ...j,
                      payUnitCorrection: null,
                      facts: {
                        ...j.facts,
                        pay: { ...j.facts.pay, period: e.target.value as PayPeriod, is_estimate: false },
                      },
                    }))
                  }
                >
                  {PERIODS.map((p) => (
                    <option key={p} value={p}>
                      {t(`period.${p}`)}
                    </option>
                  ))}
                </select>
              </div>
              <PayField
                id="pe-hours"
                label={t('detail.hours')}
                value={f.hours_per_week}
                onChange={(v) => editFacts((j) => ({ ...j, facts: { ...j.facts, hours_per_week: v } }))}
              />
              <PayField
                id="pe-weeks"
                label={t('detail.payWeeks')}
                value={f.duration_weeks}
                onChange={(v) => editFacts((j) => ({ ...j, facts: { ...j.facts, duration_weeks: v } }))}
              />
            </div>
          )}
        </section>

        <section aria-labelledby="dt-facts" className="card" style={{ gap: 0 }}>
          <h3 id="dt-facts" style={{ fontSize: 15, marginBottom: 6 }}>
            {t('detail.facts')}
          </h3>
          {[
            [t('detail.hours'), f.hours_per_week ? String(f.hours_per_week) : t('common.cantTell')],
            [
              t('detail.length'),
              f.duration_weeks ? t('detail.weeks', { n: f.duration_weeks }) : t('common.cantTell'),
            ],
            [t('detail.jobType'), jobTypeName(f.job_type)],
            [t('detail.remote'), remoteText],
            [t('detail.relocation'), yn(f.relocation_required)],
            [t('detail.languages'), f.languages_required.join(', ') || t('common.cantTell')],
            [
              t('detail.status'),
              job.status === 'closed'
                ? t('detail.closed')
                : job.status === 'open'
                  ? t('detail.statusOpen')
                  : t('common.cantTell'),
            ],
          ].map(([label, value]) => (
            <div key={label} className="fact-row">
              <span>{label}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{value}</span>
            </div>
          ))}
        </section>

        <section aria-labelledby="dt-scores" className="card" style={{ gap: 0 }}>
          <h3 id="dt-scores" style={{ fontSize: 15, marginBottom: 4 }}>
            {t('detail.scores')}
          </h3>
          {view.dims.map((d) => {
            const s = view.scoreOf(r, d);
            const x = job.scores[d.id];
            const ov = x?.override;
            const hasOv = ov != null;
            const doOverride = async (v: number | null) => {
              const learn = await setOverride(job, d.id, v, settings, hasOv ? null : s);
              if (learn) onLearn(learn);
            };
            return (
              <div key={d.id} className="score-row">
                <Swatch color={d.color} size={12} style={{ marginTop: 4 }} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div className="row-wrap" style={{ gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{d.name}</span>
                    {d.computedByApp && f.pay.is_estimate && job.scoring === 'scored' && (
                      <Tag kind="gray">{t('common.estimate')}</Tag>
                    )}
                    {hasOv && <Tag kind="teal">{t('tag.yourScore')}</Tag>}
                    {x?.state === 'outdated' && <Tag kind="gray">{t('tag.updating')}</Tag>}
                    {!d.computedByApp && !x && <Tag kind="gray">{t('ranked.notScored')}</Tag>}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.4 }}>
                    {d.computedByApp
                      ? r.scored
                        ? payReason(r.take)
                        : t('ranked.notScored')
                      : (x?.reason ?? t('ranked.reasonNotScored'))}
                  </div>
                  {!d.computedByApp && x && !hasOv && (
                    <div>
                      <button
                        type="button"
                        className="link-btn"
                        style={{ minHeight: 36, fontSize: 13 }}
                        onClick={() => void doOverride(Math.round(s ?? x.score))}
                      >
                        {t('detail.override')}
                      </button>
                    </div>
                  )}
                  {hasOv && (
                    <div className="row-wrap" style={{ marginTop: 2 }}>
                      <button
                        type="button"
                        className="btn icon"
                        style={{ fontSize: 18 }}
                        aria-label={t('detail.lower', { dimension: d.name })}
                        onClick={() => void doOverride(ov - 1)}
                      >
                        −
                      </button>
                      <button
                        type="button"
                        className="btn icon"
                        style={{ fontSize: 18 }}
                        aria-label={t('detail.raise', { dimension: d.name })}
                        onClick={() => void doOverride(ov + 1)}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className="link-btn"
                        style={{ fontSize: 13 }}
                        onClick={() => void doOverride(null)}
                      >
                        {t('detail.resetOverride')}
                      </button>
                    </div>
                  )}
                </div>
                <span
                  className="mono"
                  style={{ width: 40, flex: 'none', textAlign: 'right', fontSize: 18, fontWeight: 500 }}
                >
                  {formatScore(s, d.computedByApp)}
                </span>
              </div>
            );
          })}
        </section>

        <div
          style={{ fontSize: 13, color: 'var(--text-2)', display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          <span>{t(`detail.source.${job.source}`)}</span>
          <span>{t('detail.added', { date: shortDate(job.addedAt) })}</span>
        </div>

        <div className="row-wrap">
          <button
            type="button"
            className="btn"
            disabled={busy || !key.hasKey || !!status.scoringBlocked}
            onClick={() => {
              setRescoreAt(Date.now());
              void send({ type: 'rescoreJob', jobId: job.id });
            }}
          >
            {busy && <Spinner />}
            {busy
              ? t('detail.rescoring')
              : job.scoring === 'failed'
                ? t('common.tryAgain')
                : t('detail.rescore')}
          </button>
          {job.status === 'closed' ? (
            <button
              type="button"
              className="btn"
              onClick={() =>
                editFacts((j) => ({ ...j, status: 'open', facts: { ...j.facts, status: 'open' } }))
              }
            >
              {t('detail.markOpen')}
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              onClick={() =>
                editFacts((j) => ({ ...j, status: 'closed', facts: { ...j.facts, status: 'closed' } }))
              }
            >
              {t('detail.markClosed')}
            </button>
          )}
          <button
            type="button"
            className="btn danger"
            onClick={() =>
              confirm({
                text: t('detail.deleteConfirm'),
                confirmLabel: t('detail.delete'),
                onConfirm: async () => {
                  onClose();
                  await deleteJob(job.id);
                },
              })
            }
          >
            {t('detail.delete')}
          </button>
        </div>

        {settings.developerMode && settings.showRawOutput && job.rawOutput && (
          <pre
            className="mono"
            style={{
              margin: 0,
              background: 'var(--text)',
              color: '#E4E1D8',
              borderRadius: 8,
              padding: 12,
              fontSize: 11,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
            }}
          >
            {prettyJson(job.rawOutput)}
          </pre>
        )}
      </div>
    </div>
  );
}

function periodWord(p: PayPeriod): string {
  return p === 'total' ? t('period.total').toLowerCase() : p;
}

function prettyJson(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

function PayField(props: {
  id: string;
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const [text, setText] = useState(props.value == null ? '' : String(props.value));
  useEffect(() => setText(props.value == null ? '' : String(props.value)), [props.value]);
  return (
    <div>
      <label htmlFor={props.id} className="field-label" style={{ fontSize: 12, marginBottom: 4 }}>
        {props.label}
      </label>
      <input
        id={props.id}
        type="number"
        min={0}
        className="input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => props.onChange(num(text))}
      />
    </div>
  );
}
