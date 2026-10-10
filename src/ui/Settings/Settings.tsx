// Settings, nine sections, saved instantly with "Saved". Blueprint section 11, matched to the approved demo.
import { useEffect, useState } from 'react';
import { INTERVALS } from '../../core/defaults';
import { rescoreAllPick } from '../../core/rescore';
import type { ModelChoice } from '../../core/types';
import { sampleJobRecords } from '../../dev/sample';
import { t } from '../../i18n/t';
import { costPerJob, formatCost } from '../../llm/cost';
import { send } from '../../messages';
import { buildExport, diagnostics } from '../../store/export';
import { clearSampleJobs, deleteClosedJobs, putSampleJobs } from '../../store/jobs';
import { formatLogLine, recentLog } from '../../store/log';
import { getApiKey } from '../../store/settings';
import { pickProfile } from '../actions';
import { useApp } from '../AppContext';
import { Segmented } from '../components';
import { downloadJson } from '../Banner';
import { SwitchRow } from '../components';
import { AboutForm, NumberField } from '../forms/AboutForm';
import { DealForm } from '../forms/DealForm';
import { EmailForm } from '../forms/EmailForm';
import { forgetKey, KeyInput, KeyResult, saveKey, testKey, type KeyTest } from '../forms/KeyForm';
import { PriorityForm } from '../forms/PriorityForm';
import { LINKS, openExternal } from '../hooks';
import { Check } from '../Icons';
import { DimensionEditor } from './DimensionEditor';

const SECTIONS = [
  'key',
  'about',
  'priorities',
  'deal',
  'email',
  'scoring',
  'appearance',
  'data',
  'help',
  'dev',
] as const;
type Section = (typeof SECTIONS)[number];

const TITLES: Record<Section, Parameters<typeof t>[0]> = {
  key: 'settings.key',
  about: 'settings.about',
  priorities: 'settings.priorities',
  deal: 'settings.deal',
  email: 'settings.email',
  scoring: 'settings.scoring',
  appearance: 'settings.appearance',
  data: 'settings.data',
  help: 'settings.help',
  dev: 'settings.dev.title',
};

export function Settings({ section }: { section: string }) {
  const { settings, saved, go } = useApp();
  let sec = (SECTIONS as readonly string[]).includes(section) ? (section as Section) : 'key';
  if (sec === 'dev' && !settings.developerMode) sec = 'help';
  const nav = SECTIONS.filter((s) => s !== 'dev' || settings.developerMode);

  return (
    <div className="wrap page" style={{ paddingBottom: 48 }}>
      <nav aria-label={t('settings.title')} className="card settings-nav">
        {nav.map((s) => (
          <button
            key={s}
            type="button"
            aria-current={s === sec ? 'page' : undefined}
            onClick={() => go(`settings/${s}`)}
          >
            {t(TITLES[s])}
          </button>
        ))}
      </nav>
      <div className="card form-card" style={{ flex: '999 1 560px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 22 }}>{t(TITLES[sec])}</h1>
          {saved && (
            <span
              role="status"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 13,
                color: 'var(--teal-dark)',
              }}
            >
              <Check size={14} />
              {t('common.saved')}
            </span>
          )}
        </div>
        {sec === 'key' && <KeySection />}
        {sec === 'about' && <AboutForm />}
        {sec === 'priorities' && <PrioritiesSection />}
        {sec === 'deal' && <DealForm />}
        {sec === 'email' && <EmailForm mode="settings" />}
        {sec === 'scoring' && <ScoringSection />}
        {sec === 'appearance' && <AppearanceSection />}
        {sec === 'data' && <DataSection />}
        {sec === 'help' && <HelpSection />}
        {sec === 'dev' && <DevSection />}
      </div>
    </div>
  );
}

