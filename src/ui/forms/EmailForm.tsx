// Job alert emails. Setup step 5 and Settings > Job alert emails.
import { useEffect, useState } from 'react';
import { INTERVALS } from '../../core/defaults';
import { t, type MessageKey } from '../../i18n/t';
import { costPerJob, formatCost } from '../../llm/cost';
import { send } from '../../messages';
import { COUNTS_KEY } from '../../email/run';
import type {
  EmailCheckResult,
  Provider,
  Range,
  RangeCount,
  SavedCounts,
  SignInResult,
} from '../../email/types';
import { JOBS_PER_ALERT } from '../../email/types';
import { updateStatus } from '../../store/settings';
import { useApp } from '../AppContext';
import { Spinner } from '../components';
import { relativeTime } from '../format';
import { Check, Close } from '../Icons';

const RANGES: Range[] = ['7', '30', '90', 'all'];
const RANGE_DAYS: Record<Range, number | null> = { '7': 7, '30': 30, '90': 90, all: null };
const RANGE_LABEL: Record<Range, MessageKey> = {
  '7': 'setup.email.import7',
  '30': 'setup.email.import30',
  '90': 'setup.email.import90',
  all: 'setup.email.importAll',
};

function rangeOf(days: number | null): Range {
  return days == null ? 'all' : days <= 7 ? '7' : days <= 30 ? '30' : '90';
}

const providerName = (p: Provider) => (p === 'gmail' ? t('setup.email.gmail') : t('setup.email.outlook'));
const plus = (c: RangeCount, n: number) => `${n.toLocaleString('en-US')}${c.atLeast ? '+' : ''}`;

/** Counts from the last sign-in check, kept in storage so Settings can show them later. */
function useSavedCounts(): SavedCounts | null {
  const [saved, setSaved] = useState<SavedCounts | null>(null);
  useEffect(() => {
    void chrome.storage.local.get(COUNTS_KEY).then((r) => setSaved((r[COUNTS_KEY] as SavedCounts) ?? null));
    const l = (c: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && c[COUNTS_KEY]) setSaved((c[COUNTS_KEY].newValue as SavedCounts) ?? null);
    };
    chrome.storage.onChanged.addListener(l);
    return () => chrome.storage.onChanged.removeListener(l);
  }, []);
  return saved;
}

/** The sentence shown after "Check now" or "Import". */
export function checkResultText(r: EmailCheckResult): string | null {
  const p = r.provider ? providerName(r.provider) : '';
  switch (r.status) {
    case 'ok':
      if (r.askedFirst) return t('email.result.asked', { count: r.newJobs });
      if (r.emails === 0) return t('email.result.none', { provider: p });
      return t('email.result.done', { provider: p, emails: r.emails, count: r.newJobs });
    case 'signedOut':
      return t('setup.email.signedOut', { provider: p });
    case 'changed':
      return t('err.mailChanged', { provider: p });
    case 'busy':
      return t('setup.email.busy');
    case 'error':
      return t('email.result.error');
    default:
      return null;
  }
}

function lastCheckText(last: { at: number; result: string; count: number | null }): string {
  const result =
    last.result === 'ok'
      ? last.count
        ? t('settings.email.resultNew', { count: last.count })
        : t('settings.email.resultNone')
      : last.result === 'MAIL_SIGNED_OUT'
        ? t('email.problem.signedOut')
        : last.result === 'MAIL_CHANGED'
          ? t('email.problem.changed')
          : t('email.problem.error');
  return t('settings.email.last', { when: relativeTime(last.at), result });
}

