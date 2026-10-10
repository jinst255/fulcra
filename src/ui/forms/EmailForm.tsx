// Job alert emails. Setup step 5 and Settings > Job alert emails.
import { useState } from 'react';
import { INTERVALS } from '../../core/defaults';
import { t } from '../../i18n/t';
import { costPerJob, formatCost } from '../../llm/cost';
import { send } from '../../messages';
import type { SignInResult } from '../../email/types';
import { JOBS_PER_ALERT } from '../../email/types';
import { useApp } from '../AppContext';
import { Segmented, Spinner } from '../components';
import { relativeTime } from '../format';
import { Check, Close } from '../Icons';

type Range = '7' | '30' | '90' | 'all';
const RANGE_DAYS: Record<Range, number | null> = { '7': 7, '30': 30, '90': 90, all: null };

function rangeOf(days: number | null): Range {
  return days == null ? 'all' : days <= 7 ? '7' : days <= 30 ? '30' : '90';
}

export function EmailForm({ mode, onNotNow }: { mode: 'setup' | 'settings'; onNotNow?: () => void }) {
  const { settings, update, status } = useApp();
  const e = settings.email;
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<SignInResult | null>(null);
  const [sender, setSender] = useState('');
  const connected = !!e.provider;
  const providerName = (p: 'gmail' | 'outlook') =>
    p === 'gmail' ? t('setup.email.gmail') : t('setup.email.outlook');

  const pick = async (p: 'gmail' | 'outlook') => {
    setChecking(true);
    setResult(null);
    const r =
      (await send<SignInResult | undefined>({ type: 'emailSignInCheck', provider: p }).catch(
        () => undefined,
      )) ?? ({ status: 'error', emailCounts: null } satisfies SignInResult);
    setChecking(false);
    setResult(r);
    if (r.status === 'ok') {
      update((s) => void (s.email.provider = p));
      void send({ type: 'emailScheduleChanged' });
    }
  };

  const range = rangeOf(e.importDays);
  const counts = result?.emailCounts;
  const jobs = counts ? Math.round(counts[range] * JOBS_PER_ALERT) : null;
  const intervalValue =
    e.intervalMinutes >= 1440
      ? 'daily'
      : e.intervalMinutes >= 360
        ? 'six'
        : e.intervalMinutes >= 60
          ? 'hourly'
          : e.intervalMinutes >= 5
            ? 'm5'
            : 's30';
  const setInterval = (v: string) => {
    const m = {
      daily: INTERVALS.daily,
      six: INTERVALS.sixHours,
      hourly: INTERVALS.hourly,
      m5: INTERVALS.fiveMinutes,
      s30: INTERVALS.thirtySeconds,
    }[v];
    if (m) {
      update((s) => void (s.email.intervalMinutes = m));
      void send({ type: 'emailScheduleChanged' });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {mode === 'settings' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: 5,
              background: connected ? 'var(--teal)' : 'var(--gray-switch)',
            }}
          />
          <span style={{ fontWeight: 500 }}>
            {connected
              ? t('settings.email.status.on', { provider: providerName(e.provider!) })
              : t('settings.email.status.off')}
          </span>
        </div>
      )}

      {(mode === 'setup' || !connected) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div role="group" aria-label={t('settings.email')} className="row-wrap">
            {(['gmail', 'outlook'] as const).map((p) => (
              <button
                key={p}
                type="button"
                className="seg"
                style={{ minWidth: 120 }}
                aria-pressed={e.provider === p}
                disabled={checking}
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
          {checking && (
            <div
              role="status"
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-3)' }}
            >
              <Spinner />
              {t('setup.email.checking')}
            </div>
          )}
          {result?.status === 'ok' && mode === 'setup' && (
            <div
              role="status"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 14,
                color: 'var(--teal-dark)',
              }}
            >
              <Check />
              {t('setup.email.signedIn')}
            </div>
          )}
          {result && result.status !== 'ok' && (
            <div role="status" className="note-red">
              {result.status === 'signedOut'
                ? t('setup.email.signedOut', { provider: providerName(result.provider ?? 'gmail') })
                : result.status === 'changed'
                  ? t('err.mailChanged', { provider: providerName(result.provider ?? 'gmail') })
                  : t('err.unknown')}
            </div>
          )}
        </div>
      )}

      {connected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label htmlFor="em-freq" className="field-label">
              {t('setup.email.frequency')}
            </label>
            <select
              id="em-freq"
              className="select"
              style={{ width: 'auto', minWidth: 200 }}
              value={['m5', 's30'].includes(intervalValue) ? 'hourly' : intervalValue}
              onChange={(ev) => setInterval(ev.target.value)}
            >
              <option value="daily">{t('setup.email.daily')}</option>
              <option value="six">{t('setup.email.sixHours')}</option>
              <option value="hourly">{t('setup.email.hourly')}</option>
            </select>
          </div>
          {mode === 'settings' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px 12px', flexWrap: 'wrap' }}>
              <span style={{ flex: '1 1 240px', fontSize: 14, color: 'var(--text-3)' }}>
                {e.lastCheck
                  ? t('settings.email.last', {
                      when: relativeTime(e.lastCheck.at),
                      result:
                        e.lastCheck.count != null
                          ? e.lastCheck.count === 0
                            ? t('settings.email.resultNone')
                            : t('settings.email.resultNew', { count: e.lastCheck.count })
                          : e.lastCheck.result,
                    })
                  : ''}
              </span>
              <button
                type="button"
                className="btn"
                disabled={status.emailRunning}
                onClick={() => void send({ type: 'emailCheckNow' })}
              >
                {t('settings.email.checkNow')}
              </button>
            </div>
          )}
          <fieldset>
            <legend>{t('setup.email.import')}</legend>
            <Segmented
              options={[
                ['7', t('setup.email.import7')],
                ['30', t('setup.email.import30')],
                ['90', t('setup.email.import90')],
                ['all', t('setup.email.importAll')],
              ]}
              value={range}
              onChange={(v) => update((s) => void (s.email.importDays = RANGE_DAYS[v]))}
            />
            {jobs != null && (
              <div className="mono" style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 8 }}>
                {t('setup.email.estimate', {
                  count: jobs,
                  cost: formatCost(jobs * costPerJob(settings.model)),
                })}
              </div>
            )}
            {mode === 'settings' && (
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="btn"
                  disabled={status.emailRunning}
                  onClick={() => void send({ type: 'emailImport', days: e.importDays })}
                >
                  {t('setup.email.import')}
                </button>
              </div>
            )}
          </fieldset>
          {mode === 'settings' && (
            <fieldset>
              <legend style={{ marginBottom: 4 }}>{t('settings.email.senders')}</legend>
              <div className="small-note" style={{ marginBottom: 8 }}>
                {t('settings.email.sendersHint')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {e.senders.map((s, i) => (
                  <div
                    key={s}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '0 0 0 12px',
                      minHeight: 44,
                    }}
                  >
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
          {mode === 'settings' && (
            <div>
              <button
                type="button"
                className="link-btn danger"
                onClick={() => {
                  update((s) => void (s.email.provider = null));
                  setResult(null);
                  void send({ type: 'emailScheduleChanged' });
                }}
              >
                {t('settings.email.disconnect')}
              </button>
            </div>
          )}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          fontSize: 13,
          lineHeight: 1.5,
          color: 'var(--text-3)',
          background: 'var(--bg)',
          borderRadius: 8,
          padding: '12px 14px',
        }}
      >
        <p>{t('setup.email.how')}</p>
        <p style={{ color: 'var(--text-2)' }}>{t('setup.email.chromeOpen')}</p>
      </div>
    </div>
  );
}