function KeySection() {
  const { settings, update, key, confirm } = useApp();
  const [changing, setChanging] = useState(false);
  const [test, setTest] = useState<KeyTest>(null);
  const models: [ModelChoice, string][] = [
    ['standard', t('settings.key.standard')],
    ['sharper', t('settings.key.sharper')],
  ];
  return (
    <>
      {key.hasKey && !changing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="row-wrap">
            <span
              className="mono"
              style={{
                flex: '1 1 200px',
                fontSize: 14,
                padding: 12,
                background: 'var(--bg)',
                borderRadius: 8,
              }}
            >
              {t('settings.key.current', { last4: key.last4 })}
            </span>
            <button type="button" className="btn" onClick={() => setChanging(true)}>
              {t('settings.key.change')}
            </button>
            <button
              type="button"
              className="btn"
              disabled={test === 'testing'}
              onClick={async () => {
                setTest('testing');
                const k = await getApiKey();
                const r = k ? await testKey(k) : 'bad';
                setTest(r);
                if (r === 'ok') void send({ type: 'keyChanged' });
              }}
            >
              {test === 'testing' ? t('setup.key.testing') : t('settings.key.test')}
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={() =>
                confirm({
                  text: t('settings.key.removeConfirm'),
                  confirmLabel: t('settings.key.remove'),
                  onConfirm: async () => {
                    await forgetKey();
                    setTest(null);
                  },
                })
              }
            >
              {t('settings.key.remove')}
            </button>
          </div>
          <KeyResult test={test} />
        </div>
      ) : (
        <KeyInput
          onPassed={(k) => {
            void saveKey(k).then(() => {
              setChanging(false);
              setTest(null);
            });
          }}
          onCancel={changing ? () => setChanging(false) : undefined}
        />
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          borderTop: '1px solid var(--rule)',
          paddingTop: 16,
        }}
      >
        <div
          role="radiogroup"
          aria-labelledby="lbl-model"
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          <span id="lbl-model" style={{ fontSize: 13, fontWeight: 500 }}>
            {t('settings.key.model')}
          </span>
          {models.map(([id, label]) => {
            const on = settings.model === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={on}
                className="seg"
                style={{
                  minHeight: 48,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  textAlign: 'left',
                  fontWeight: 400,
                  color: 'var(--text)',
                }}
                onClick={() => update((s) => void (s.model = id))}
              >
                <span
                  style={{
                    display: 'inline-block',
                    flex: 'none',
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    border: on ? '5px solid var(--teal)' : '2px solid var(--gray-switch)',
                    background: 'var(--card)',
                  }}
                />
                {label}
              </button>
            );
          })}
        </div>
        <div>
          <button type="button" className="link-btn" onClick={() => openExternal(LINKS.limits)}>
            {t('settings.key.limit')}
          </button>
        </div>
        <p className="note-amber">{t('setup.key.limitTip')}</p>
      </div>
    </>
  );
}

function AppearanceSection() {
  const { settings, update } = useApp();
  return (
    <fieldset>
      <legend>{t('settings.appearance.theme')}</legend>
      <Segmented
        options={[
          ['system', t('settings.appearance.system')],
          ['light', t('settings.appearance.light')],
          ['dark', t('settings.appearance.dark')],
        ]}
        value={settings.ui.theme}
        onChange={(v) => update((s) => void (s.ui.theme = v))}
      />
      <div className="field-hint" style={{ marginTop: 8 }}>
        {t('settings.appearance.hint')}
      </div>
    </fieldset>
  );
}

function PrioritiesSection() {
  const { update, jobs } = useApp();
  return (
    <>
      <PriorityForm />
      <DimensionEditor />
      <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 8 }}>
        <button type="button" className="link-btn" onClick={() => pickProfile(update, jobs, 'balanced')}>
          {t('settings.priorities.reset')}
        </button>
      </div>
    </>
  );
}

