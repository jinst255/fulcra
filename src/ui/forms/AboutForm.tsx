// "About you". Setup step 2 and Settings > About you.
import { useEffect, useRef, useState } from 'react';
import type { LanguageLevel, PayUnit, Settings } from '../../core/types';
import { convertPay, formatMoney, formatRate } from '../../core/pay';
import { t, type MessageKey } from '../../i18n/t';
import { useApp } from '../AppContext';
import { Segmented } from '../components';
import { Close } from '../Icons';

const LEVELS: LanguageLevel[] = ['native', 'fluent', 'conversational'];

/** A text field that saves when you stop typing, so each keystroke isn't a write. */
export function useDraft(value: string, save: (v: string) => void): [string, (v: string) => void] {
  const [draft, setDraft] = useState(value);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const id = setTimeout(() => saveRef.current(draft), 400);
    return () => clearTimeout(id);
  }, [draft, value]);
  return [draft, setDraft];
}

function DraftField(props: {
  id: string;
  value: string;
  onSave: (v: string) => void;
  multiline?: boolean;
  maxWidth?: number;
}) {
  const [draft, setDraft] = useDraft(props.value, props.onSave);
  return props.multiline ? (
    <textarea
      id={props.id}
      rows={2}
      className="textarea"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => props.onSave(draft)}
    />
  ) : (
    <input
      id={props.id}
      type="text"
      className="input"
      style={{ maxWidth: props.maxWidth }}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => props.onSave(draft)}
    />
  );
}

function numOrNull(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function NumberField(props: {
  id: string;
  value: number | null;
  onSave: (v: number | null) => void;
  width?: number;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel?: string;
  mono?: boolean;
}) {
  const [draft, setDraft] = useDraft(props.value == null ? '' : String(props.value), (v) =>
    props.onSave(numOrNull(v)),
  );
  return (
    <input
      id={props.id}
      aria-label={props.ariaLabel}
      type="number"
      className={props.mono ? 'input mono' : 'input'}
      style={{ width: props.width ?? '100%' }}
      min={props.min}
      max={props.max}
      step={props.step}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => props.onSave(numOrNull(draft))}
    />
  );
}

const SPANS: { weeks: number; key: MessageKey }[] = [
  { weeks: 13, key: 'setup.about.span.3m' },
  { weeks: 26, key: 'setup.about.span.6m' },
  { weeks: 52, key: 'setup.about.span.1y' },
  { weeks: 104, key: 'setup.about.span.2y' },
];
const weeksToMonths = (w: number) => Math.max(1, Math.round((w * 12) / 52));
const monthsToWeeks = (m: number) => Math.max(1, Math.round((m * 52) / 12));

export function spanName(weeks: number): string {
  const preset = SPANS.find((x) => x.weeks === weeks);
  if (preset) return t(preset.key).toLowerCase();
  const m = weeksToMonths(weeks);
  return m === 1 ? t('setup.about.oneMonth') : t('setup.about.months', { n: m });
}

/** Changes the pay unit, converting the goal and the minimum so they mean the same pay. */
export function setPayUnit(s: Settings, to: PayUnit): void {
  const from = s.about.payUnit;
  if (from === to) return;
  const w = s.about.windowWeeks;
  if (s.about.payGoal != null) s.about.payGoal = convertPay(s.about.payGoal, from, to, w);
  if (s.dealbreakers.minTakeHome != null)
    s.dealbreakers.minTakeHome = convertPay(s.dealbreakers.minTakeHome, from, to, w);
  s.about.payUnit = to;
}

/** "per hour", "per year", or "total over 6 months". */
export function unitName(unit: PayUnit, weeks: number | null): string {
  if (unit === 'total' && weeks) return t('pay.unit.total', { span: spanName(weeks) });
  return unit === 'hour' ? t('pay.unit.hour') : t('pay.unit.year');
}

/** Pay unit picker shared by the pay goal and the minimum pay. */
export function PayUnitSelect({ id, label }: { id: string; label: string }) {
  const { settings, update } = useApp();
  const a = settings.about;
  return (
    <select
      id={id}
      aria-label={label}
      className="select"
      style={{ width: 'auto' }}
      value={a.payUnit}
      onChange={(e) => update((s) => setPayUnit(s, e.target.value as PayUnit))}
    >
      <option value="hour">{unitName('hour', null)}</option>
      <option value="year">{unitName('year', null)}</option>
      {a.windowWeeks != null && <option value="total">{unitName('total', a.windowWeeks)}</option>}
    </select>
  );
}

