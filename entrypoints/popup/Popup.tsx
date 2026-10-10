// Popup states, in priority order. Blueprint section 9.1, matched to the approved demo.
import { useTheme } from '@/src/ui/themeMode';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatScore } from '@/src/core/overall';
import { topContributors } from '@/src/core/standouts';
import { t } from '@/src/i18n/t';
import { send, type ReadTabResult, type ScoreTabResult } from '@/src/messages';
import type { PageExtraction } from '@/src/readers/extract';
import { isUrl, siteFor } from '@/src/readers/generic';
import { allJobs } from '@/src/store/jobs';
import { isSetupComplete } from '@/src/store/settings';
import { Spinner, Swatch, Tag } from '@/src/ui/components';
import { failText, jobSub, jobTitle, payReason, relativeTime } from '@/src/ui/format';
import { Check, DealbreakerMark, Gear, KeyIcon, Logo } from '@/src/ui/Icons';
import {
  LINKS,
  openApp,
  openExternal,
  useJobs,
  useKeyInfo,
  useOnline,
  usePresence,
  useRank,
  useSettings,
  useStatus,
} from '@/src/ui/hooks';

type View =
  | { kind: 'loading' }
  | { kind: 'job'; page: PageExtraction }
  | { kind: 'busy'; phase: 'reading' | 'scoring'; jobId?: string }
  | { kind: 'result'; jobId: string; already: boolean }
  | { kind: 'home' }
  | { kind: 'error'; code: 'PAGE_UNSUPPORTED' | 'PAGE_CHANGED' | 'JOB_CLOSED' | 'UNKNOWN' };