function ScoringSection() {
  const { settings, update, toast, key, jobs, confirm } = useApp();
  const sc = settings.scoring;
  const toRescore = jobs.filter(rescoreAllPick).length;
  const [shortcut, setShortcut] = useState<string | null>(null);
  useEffect(() => {
    void chrome.commands
      .getAll()
      .then((cs) => setShortcut(cs.find((c) => c.name === 'score-page')?.shortcut || ''))
      .catch(() => setShortcut(''));
  }, []);
  const toggle = (k: 'autoScore' | 'upgradeOnVisit' | 'notify' | 'spread') =>
    update((s) => void (s.scoring[k] = !s.scoring[k]));
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="switch-row" style={{ flexWrap: 'wrap', paddingBottom: 8 }}>
        <span className="label" style={{ flex: '1 1 260px' }}>
          {t('settings.scoring.rescoreAll')}
          <span className="hint">{t('settings.scoring.rescoreAllHint')}</span>
        </span>
        <button
          type="button"
          className="btn"
          disabled={!key.hasKey}
          onClick={() =>
            toRescore
              ? confirm({
                  text: t('settings.scoring.rescoreAllConfirm', {
                    count: toRescore,
                    cost: formatCost(toRescore * costPerJob(settings.model)),
                  }),
                  confirmLabel: t('settings.scoring.rescoreAllButton'),
                  onConfirm: () =>
                    void send<number>({ type: 'rescoreAll' }).then((n) =>
                      toast(t('settings.scoring.rescoreAllStarted', { count: n })),
                    ),
                })
              : toast(t('settings.scoring.rescoreAllNone'))
          }
        >
          {t('settings.scoring.rescoreAllButton')}
        </button>
      </div>
      <SwitchRow
        id="lbl-spread"
        label={t('settings.scoring.spread')}
        hint={t('settings.scoring.spreadHint')}
        on={sc.spread}
        onToggle={() => toggle('spread')}
      />
      <SwitchRow
        id="lbl-auto"
        label={t('settings.scoring.auto')}
        hint={t('settings.scoring.autoHint')}
        on={sc.autoScore}
        onToggle={() => toggle('autoScore')}
      />
      <SwitchRow
        id="lbl-upgrade"
        label={t('settings.scoring.upgrade')}
        on={sc.upgradeOnVisit}
        onToggle={() => toggle('upgradeOnVisit')}
      />
      <SwitchRow
        id="lbl-notify"
        label={t('settings.scoring.notify')}
        on={sc.notify}
        onToggle={() => toggle('notify')}
      />
      {sc.notify && (
        <div className="switch-row" style={{ flexWrap: 'wrap' }}>
          <label htmlFor="sc-threshold" style={{ flex: '1 1 220px', fontSize: 14 }}>
            {t('settings.scoring.threshold')}
          </label>
          <NumberField
            id="sc-threshold"
            width={100}
            mono
            min={1}
            max={10}
            step={0.5}
            value={sc.notifyThreshold}
            onSave={(v) =>
              v != null && v >= 1 && v <= 10 && update((s) => void (s.scoring.notifyThreshold = v))
            }
          />
        </div>
      )}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: '8px 12px', minHeight: 56, flexWrap: 'wrap' }}
      >
        <span style={{ flex: '1 1 160px', fontSize: 14 }}>{t('settings.scoring.shortcut')}</span>
        <span
          className="mono"
          style={{
            fontSize: 13,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '6px 10px',
          }}
        >
          {shortcut === null ? '…' : shortcut || t('settings.scoring.shortcutNone')}
        </span>
        <button type="button" className="link-btn" onClick={() => openExternal(LINKS.shortcuts)}>
          {t('settings.scoring.shortcutChange')}
        </button>
      </div>
    </div>
  );
}

function DataSection() {
  const { settings, update, confirm, toast, status: app } = useApp();
  const keep = settings.retentionDays == null ? 'forever' : String(settings.retentionDays);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text-3)' }}>{t('settings.data.where')}</p>
      <div>
        <label htmlFor="dt-keep" className="field-label">
          {t('settings.data.keep')}
        </label>
        <select
          id="dt-keep"
          className="select"
          style={{ width: 'auto', minWidth: 180 }}
          value={keep}
          onChange={(e) =>
            update(
              (s) => void (s.retentionDays = e.target.value === 'forever' ? null : Number(e.target.value)),
            )
          }
        >
          <option value="30">{t('settings.data.30')}</option>
          <option value="90">{t('settings.data.90')}</option>
          <option value="365">{t('settings.data.365')}</option>
          <option value="forever">{t('settings.data.forever')}</option>
        </select>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          borderTop: '1px solid var(--rule)',
          paddingTop: 16,
        }}
      >
        <div>
          <button
            type="button"
            className="btn"
            onClick={() => void buildExport().then((f) => downloadJson('fulcra-export.json', f))}
          >
            {t('settings.data.export')}
          </button>
        </div>
        <div className="small-note">{t('settings.data.exportNote')}</div>
      </div>
      <div className="row-wrap" style={{ borderTop: '1px solid var(--rule)', paddingTop: 16 }}>
        <button
          type="button"
          className="btn"
          onClick={() => void deleteClosedJobs().then(() => toast(t('settings.data.closedDeleted')))}
        >
          {t('settings.data.deleteClosed')}
        </button>
      </div>
      <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 16 }}>
        <h2 style={{ fontSize: 15, marginBottom: 4 }}>{t('settings.data.reset')}</h2>
        <p className="small-note" style={{ margin: '0 0 10px' }}>
          {t('settings.data.resetHint')}
        </p>
        <button
          type="button"
          className="btn danger-outline"
          disabled={app.emailRunning}
          onClick={() =>
            confirm({
              text: t('settings.data.resetConfirm'),
              confirmLabel: t('settings.data.resetButton'),
              onConfirm: async () => {
                await send({ type: 'hardReset' });
                // Reload so nothing on this page saves its old settings back.
                location.hash = 'setup/0';
                location.reload();
              },
            })
          }
        >
          {t('settings.data.resetButton')}
        </button>
        {app.emailRunning && <div className="small-note">{t('settings.data.resetWait')}</div>}
      </div>
    </div>
  );
}