export function EmailForm({ mode, onNotNow }: { mode: 'setup' | 'settings'; onNotNow?: () => void }) {
  const { settings, update, status } = useApp();
  const e = settings.email;
  const [checking, setChecking] = useState<Provider | null>(null);
  const [result, setResult] = useState<SignInResult | null>(null);
  const [runResult, setRunResult] = useState<EmailCheckResult | null>(null);
  const [running, setRunning] = useState(false);
  const [sender, setSender] = useState('');
  const saved = useSavedCounts();
  const connected = e.provider;

  const pick = async (p: Provider, account = e.accountIndex) => {
    setChecking(p);
    setResult(null);
    setRunResult(null);
    const r =
      (await send<SignInResult | undefined>({ type: 'emailSignInCheck', provider: p, account }).catch(
        () => undefined,
      )) ?? ({ status: 'error', provider: p, emailCounts: null } satisfies SignInResult);
    setChecking(null);
    setResult(r);
    if (r.status === 'ok') {
      const switched = e.provider !== p || account !== e.accountIndex;
      update((s) => {
        s.email.provider = p;
        s.email.accountIndex = account;
        // Another inbox: the last check's result and look-back no longer apply.
        if (switched) {
          s.email.lastCheck = null;
          s.email.lastOkAt = null;
        }
      });
      if (switched) await updateStatus({ emailProblem: null });
      void send({ type: 'emailScheduleChanged' });
    }
  };

  const run = async (msg: { type: 'emailCheckNow' } | { type: 'emailImport'; days: number | null }) => {
    setRunning(true);
    setRunResult(null);
    setResult(null);
    const r =
      (await send<EmailCheckResult | undefined>(msg).catch(() => undefined)) ??
      ({
        status: 'error',
        provider: e.provider,
        emails: 0,
        newJobs: 0,
        askedFirst: false,
      } satisfies EmailCheckResult);
    setRunning(false);
    setRunResult(r);
  };

  const range = rangeOf(e.importDays);
  const counts = saved && saved.provider === connected ? saved.counts : null;
  const intervalValue = e.intervalMinutes >= 1440 ? 'daily' : e.intervalMinutes >= 360 ? 'six' : 'hourly';
  const setInterval = (v: string) => {
    const m = { daily: INTERVALS.daily, six: INTERVALS.sixHours, hourly: INTERVALS.hourly }[v];
    if (m) {
      update((s) => void (s.email.intervalMinutes = m));
      void send({ type: 'emailScheduleChanged' });
    }
  };
  const busy = checking != null || running || status.emailRunning;
  const signInMessage =
    result && result.status !== 'ok'
      ? result.status === 'signedOut'
        ? t('setup.email.signedOut', { provider: providerName(result.provider ?? 'gmail') })
        : result.status === 'changed'
          ? t('err.mailChanged', { provider: providerName(result.provider ?? 'gmail') })
          : result.status === 'busy'
            ? t('setup.email.busy')
            : t('err.unknown')
      : null;
  const other: Provider = connected === 'gmail' ? 'outlook' : 'gmail';
  const runText = runResult ? checkResultText(runResult) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Which inbox */}
      {connected ? (
        <div className="email-status">
          <span className={`dot ${status.emailProblem ? 'bad' : 'good'}`} aria-hidden="true" />
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              {t('settings.email.status.on', { provider: providerName(connected) })}
            </div>
            {e.lastCheck && <div className="small-note">{lastCheckText(e.lastCheck)}</div>}
          </div>
          <div className="row-wrap">
            <button type="button" className="btn" disabled={busy} onClick={() => void pick(other)}>
              {t('setup.email.switchTo', { provider: providerName(other) })}
            </button>
            {mode === 'settings' && (
              <button
                type="button"
                className="link-btn danger"
                onClick={() => {
                  update((s) => void (s.email.provider = null));
                  setResult(null);
                  setRunResult(null);
                  void updateStatus({ emailProblem: null });
                  void send({ type: 'emailScheduleChanged' });
                }}
              >
                {t('settings.email.disconnect')}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div role="group" aria-label={t('settings.email')} className="row-wrap">
          {(['gmail', 'outlook'] as const).map((p) => (
            <button
              key={p}
              type="button"
              className="seg"
              style={{ minWidth: 120 }}
              disabled={busy}
              onClick={() => void pick(p)}
            >
              {providerName(p)}
            </button>
          ))}
          {mode === 'setup' && (
            <button type="button" className="btn" onClick={onNotNow}>
              {t('setup.email.notNow')}
            </button>
          )}
        </div>
      )}

      {checking && (
        <div role="status" className="row-wrap" style={{ fontSize: 14, color: 'var(--text-3)' }}>
          <Spinner />
          {t('setup.email.checkingProvider', { provider: providerName(checking) })}
        </div>
      )}
      {result?.status === 'ok' && !checking && (
        <div role="status" className="row-wrap" style={{ fontSize: 14, color: 'var(--teal-dark)' }}>
          <Check />
          {t('setup.email.signedInTo', { provider: providerName(result.provider ?? 'gmail') })}
        </div>
      )}
      {signInMessage && (
        <div role="status" className="note-red">
          {signInMessage}
          {connected && result?.provider !== connected && (
            <> {t('setup.email.stillUsing', { provider: providerName(connected) })}</>
          )}
        </div>
      )}

      {connected === 'gmail' && (
        <div>
          <label htmlFor="em-account" className="field-label">
            {t('setup.email.account')}
          </label>
          <select
            id="em-account"
            className="select"
            style={{ width: 'auto', minWidth: 240 }}
            value={e.accountIndex}
            disabled={busy}
            onChange={(ev) => void pick('gmail', Number(ev.target.value))}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <option key={i} value={i}>
                {t('setup.email.accountOption', { n: i + 1, index: i })}
              </option>
            ))}
          </select>
          <div className="field-hint">{t('setup.email.accountHint')}</div>
        </div>
      )}

      {connected && (
        <>
          <div>
            <label htmlFor="em-freq" className="field-label">
              {t('setup.email.frequency')}
            </label>
            <div className="row-wrap">
              <select
                id="em-freq"
                className="select"
                style={{ width: 'auto', minWidth: 200 }}
                value={intervalValue}
                onChange={(ev) => setInterval(ev.target.value)}
              >
                <option value="daily">{t('setup.email.daily')}</option>
                <option value="six">{t('setup.email.sixHours')}</option>
                <option value="hourly">{t('setup.email.hourly')}</option>
              </select>
              {mode === 'settings' && (
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => void run({ type: 'emailCheckNow' })}
                >
                  {t('settings.email.checkNow')}
                </button>
              )}
            </div>
            <div className="field-hint">{t('setup.email.frequencyHint')}</div>
          </div>

          <fieldset>
            <legend>{t('setup.email.import')}</legend>
            <div className="choice-list" role="radiogroup" aria-label={t('setup.email.import')}>
              {RANGES.map((r) => {
                const c = counts?.[r];
                const jobs = c ? Math.round(c.n * JOBS_PER_ALERT) : null;
                return (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={range === r}
                    className="choice"
                    onClick={() => update((s) => void (s.email.importDays = RANGE_DAYS[r]))}
                  >
                    <span className="radio" aria-hidden="true" />
                    <span style={{ flex: '1 1 120px' }}>{t(RANGE_LABEL[r])}</span>
                    {c && jobs != null && (
                      <span className="mono small-note">
                        {c.n === 0
                          ? t('setup.email.rangeNone')
                          : t('setup.email.rangeEstimate', {
                              emails: plus(c, c.n),
                              jobs: plus(c, jobs),
                              cost: formatCost(jobs * costPerJob(settings.model)) + (c.atLeast ? '+' : ''),
                            })}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="field-hint" style={{ marginTop: 8 }}>
              {!counts
                ? connected === 'outlook'
                  ? t('setup.email.noCountsOutlook')
                  : t('setup.email.noCounts')
                : mode === 'setup'
                  ? t('setup.email.importHintSetup')
                  : t('setup.email.importHint')}
            </div>
            {mode === 'settings' && (
              <div className="row-wrap" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => void run({ type: 'emailImport', days: e.importDays })}
                >
                  {t('setup.email.importButton', { range: t(RANGE_LABEL[range]).toLowerCase() })}
                </button>
                {counts && connected === 'gmail' && (
                  <button
                    type="button"
                    className="link-btn quiet"
                    disabled={busy}
                    onClick={() => void pick('gmail')}
                  >
                    {t('setup.email.recount')}
                  </button>
                )}
              </div>
            )}
          </fieldset>

          {(running || status.emailRunning) && mode === 'settings' && (
            <div role="status" className="row-wrap" style={{ fontSize: 14, color: 'var(--text-3)' }}>
              <Spinner />
              {t('banner.emailRunning')}
            </div>
          )}
          {runText && (
            <div role="status" className={runResult?.status === 'ok' ? 'note-gray' : 'note-red'}>
              {runText}
            </div>
          )}
        </>
      )}

      {connected && mode === 'settings' && (
        <fieldset>
          <legend style={{ marginBottom: 4 }}>{t('settings.email.senders')}</legend>
          <div className="small-note" style={{ marginBottom: 8 }}>
            {t('settings.email.sendersHint')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {e.senders.map((s, i) => (
              <div key={s} className="sender-row">
                <span
                  className="mono"
                  style={{ flex: 1, minWidth: 0, fontSize: 13, overflowWrap: 'anywhere' }}
                >
                  {s}
                </span>
                <button
                  type="button"
                  className="inline-x"
                  aria-label={t('settings.email.removeSender', { address: s })}
                  onClick={() => update((x) => void x.email.senders.splice(i, 1))}
                >
                  <Close size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="row-wrap" style={{ marginTop: 8 }}>
            <input
              aria-label={t('settings.email.senderLabel')}
              type="email"
              className="input"
              style={{ flex: '1 1 220px', minWidth: 0, width: 'auto' }}
              value={sender}
              onChange={(ev) => setSender(ev.target.value)}
            />
            <button
              type="button"
              className="btn"
              onClick={() => {
                const v = sender.trim().toLowerCase();
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || e.senders.includes(v)) return;
                update((x) => void x.email.senders.push(v));
                setSender('');
              }}
            >
              {t('settings.email.addSender')}
            </button>
          </div>
        </fieldset>
      )}

      <div className="info-box">
        <p>{t('setup.email.how')}</p>
        <p style={{ color: 'var(--text-2)' }}>{t('setup.email.chromeOpen')}</p>
      </div>
    </div>
  );
}
