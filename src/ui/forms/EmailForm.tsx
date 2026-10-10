// Job alert emails. Setup step 5 and Settings > Job alert emails.
import { useEffect, useState } from 'react';
import { INTERVALS } from '../../core/defaults';
import { t, type MessageKey } from '../../i18n/t';
import { costPerJob, formatCost } from '../../llm/cost';
import { send } from '../../messages';
import { COUNTS_KEY, savedCounts } from '../../email/run';
import type {
  AccountResult,
  EmailCheckResult,
  Provider,
  Range,
  RangeCount,
  SavedCounts,
  SignInResult,
} from '../../email/types';
import type { CheckSummary, EmailAccount } from '../../core/types';
import { JOBS_PER_ALERT } from '../../email/types';
import { accountId, updateStatus } from '../../store/settings';
import { useApp } from '../AppContext';
import { Spinner } from '../components';
import { inboxName, inboxNameById, relativeTime } from '../format';
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

const plus = (c: RangeCount, n: number) => `${n.toLocaleString('en-US')}${c.atLeast ? '+' : ''}`;

/** Counts from each inbox's last sign-in check, kept in storage so Settings can show them later. */
function useSavedCounts(): Record<string, SavedCounts> {
  const [saved, setSaved] = useState<Record<string, SavedCounts>>({});
  useEffect(() => {
    void savedCounts().then(setSaved);
    const l = (c: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && c[COUNTS_KEY]) void savedCounts().then(setSaved);
    };
    chrome.storage.onChanged.addListener(l);
    return () => chrome.storage.onChanged.removeListener(l);
  }, []);
  return saved;
}

/** One inbox's line after "Check now" or "Import". */
function accountResultText(r: AccountResult, name: string): string {
  switch (r.status) {
    case 'ok':
      return r.emails === 0
        ? t('email.result.none', { provider: name })
        : t('email.result.done', { provider: name, emails: r.emails, count: r.newJobs });
    case 'signedOut':
      return t('setup.email.signedOut', { provider: name });
    case 'changed':
      return t('err.mailChanged', { provider: name });
    case 'closed':
      return t('email.result.closed', { provider: name });
    default:
      return t('email.result.errorIn', { provider: name });
  }
}

/** The lines shown after "Check now" or "Import": one per inbox, then the cost question. */
export function checkResultLines(r: EmailCheckResult, accounts: EmailAccount[]): string[] {
  if (r.status === 'busy') return [t('setup.email.busy')];
  if (r.status === 'off') return [];
  if (!r.accounts.length) return [t('email.result.error')];
  const lines = r.accounts.map((a) => accountResultText(a, inboxNameById(accounts, a.id)));
  if (r.askedFirst) lines.push(t('email.result.asked', { count: r.newJobs }));
  return lines;
}

function lastCheckText(last: CheckSummary): string {
  const result =
    last.result === 'ok'
      ? last.count
        ? t('settings.email.resultNew', { count: last.count })
        : t('settings.email.resultNone')
      : last.result === 'MAIL_SIGNED_OUT'
        ? t('email.problem.signedOut')
        : last.result === 'MAIL_CHANGED'
          ? t('email.problem.changed')
          : last.result === 'MAIL_CLOSED'
            ? t('email.problem.closed')
            : t('email.problem.error');
  return t('settings.email.last', { when: relativeTime(last.at), result });
}

/** Import estimates added up across inboxes that have them. */
function totalCounts(saved: Record<string, SavedCounts>, accounts: EmailAccount[]) {
  const have = accounts.map((a) => saved[a.id]).filter((c): c is SavedCounts => !!c);
  if (!have.length) return null;
  const out = {} as Record<Range, RangeCount>;
  for (const r of RANGES)
    out[r] = {
      n: have.reduce((n, c) => n + c.counts[r].n, 0),
      atLeast: have.some((c) => c.counts[r].atLeast) || have.length < accounts.length,
    };
  return out;
}