function HelpSection() {
  const { settings, update } = useApp();
  const [copied, setCopied] = useState(false);
  const [log, setLog] = useState<string[] | null>(null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="mono" style={{ fontSize: 13, color: 'var(--text-3)' }}>
        {t('settings.help.version', { version: chrome.runtime.getManifest().version })}
      </div>
      <div className="row-wrap">
        <button
          type="button"
          className="btn"
          onClick={async () => {
            await navigator.clipboard.writeText(await diagnostics());
            setCopied(true);
            setTimeout(() => setCopied(false), 3000);
          }}
        >
          {t('settings.help.copy')}
        </button>
        <button type="button" className="btn" onClick={() => openExternal(LINKS.issues)}>
          {t('settings.help.report')}
        </button>
        <button
          type="button"
          className="btn"
          aria-expanded={log != null}
          onClick={async () => setLog(log ? null : (await recentLog(200)).map(formatLogLine))}
        >
          {t('settings.help.log')}
        </button>
      </div>
      {copied && (
        <div role="status" style={{ fontSize: 14, color: 'var(--teal-dark)' }}>
          {t('settings.help.copied')}
        </div>
      )}
      {log && (
        <div className="mono-box">
          {log.length ? (
            log.map((l, i) => (
              <div key={i} style={{ whiteSpace: 'pre' }}>
                {l}
              </div>
            ))
          ) : (
            <div>–</div>
          )}
        </div>
      )}
      <div style={{ borderTop: '1px solid var(--rule)', marginTop: 8 }}>
        <SwitchRow
          id="lbl-dev"
          label={t('settings.help.developer')}
          on={settings.developerMode}
          onToggle={() => update((s) => void (s.developerMode = !s.developerMode))}
        />
      </div>
    </div>
  );
}

function DevSection() {
  const { settings, update, toast } = useApp();
  const m = settings.email.intervalMinutes;
  const value = m >= 1440 ? 'daily' : m >= 360 ? 'six' : m >= 60 ? 'hourly' : m >= 5 ? 'm5' : 's30';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div className="switch-row" style={{ flexWrap: 'wrap' }}>
        <label htmlFor="dv-interval" style={{ flex: '1 1 200px', fontSize: 14 }}>
          {t('settings.dev.interval')}
        </label>
        <select
          id="dv-interval"
          className="select"
          style={{ width: 'auto', minWidth: 200 }}
          value={value}
          onChange={(e) => {
            const v = {
              daily: INTERVALS.daily,
              six: INTERVALS.sixHours,
              hourly: INTERVALS.hourly,
              m5: INTERVALS.fiveMinutes,
              s30: INTERVALS.thirtySeconds,
            }[e.target.value];
            if (v != null) {
              update((s) => void (s.email.intervalMinutes = v));
              void send({ type: 'emailScheduleChanged' });
            }
          }}
        >
          <option value="daily">{t('setup.email.daily')}</option>
          <option value="six">{t('setup.email.sixHours')}</option>
          <option value="hourly">{t('setup.email.hourly')}</option>
          <option value="m5">{t('settings.dev.interval5m')}</option>
          <option value="s30">{t('settings.dev.interval30s')}</option>
        </select>
      </div>
      <SwitchRow
        id="lbl-verbose"
        label={t('settings.dev.verbose')}
        on={settings.verboseLog}
        onToggle={() => update((s) => void (s.verboseLog = !s.verboseLog))}
      />
      <SwitchRow
        id="lbl-raw"
        label={t('settings.dev.raw')}
        on={settings.showRawOutput}
        onToggle={() => update((s) => void (s.showRawOutput = !s.showRawOutput))}
      />
      <div className="row-wrap" style={{ paddingTop: 12 }}>
        <button
          type="button"
          className="btn"
          onClick={() =>
            void putSampleJobs(sampleJobRecords()).then(() => toast(t('settings.dev.sampleLoaded')))
          }
        >
          {t('settings.dev.sample')}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void clearSampleJobs().then(() => toast(t('settings.dev.sampleCleared')))}
        >
          {t('settings.dev.clearSample')}
        </button>
      </div>
    </div>
  );
}