/** What a goal in one unit means in the others, at 40 hours a week. */
function equivalents(amount: number, unit: PayUnit, weeks: number | null): string {
  const parts: string[] = [];
  if (unit !== 'hour')
    parts.push(t('pay.equiv.hour', { amount: formatRate(convertPay(amount, unit, 'hour', weeks)) }));
  if (unit !== 'year')
    parts.push(t('pay.equiv.year', { amount: formatMoney(convertPay(amount, unit, 'year', weeks)) }));
  if (unit !== 'total' && weeks)
    parts.push(
      t('pay.equiv.total', {
        amount: formatMoney(convertPay(amount, unit, 'total', weeks)),
        span: spanName(weeks),
      }),
    );
  return t('pay.equiv.line', { list: parts.join(t('pay.equiv.or')) });
}

/** How far ahead the person is planning (or no set time frame), and their pay goal in their own unit. */
function PayWindow() {
  const { settings, update } = useApp();
  const a = settings.about;
  const W = a.windowWeeks;
  const isPreset = W != null && SPANS.some((x) => x.weeks === W);
  const [other, setOther] = useState(W != null && !isPreset);
  const showOther = W != null && (other || !isPreset);
  const setWindow = (weeks: number | null) =>
    update((s) => {
      // "Total over the time frame" needs a time frame; without one, keep the same pay per year.
      if (weeks == null && s.about.payUnit === 'total') setPayUnit(s, 'year');
      s.about.windowWeeks = weeks;
    });
  return (
    <div className="pay-window">
      <fieldset>
        <legend>{t('setup.about.window')}</legend>
        <div className="field-hint" style={{ marginTop: -4, marginBottom: 10 }}>
          {t('setup.about.windowHint2')}
        </div>
        <div className="row-wrap">
          {SPANS.map((x) => (
            <button
              key={x.weeks}
              type="button"
              className="seg"
              aria-pressed={!showOther && W === x.weeks}
              onClick={() => {
                setOther(false);
                setWindow(x.weeks);
              }}
            >
              {t(x.key)}
            </button>
          ))}
          <button
            type="button"
            className="seg"
            aria-pressed={showOther}
            onClick={() => {
              setOther(true);
              if (W == null) setWindow(52);
            }}
          >
            {t('setup.about.span.other')}
          </button>
          <button
            type="button"
            className="seg"
            aria-pressed={W == null}
            onClick={() => {
              setOther(false);
              setWindow(null);
            }}
          >
            {t('setup.about.span.none')}
          </button>
          {showOther && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <NumberField
                id="ab-months"
                ariaLabel={t('setup.about.customMonths')}
                width={80}
                min={1}
                max={36}
                value={weeksToMonths(W)}
                onSave={(v) => v && v > 0 && setWindow(monthsToWeeks(v))}
              />
              <span style={{ fontSize: 14 }}>{t('setup.about.monthsUnit')}</span>
            </span>
          )}
        </div>
        <div className="example-line">
          {W != null
            ? t('setup.about.windowExample', { total: formatMoney(20 * 40 * W), span: spanName(W) })
            : t('setup.about.rateExample', { per: unitName(a.payUnit, null) })}
        </div>
      </fieldset>
      <div>
        <label htmlFor="ab-goal" className="field-label">
          {t('setup.about.goalLabel')}
        </label>
        <div className="row-wrap" style={{ gap: 8 }}>
          <div className="money-input">
            <span aria-hidden="true">$</span>
            <NumberField
              id="ab-goal"
              min={0}
              step={a.payUnit === 'hour' ? 0.5 : 500}
              value={a.payGoal}
              onSave={(v) => update((s) => void (s.about.payGoal = v && v > 0 ? v : null))}
            />
          </div>
          <PayUnitSelect id="ab-goal-unit" label={t('pay.unit.label')} />
        </div>
        <div className="field-hint">
          {a.payGoal ? equivalents(a.payGoal, a.payUnit, W) + ' ' : ''}
          {t('setup.about.goalHint2')}
        </div>
      </div>
    </div>
  );
}