export function EmailForm({ mode, onNotNow }: { mode: 'setup' | 'settings'; onNotNow?: () => void }) {
  const { settings, update, status } = useApp();
  const e = settings.email;
  const accounts = e.accounts;
  const [checking, setChecking] = useState<{ provider: Provider; index: number } | null>(null);
  const [result, setResult] = useState<(SignInResult & { name: string }) | null>(null);
  const [runResult, setRunResult] = useState<EmailCheckResult | null>(null);
  const [running, setRunning] = useState(false);
  const [sender, setSender] = useState('');
  const taken = new Set(accounts.map((a) => a.id));
  const freeGmail = [0, 1, 2, 3, 4].filter((i) => !taken.has(accountId('gmail', i)));
  const [gmailIndex, setGmailIndex] = useState(freeGmail[0] ?? 0);
  const gmailPick = freeGmail.includes(gmailIndex) ? gmailIndex : (freeGmail[0] ?? 0);
  const saved = useSavedCounts();

  /** Checks the person is signed in, then adds the inbox (or refreshes its address and counts). */
  const add = async (provider: Provider, index: number) => {
    setChecking({ provider, index });
    setResult(null);
    setRunResult(null);
    const name = inboxName({ provider, index, address: null });
    const r =
      (await send<SignInResult | undefined>({ type: 'emailSignInCheck', provider, account: index }).catch(
        () => undefined,
      )) ?? ({ status: 'error', provider, emailCounts: null } satisfies SignInResult);
    setChecking(null);
    setResult({ ...r, name: r.address ?? name });
    if (r.status !== 'ok') return;
    const id = accountId(provider, index);
    update((s) => {
      const cur = s.email.accounts.find((a) => a.id === id);
      if (cur) cur.address = r.address ?? cur.address;
      else
        s.email.accounts.push({
          id,
          provider,
          index,
          address: r.address ?? null,
          lastCheck: null,
          lastOkAt: null,
        });
    });
    if (status.emailProblemAccount === id)
      await updateStatus({ emailProblem: null, emailProblemAccount: null });
    void send({ type: 'emailScheduleChanged' });
  };

  const remove = (id: string) => {
    update((s) => void (s.email.accounts = s.email.accounts.filter((a) => a.id !== id)));
    setResult(null);
    setRunResult(null);
    if (status.emailProblemAccount === id)
      void updateStatus({ emailProblem: null, emailProblemAccount: null });
    void send({ type: 'emailScheduleChanged' });
  };

  const run = async (msg: { type: 'emailCheckNow' } | { type: 'emailImport'; days: number | null }) => {
    setRunning(true);
    setRunResult(null);
    setResult(null);
    const r =
      (await send<EmailCheckResult | undefined>(msg).catch(() => undefined)) ??
      ({
        status: 'error',
        accounts: [],
        emails: 0,
        newJobs: 0,
        askedFirst: false,
      } satisfies EmailCheckResult);
    setRunning(false);
    setRunResult(r);
  };

  const range = rangeOf(e.importDays);
  const counts = totalCounts(saved, accounts);
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
        ? t('setup.email.signedOut', { provider: result.name })
        : result.status === 'changed'
          ? t('err.mailChanged', { provider: result.name })
          : result.status === 'busy'
            ? t('setup.email.busy')
            : t('err.unknown')
      : null;
  const runLines = runResult ? checkResultLines(runResult, accounts) : [];
  const hasOutlook = taken.has('outlook');
  const any = accounts.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Inboxes */}
      <fieldset>
        <legend>{t('email.inboxes')}</legend>
        {any && (
          <ul className="inbox-list">
            {accounts.map((a) => {
              const bad = status.emailProblemAccount === a.id;
              return (
                <li key={a.id} className="email-status">
                  <span className={`dot ${bad ? 'bad' : 'good'}`} aria-hidden="true" />
                  <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, overflowWrap: 'anywhere' }}>
                      {inboxName(a)}
                      {a.address && (
                        <span className="small-note" style={{ fontWeight: 400 }}>
                          {' '}
                          · {a.provider === 'gmail' ? t('setup.email.gmail') : t('setup.email.outlook')}
                        </span>
                      )}
                    </div>
                    <div className="small-note">
                      {a.lastCheck ? lastCheckText(a.lastCheck) : t('email.notCheckedYet')}
                    </div>
                  </div>
                  <div className="row-wrap">
                    {bad && (
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() => void add(a.provider, a.index)}
                      >
                        {t('email.checkSignIn')}
                      </button>
                    )}
                    <button
                      type="button"
                      className="link-btn danger"
                      aria-label={t('email.removeInbox', { name: inboxName(a) })}
                      onClick={() => remove(a.id)}
                    >
                      {t('email.remove')}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="row-wrap" style={{ marginTop: any ? 10 : 0 }}>
          {freeGmail.length > 0 && (
            <span className="row-wrap" style={{ gap: 6 }}>
              <button
                type="button"
                className={any ? 'btn' : 'seg'}
                style={any ? undefined : { minWidth: 120 }}
                disabled={busy}
                onClick={() => void add('gmail', gmailPick)}
              >
                {any ? t('email.addGmail') : t('setup.email.gmail')}
              </button>
              <select
                aria-label={t('setup.email.account')}
                className="select"
                style={{ width: 'auto', minHeight: 44 }}
                value={gmailPick}
                disabled={busy}
                onChange={(ev) => setGmailIndex(Number(ev.target.value))}
              >
                {freeGmail.map((i) => (
                  <option key={i} value={i}>
                    {t('setup.email.accountOption', { n: i + 1, index: i })}
                  </option>
                ))}
              </select>
            </span>
          )}
          {!hasOutlook && (
            <button
              type="button"
              className={any ? 'btn' : 'seg'}
              style={any ? undefined : { minWidth: 120 }}
              disabled={busy}
              onClick={() => void add('outlook', 0)}
            >
              {any ? t('email.addOutlook') : t('setup.email.outlook')}
            </button>
          )}
          {onNotNow && !any && (
            <button type="button" className="btn" onClick={onNotNow}>
              {t('setup.email.notNow')}
            </button>
          )}
        </div>
        <div className="field-hint">{t('email.inboxesHint')}</div>
      </fieldset>

      {checking && (
        <div role="status" className="row-wrap" style={{ fontSize: 14, color: 'var(--text-3)' }}>
          <Spinner />
          {t('setup.email.checkingInbox', { provider: inboxName({ ...checking, address: null }) })}
        </div>
      )}
      {result?.status === 'ok' && !checking && (
        <div role="status" className="row-wrap" style={{ fontSize: 14, color: 'var(--teal-dark)' }}>
          <Check />
          {t('setup.email.signedInTo', { provider: result.name })}
        </div>
      )}
      {signInMessage && (
        <div role="status" className="note-red">
          {signInMessage}
        </div>
      )}

      {any && (
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
            <div className="field-hint">
              {t('setup.email.frequencyHint')}
              {accounts.length > 1 && <> {t('email.everyInbox')}</>}
            </div>
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
                        {c.n === 0 && !c.atLeast
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
                ? hasOutlook && accounts.length === 1
                  ? t('setup.email.noCountsOutlook')
                  : t('setup.email.noCounts')
                : hasOutlook
                  ? t('email.countsNoOutlook')
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
              </div>
            )}
          </fieldset>

          {(running || status.emailRunning) && mode === 'settings' && (
            <div role="status" className="row-wrap" style={{ fontSize: 14, color: 'var(--text-3)' }}>
              <Spinner />
              {t('banner.emailRunning')}
            </div>
          )}
          {runLines.length > 0 && (
            <div role="status" className={runResult?.status === 'ok' ? 'note-gray' : 'note-red'}>
              {runLines.map((l) => (
                <div key={l}>{l}</div>
              ))}
            </div>
          )}
        </>
      )}

      {any && mode === 'settings' && (
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
        <p>{t('setup.email.how2')}</p>
        <p style={{ color: 'var(--text-2)' }}>{t('setup.email.chromeOpen')}</p>
      </div>
    </div>
  );
}
