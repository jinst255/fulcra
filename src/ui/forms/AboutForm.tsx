// "About you". Setup step 2 and Settings > About you.
import { useEffect, useRef, useState } from 'react';
import type { LanguageLevel } from '../../core/types';
import { formatMoney } from '../../core/pay';
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

function spanName(weeks: number): string {
  const preset = SPANS.find((x) => x.weeks === weeks);
  if (preset) return t(preset.key).toLowerCase();
  const m = weeksToMonths(weeks);
  return m === 1 ? t('setup.about.oneMonth') : t('setup.about.months', { n: m });
}

/** "Compare pay over": how far ahead the person is planning, shown with a worked example. */
function PayWindow() {
  const { settings, update } = useApp();
  const a = settings.about;
  const save = (fn: (x: typeof a) => void) => update((s) => void fn(s.about));
  const isPreset = SPANS.some((x) => x.weeks === a.windowWeeks);
  const [other, setOther] = useState(!isPreset);
  const showOther = other || !isPreset;
  const example = formatMoney(20 * 40 * a.windowWeeks);
  const goalHourly = a.payGoal && a.windowWeeks > 0 ? formatMoney(a.payGoal / (a.windowWeeks * 40)) : null;
  return (
    <div className="pay-window">
      <fieldset>
        <legend>{t('setup.about.window')}</legend>
        <div className="field-hint" style={{ marginTop: -4, marginBottom: 10 }}>
          {t('setup.about.windowHint')}
        </div>
        <div className="row-wrap">
          {SPANS.map((x) => (
            <button
              key={x.weeks}
              type="button"
              className="seg"
              aria-pressed={!showOther && a.windowWeeks === x.weeks}
              onClick={() => {
                setOther(false);
                save((v) => void (v.windowWeeks = x.weeks));
              }}
            >
              {t(x.key)}
            </button>
          ))}
          <button type="button" className="seg" aria-pressed={showOther} onClick={() => setOther(true)}>
            {t('setup.about.span.other')}
          </button>
          {showOther && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <NumberField
                id="ab-months"
                ariaLabel={t('setup.about.customMonths')}
                width={80}
                min={1}
                max={36}
                value={weeksToMonths(a.windowWeeks)}
                onSave={(v) => v && v > 0 && save((x) => void (x.windowWeeks = monthsToWeeks(v)))}
              />
              <span style={{ fontSize: 14 }}>{t('setup.about.monthsUnit')}</span>
            </span>
          )}
        </div>
        <div className="example-line">
          {t('setup.about.windowExample', { total: example, span: spanName(a.windowWeeks) })}
        </div>
      </fieldset>
      <div>
        <label htmlFor="ab-goal" className="field-label">
          {t('setup.about.goalOver', { span: spanName(a.windowWeeks) })}
        </label>
        <div className="money-input">
          <span aria-hidden="true">$</span>
          <NumberField
            id="ab-goal"
            min={0}
            step={500}
            value={a.payGoal}
            onSave={(v) => save((x) => void (x.payGoal = v && v > 0 ? v : null))}
          />
        </div>
        <div className="field-hint">
          {goalHourly ? t('setup.about.goalHourly', { hourly: goalHourly }) + ' ' : ''}
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