export function AboutForm() {
  const { settings, update } = useApp();
  const a = settings.about;
  const [lang, setLang] = useState('');
  const [level, setLevel] = useState<LanguageLevel>('fluent');
  const save = (fn: (x: typeof a) => void) => update((s) => void fn(s.about));
  const levelName = (l: LanguageLevel) => t(`setup.about.level.${l}`);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <label htmlFor="ab-target" className="field-label">
          {t('setup.about.target')}
        </label>
        <DraftField
          id="ab-target"
          multiline
          value={a.targetWork}
          onSave={(v) => save((x) => void (x.targetWork = v))}
        />
        <div className="field-hint">{t('setup.about.targetHint')}</div>
      </div>
      <div>
        <label htmlFor="ab-enjoys" className="field-label">
          {t('setup.about.enjoys')}
        </label>
        <DraftField
          id="ab-enjoys"
          multiline
          value={a.enjoys}
          onSave={(v) => save((x) => void (x.enjoys = v))}
        />
        <div className="field-hint">{t('setup.about.enjoysHint')}</div>
      </div>
      <div>
        <label htmlFor="ab-home" className="field-label">
          {t('setup.about.home')}
        </label>
        <DraftField
          id="ab-home"
          maxWidth={360}
          value={a.homeBase}
          onSave={(v) => save((x) => void (x.homeBase = v))}
        />
      </div>
      <fieldset>
        <legend>{t('setup.about.community')}</legend>
        <Segmented
          options={[
            ['very', t('setup.about.community.very')],
            ['somewhat', t('setup.about.community.somewhat')],
            ['not', t('setup.about.community.not')],
          ]}
          value={a.communityImportance}
          onChange={(v) => save((x) => void (x.communityImportance = v))}
        />
      </fieldset>
      <div style={{ display: 'flex', gap: '20px 32px', flexWrap: 'wrap' }}>
        {(['remote', 'relocate'] as const).map((k) => (
          <fieldset key={k}>
            <legend>{k === 'remote' ? t('setup.about.remote') : t('setup.about.relocate')}</legend>
            <Segmented
              options={[
                ['yes', t('setup.about.yes')],
                ['maybe', t('setup.about.maybe')],
                ['no', t('setup.about.no')],
              ]}
              value={a[k]}
              onChange={(v) => save((x) => void (x[k] = v))}
            />
          </fieldset>
        ))}
      </div>
      <fieldset>
        <legend>{t('setup.about.languages')}</legend>
        <div className="row-wrap">
          {a.languages.map((l, i) => (
            <div key={`${l.name}-${i}`} className="lang-chip">
              <span style={{ fontSize: 14 }}>{l.name}</span>
              <select
                aria-label={t('setup.about.levelOf', { name: l.name })}
                value={l.level}
                onChange={(e) =>
                  save(
                    (x) => void (x.languages[i] = { name: l.name, level: e.target.value as LanguageLevel }),
                  )
                }
              >
                {LEVELS.map((lv) => (
                  <option key={lv} value={lv}>
                    {levelName(lv)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="inline-x"
                aria-label={t('setup.about.removeLanguage', { name: l.name })}
                onClick={() => save((x) => void x.languages.splice(i, 1))}
              >
                <Close size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="row-wrap" style={{ marginTop: 10 }}>
          <input
            aria-label={t('setup.about.languageName')}
            type="text"
            className="input"
            style={{ flex: '0 1 200px', minWidth: 0 }}
            value={lang}
            onChange={(e) => setLang(e.target.value)}
          />
          <select
            aria-label={t('setup.about.level')}
            className="select"
            style={{ width: 'auto' }}
            value={level}
            onChange={(e) => setLevel(e.target.value as LanguageLevel)}
          >
            {LEVELS.map((lv) => (
              <option key={lv} value={lv}>
                {levelName(lv)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn"
            onClick={() => {
              const n = lang.trim();
              if (!n) return;
              save((x) => void x.languages.push({ name: n, level }));
              setLang('');
            }}
          >
            {t('setup.about.addLanguage')}
          </button>
        </div>
      </fieldset>
      <PayWindow />
    </div>
  );
}