export function Popup() {
  const [settings] = useSettings();
  useTheme(settings?.ui.theme);
  const [jobs] = useJobs();
  const status = useStatus();
  const key = useKeyInfo();
  const online = useOnline();
  usePresence();
  const view = useRank(jobs, settings);
  const [v, setV] = useState<View>({ kind: 'loading' });
  const [tabId, setTabId] = useState<number | null>(null);
  const [paste, setPaste] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [rescoring, setRescoring] = useState<number | null>(null);

  // Read the current tab once. The popup's click grants activeTab.
  useEffect(() => {
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id == null) return setV({ kind: 'home' });
      setTabId(tab.id);
      const r = await send<ReadTabResult>({ type: 'readTab', tabId: tab.id }).catch(
        () => ({ ok: false }) as ReadTabResult,
      );
      if (!r.ok) return setV({ kind: 'home' });
      if (r.jobId) {
        const job = (await allJobs()).find((j) => j.id === r.jobId);
        // Scored from the right-click menu or shortcut a moment ago: show it finishing.
        if (job && job.scoring !== 'scored' && job.scoring !== 'failed')
          setV({ kind: 'busy', phase: 'scoring', jobId: r.jobId });
        else setV({ kind: 'result', jobId: r.jobId, already: true });
      } else setV({ kind: 'job', page: r.page });
    })();
  }, []);

  // While scoring, wait for the job to finish.
  const busyJob = v.kind === 'busy' && v.jobId ? jobs?.find((j) => j.id === v.jobId) : undefined;
  useEffect(() => {
    if (v.kind !== 'busy' || !busyJob) return;
    if (busyJob.scoring === 'scored') setV({ kind: 'result', jobId: busyJob.id, already: false });
  }, [v, busyJob]);

  const resultJob = v.kind === 'result' ? jobs?.find((j) => j.id === v.jobId) : undefined;
  useEffect(() => {
    if (rescoring != null && resultJob && resultJob.updatedAt > rescoring && resultJob.scoring !== 'queued')
      setRescoring(null);
  }, [rescoring, resultJob]);

  const handleResult = useCallback((r: ScoreTabResult) => {
    if (r.ok) {
      if (r.already) setV({ kind: 'result', jobId: r.jobId, already: true });
      else setV({ kind: 'busy', phase: 'scoring', jobId: r.jobId });
    } else if (r.code === 'KEY_MISSING') {
      setV({ kind: 'home' });
    } else {
      setV({ kind: 'error', code: r.code });
    }
  }, []);

  const scoreThis = async () => {
    if (tabId == null) return;
    setV({ kind: 'busy', phase: 'reading' });
    const r = await send<ScoreTabResult>({ type: 'scoreTab', tabId }).catch(
      () => ({ ok: false, code: 'UNKNOWN' }) as ScoreTabResult,
    );
    handleResult(r);
  };

  const addJob = async () => {
    const text = paste.trim();
    if (!text) return;
    if (isUrl(text) && !siteFor(text)) {
      // Links from sites Fulcra doesn't know need that one site's permission.
      const origin = new URL(text).origin + '/*';
      const granted = await chrome.permissions.request({ origins: [origin] }).catch(() => false);
      if (!granted) return setV({ kind: 'error', code: 'PAGE_UNSUPPORTED' });
    }
    setV({ kind: 'busy', phase: 'reading' });
    const r = await send<ScoreTabResult>({ type: 'addPaste', text }).catch(
      () => ({ ok: false, code: 'UNKNOWN' }) as ScoreTabResult,
    );
    setPaste('');
    setShowPaste(false);
    handleResult(r);
  };

  const openSetup = async () => {
    const done = await isSetupComplete();
    await openApp(done ? 'settings/key' : 'setup/1');
    window.close();
  };

  const blocked = status?.scoringBlocked ?? null;
  const err: 'noCredit' | 'keyInvalid' | 'offline' | null =
    blocked === 'NO_CREDIT'
      ? 'noCredit'
      : blocked === 'KEY_INVALID'
        ? 'keyInvalid'
        : !online
          ? 'offline'
          : null;

  const top3 = useMemo(() => (view ? view.openPass.slice(0, 3) : []), [view]);

  if (!settings || !key || !view) return <Shell footer={null}>{null}</Shell>;

  const footer = (
    <>
      <span style={{ flex: 1, fontSize: 12, color: 'var(--text-2)' }}>
        {!settings.email.accounts.length
          ? t('popup.emailOff')
          : settings.email.lastCheck
            ? t('popup.emailStatus', { when: relativeTime(settings.email.lastCheck.at) })
            : t('popup.emailNotYet')}
      </span>
      <button
        type="button"
        aria-label={t('popup.settings')}
        className="icon-btn"
        onClick={() => void openApp('settings').then(() => window.close())}
      >
        <Gear />
      </button>
    </>
  );

  if (!key.hasKey) {
    return (
      <Shell footer={footer}>
        <div className="center-col" style={{ padding: '40px 8px' }}>
          <KeyIcon />
          <h2 style={{ fontSize: 18 }}>{t('popup.noKey.title')}</h2>
          <button type="button" className="btn primary" onClick={() => void openSetup()}>
            {t('popup.noKey.button')}
          </button>
        </div>
      </Shell>
    );
  }

  const errBox = err && (
    <>
      <div role="status" className={err === 'offline' ? 'note-amber' : 'note-red'}>
        {err === 'noCredit'
          ? t('err.noCredit')
          : err === 'keyInvalid'
            ? t('err.keyInvalid')
            : t('err.offline')}
      </div>
      {err === 'noCredit' && (
        <div>
          <button type="button" className="link-btn" onClick={() => openExternal(LINKS.billing)}>
            {t('err.noCreditLink')}
          </button>
        </div>
      )}
      {err === 'keyInvalid' && (
        <div>
          <button
            type="button"
            className="link-btn"
            onClick={() => void openApp('settings/key').then(() => window.close())}
          >
            {t('popup.noKey.button')}
          </button>
        </div>
      )}
    </>
  );

  const pasteBox = (
    <div className="col" style={{ gap: 6 }}>
      <label htmlFor="pp-text" style={{ fontSize: 13, fontWeight: 500 }}>
        {t('popup.paste.label')}
      </label>
      <textarea
        id="pp-text"
        rows={3}
        className="textarea"
        style={{ resize: 'none' }}
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
      />
      <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{t('popup.paste.hint')}</div>
      <button type="button" className="btn primary" disabled={!paste.trim()} onClick={() => void addJob()}>
        {t('popup.paste.button')}
      </button>
    </div>
  );

  let body: React.ReactNode;

  if (v.kind === 'loading') {
    body = (
      <div role="status" className="center-col" style={{ padding: '80px 0' }}>
        <Spinner large />
      </div>
    );
  } else if (v.kind === 'busy' && v.phase === 'scoring' && err) {
    // Scoring can't run (bad key, no credit, offline): say the job is safe, not "Scoring…" forever.
    body = (
      <div className="center-col" style={{ padding: '48px 0', gap: 8 }}>
        <div role="status" className="center-col" style={{ gap: 8, textAlign: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}>{t('popup.saved.title')}</span>
          <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{t(`popup.saved.${err}`)}</span>
        </div>
        <div style={{ width: '100%', marginTop: 8 }}>{errBox}</div>
      </div>
    );
  } else if (v.kind === 'busy') {
    body = (
      <div role="status" className="center-col" style={{ padding: '80px 0', color: 'var(--text-3)' }}>
        <Spinner large />
        <span style={{ fontSize: 15 }}>
          {v.phase === 'reading' ? t('popup.reading') : t('popup.scoring')}
        </span>
        {busyJob?.scoring === 'failed' && (
          <>
            <div className="note-red">{t('err.badJson')}</div>
            <button
              type="button"
              className="btn"
              onClick={() => void send({ type: 'rescoreJob', jobId: busyJob.id })}
            >
              {t('common.tryAgain')}
            </button>
          </>
        )}
        {err && errBox}
      </div>
    );
  } else if (v.kind === 'job') {
    const p = v.page;
    body = (
      <div className="card col" style={{ padding: 16, gap: 12 }}>
        <div
          style={{ fontSize: 12, color: 'var(--teal-dark)', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Check size={14} />
          {t('popup.detected')}
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 500 }}>{p.title}</div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>
            {[p.company, p.location].filter(Boolean).join(' · ')}
          </div>
        </div>
        {errBox}
        {p.closed && <div className="note-gray">{t('msg.jobClosed')}</div>}
        <button type="button" className="btn primary lg" disabled={!!err} onClick={() => void scoreThis()}>
          {t('popup.score.button')}
        </button>
        <div style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'center' }}>
          {t('popup.score.cost')}
        </div>
      </div>
    );
  } else if (v.kind === 'result') {
    const r = view.byId.get(v.jobId);
    if (!r) {
      body = (
        <div role="status" className="center-col" style={{ padding: '80px 0' }}>
          <Spinner large />
        </div>
      );
    } else {
      const job = r.job;
      const rankIdx = view.passingIds.indexOf(job.id);
      const factors = topContributors(view, r, 3);
      const busy = rescoring != null || job.scoring === 'queued';
      body = (
        <>
          <div className="card col" style={{ padding: '14px 16px', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{t('popup.overall')}</div>
                <div className="mono" style={{ fontSize: 44, lineHeight: 1, fontWeight: 500 }}>
                  {r.scored ? r.value.toFixed(1) : '–'}
                </div>
              </div>
              <div className="col" style={{ gap: 4, paddingBottom: 4 }}>
                {rankIdx >= 0 && (
                  <span style={{ fontSize: 13 }}>
                    {t('popup.rank', { rank: rankIdx + 1, total: view.passingIds.length })}
                  </span>
                )}
                <span className="row-wrap" style={{ gap: 4 }}>
                  {rankIdx === 0 && <Tag kind="teal">{t('popup.bestFit')}</Tag>}
                  {job.preliminary && <Tag kind="amber">{t('common.preliminary')}</Tag>}
                </span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 500 }}>{jobTitle(job)}</div>
              {jobSub(job) && (
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{jobSub(job)}</div>
              )}
              {v.already && (
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                  {t('popup.already', { when: relativeTime(job.updatedAt) })}
                </div>
              )}
            </div>
            {job.status === 'closed' && <div className="note-gray">{t('msg.jobClosed')}</div>}
            {r.fails.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  color: 'var(--teal-dark)',
                }}
              >
                <Check />
                {t('popup.passes')}
              </div>
            ) : (
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--red)' }}
              >
                <DealbreakerMark size={18} />
                {failText(r.fails)}
              </div>
            )}
            {job.preliminary && (
              <div className="note-amber" style={{ fontSize: 12, padding: '8px 10px' }}>
                {t('common.preliminaryHelp')}
              </div>
            )}
            {job.scoring === 'failed' && <div className="note-red">{t('err.badJson')}</div>}
            {errBox}
            {factors.length > 0 && (
              <div className="col" style={{ borderTop: '1px solid var(--rule)', paddingTop: 8, gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)' }}>
                  {t('popup.topReasons')}
                </div>
                {factors.map((d) => {
                  const s = view.scoreOf(r, d);
                  const reason = d.computedByApp ? null : (job.scores[d.id]?.reason ?? t('ranked.notScored'));
                  return (
                    <div key={d.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <Swatch color={d.color} style={{ marginTop: 4 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{d.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.35 }}>
                          {reason ?? payReason(r.take)}
                        </div>
                      </div>
                      <span className="mono" style={{ fontSize: 15, fontWeight: 500 }}>
                        {formatScore(s, d.computedByApp)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn primary"
              style={{ flex: 1 }}
              onClick={() => void openApp(`job/${job.id}`).then(() => window.close())}
            >
              {t('popup.seeAll')}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || !!err}
              onClick={() => {
                setRescoring(Date.now());
                void send({ type: 'rescoreJob', jobId: job.id });
              }}
            >
              {busy && <Spinner />}
              {busy
                ? t('popup.scoring')
                : job.scoring === 'failed'
                  ? t('common.tryAgain')
                  : t('popup.rescore')}
            </button>
          </div>
        </>
      );
    }
  } else if (v.kind === 'error') {
    body = (
      <>
        <div role="status" className="card col" style={{ padding: 16, gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 500 }}>
            {v.code === 'PAGE_CHANGED'
              ? t('err.pageChanged')
              : v.code === 'JOB_CLOSED'
                ? t('msg.jobClosed')
                : v.code === 'UNKNOWN'
                  ? t('err.unknown')
                  : t('err.pageUnsupported')}
          </div>
          {!showPaste && (
            <button
              type="button"
              className="btn"
              style={{ color: 'var(--teal-dark)', borderColor: 'var(--teal)', fontWeight: 500 }}
              onClick={() => setShowPaste(true)}
            >
              {t('err.pastePrompt')}
            </button>
          )}
        </div>
        {showPaste && pasteBox}
      </>
    );
  } else {
    body = (
      <>
        {errBox}
        <div className="card col" style={{ padding: '14px 16px', gap: 6 }}>
          <h2 style={{ fontSize: 14, marginBottom: 4 }}>{t('popup.topJobs')}</h2>
          {top3.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{t('popup.noJobs')}</div>
          ) : (
            top3.map((x, i) => (
              <button
                type="button"
                key={x.job.id}
                className="top-row"
                onClick={() => setV({ kind: 'result', jobId: x.job.id, already: false })}
              >
                <span className="top-row-title">{jobTitle(x.job)}</span>
                <span aria-hidden="true" className="mini-bar">
                  <span
                    style={{
                      width: `${(x.value * 10).toFixed(0)}%`,
                      background: i === 0 ? 'var(--teal)' : 'var(--teal-mid)',
                    }}
                  />
                </span>
                <span
                  className="mono"
                  style={{ width: 30, textAlign: 'right', fontSize: 13, fontWeight: 500 }}
                >
                  {x.value.toFixed(1)}
                </span>
              </button>
            ))
          )}
        </div>
        {pasteBox}
        <button type="button" className="btn" onClick={() => void openApp().then(() => window.close())}>
          {t('popup.open')}
        </button>
      </>
    );
  }

  return <Shell footer={footer}>{body}</Shell>;
}

function Shell({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="popup">
      <header className="popup-head">
        <Logo size={24} />
        <h1 style={{ fontSize: 17 }}>{t('appName')}</h1>
      </header>
      <main className="popup-main">{children}</main>
      <footer className="popup-foot">{footer}</footer>
    </div>
  );
}
