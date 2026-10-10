// First-run setup, steps 0 to 6. Blueprint section 10, matched to the approved demo.
import { useState } from 'react';
import { rankJobs } from '../../core/rank';
import { t } from '../../i18n/t';
import { send } from '../../messages';
import { setSetupComplete } from '../../store/settings';
import { useApp } from '../AppContext';
import { AboutForm } from '../forms/AboutForm';
import { DealForm } from '../forms/DealForm';
import { EmailForm } from '../forms/EmailForm';
import { KeyInput, saveKey } from '../forms/KeyForm';
import { PriorityForm } from '../forms/PriorityForm';
import { Check } from '../Icons';

export const SETUP_STEPS = 7;

/** Three example jobs for the welcome screen's bars, from the demo sample data. */
const WELCOME = [
  { name: 'Clinic internship', s: [5.0, 8, 6, 10, 7, 8, 7] },
  { name: 'Remote contract', s: [4.0, 6, 5, 7, 8, 6, 10] },
  { name: 'Summer sales rep', s: [9.0, 3, 3, 3, 2, 3, 2] },
];

export function Setup({ step }: { step: number }) {
  const app = useApp();
  const { settings, update, go, jobs, key } = app;
  const [testedKey, setTestedKey] = useState<string | null>(null);
  const to = (n: number) => go(`setup/${n}`);

  const finish = async () => {
    update((s) => {
      s.ui.setupSkipped = false;
      s.ui.showOutsideDealbreakers = null;
      s.ui.baselineOrder = rankJobs(jobs, s).passingIds;
    });
    await setSetupComplete(true);
    if (settings.email.provider) void send({ type: 'emailImport', days: settings.email.importDays });
    go('');
  };

  const next = async () => {
    if (step === 1 && testedKey) {
      await saveKey(testedKey);
      setTestedKey(null);
    }
    to(Math.min(6, step + 1));
  };

  const dims = settings.dimensions.filter((d) => d.active).slice(0, 7);
  const db = settings.dealbreakers;
  const dealCount =
    (db.minTakeHome != null ? 1 : 0) +
    (db.maxHours != null ? 1 : 0) +
    (db.mustRemote ? 1 : 0) +
    (db.noRelocation ? 1 : 0) +
    (db.languageGap ? 1 : 0);
  const em = settings.email;
  const summary: { step: number; ok: boolean; text: string }[] = [
    { step: 1, ok: key.hasKey, text: key.hasKey ? t('setup.done.keyOk') : t('setup.done.keyMissing') },
    { step: 3, ok: true, text: t('setup.done.priorities', { profile: t(`profile.${settings.profileId}`) }) },
    {
      step: 4,
      ok: true,
      text:
        dealCount === 0
          ? t('setup.deal.none')
          : dealCount === 1
            ? t('setup.done.dealOne')
            : t('setup.done.dealCount', { count: dealCount }),
    },
    {
      step: 5,
      ok: true,
      text: em.provider
        ? t('setup.done.emailOn', {
            provider: em.provider === 'gmail' ? t('setup.email.gmail') : t('setup.email.outlook'),
            range:
              em.importDays == null
                ? t('setup.email.importAll').toLowerCase()
                : t('setup.done.lastDays', { n: em.importDays }),
          })
        : t('setup.done.emailOff'),
    },
  ];

  return (
    <div className="wrap form-row">
      <div className="card form-card">
        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '12px 0' }}>
            <h1 style={{ fontSize: 30, lineHeight: 1.2 }}>{t('setup.welcome.title')}</h1>
            <p style={{ fontSize: 16, lineHeight: 1.5, color: 'var(--text-3)' }}>{t('setup.welcome.body')}</p>
            <div
              aria-hidden="true"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                background: 'var(--bg)',
                borderRadius: 8,
                padding: 14,
              }}
            >
              {WELCOME.map((w) => (
                <div key={w.name} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                  <span style={{ width: 150, flex: 'none' }}>{w.name}</span>
                  <span
                    style={{
                      flex: 1,
                      height: 14,
                      borderRadius: 4,
                      background: 'var(--rule)',
                      display: 'flex',
                      overflow: 'hidden',
                    }}
                  >
                    {w.s.map((v, i) => (
                      <span
                        className="dim-color"
                        key={i}
                        style={{
                          display: 'block',
                          height: 14,
                          flex: 'none',
                          width: `${((v / 7) * 10).toFixed(2)}%`,
                          background: dims[i]?.color ?? 'var(--gray-switch)',
                          boxShadow: 'inset -2px 0 0 var(--bg)',
                        }}
                      />
                    ))}
                  </span>
                  <span className="mono" style={{ width: 32, textAlign: 'right' }}>
                    {(w.s.reduce((a, b) => a + b, 0) / 7).toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-2)' }}>{t('setup.welcome.footer')}</p>
            <div>
              <button type="button" className="btn primary lg" onClick={() => to(1)}>
                {t('setup.welcome.button')}
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h1 style={{ fontSize: 24 }}>{t('setup.key.title')}</h1>
              <p className="lead">{t('setup.key.body')}</p>
              <details className="disclosure">
                <summary>{t('setup.key.whatIs')}</summary>
                <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.5, color: 'var(--text-3)' }}>
                  {t('setup.key.whatIsBody')}
                </p>
              </details>
              <details className="disclosure">
                <summary>{t('setup.key.howTo')}</summary>
                <ol
                  style={{
                    margin: '0 0 14px',
                    paddingLeft: 20,
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: 'var(--text-3)',
                  }}
                >
                  {t('setup.key.howToSteps')
                    .split(/\s*\d\.\s+/)
                    .filter(Boolean)
                    .map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                </ol>
              </details>
            </div>
            {key.hasKey && !testedKey ? (
              <div role="status" style={{ fontSize: 14, color: 'var(--teal-dark)', fontWeight: 500 }}>
                {t('settings.key.current', { last4: key.last4 })} · {t('setup.key.ok')}
              </div>
            ) : (
              <KeyInput onPassed={setTestedKey} />
            )}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                fontSize: 13,
                lineHeight: 1.5,
                color: 'var(--text-3)',
              }}
            >
              <p>{t('setup.key.cost')}</p>
              <p className="note-amber">{t('setup.key.limitTip')}</p>
              <p>{t('setup.key.privacy')}</p>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px 10px',
                  flexWrap: 'wrap',
                  marginTop: 4,
                }}
              >
                <button type="button" className="link-btn" onClick={() => to(2)}>
                  {t('setup.key.later')}
                </button>
                <span className="small-note">{t('setup.key.laterNote')}</span>
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <h1 style={{ fontSize: 24 }}>{t('setup.about.title')}</h1>
              <p className="lead" style={{ marginTop: 6 }}>
                {t('setup.about.body')}
              </p>
            </div>
            <AboutForm />
          </>
        )}

        {step === 3 && (
          <>
            <div>
              <h1 style={{ fontSize: 24 }}>{t('setup.priorities.title')}</h1>
              <p className="lead" style={{ marginTop: 6 }}>
                {t('setup.priorities.body')}
              </p>
            </div>
            <PriorityForm />
          </>
        )}

        {step === 4 && (
          <>
            <div>
              <h1 style={{ fontSize: 24 }}>{t('setup.deal.title')}</h1>
              <p className="lead" style={{ marginTop: 6 }}>
                {t('setup.deal.body')}
              </p>
            </div>
            <DealForm showNone />
            <p className="small-note">{t('setup.deal.typesMoved')}</p>
          </>
        )}

        {step === 5 && (
          <>
            <div>
              <h1 style={{ fontSize: 24 }}>{t('setup.email.title')}</h1>
              <p className="lead" style={{ marginTop: 6 }}>
                {t('setup.email.body')}
              </p>
            </div>
            <EmailForm
              mode="setup"
              onNotNow={() => {
                update((s) => void (s.email.provider = null));
                to(6);
              }}
            />
          </>
        )}

        {step === 6 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '8px 0' }}>
            <div>
              <h1 style={{ fontSize: 28 }}>{t('setup.done.title')}</h1>
              <p className="lead" style={{ marginTop: 6 }}>
                {t('setup.done.lead')}
              </p>
            </div>

            <section aria-labelledby="done-summary" className="done-summary">
              <h2 id="done-summary" style={{ fontSize: 15 }}>
                {t('setup.done.summary')}
              </h2>
              {summary.map((row) => (
                <div key={row.step} className="done-row">
                  <span className={`done-mark ${row.ok ? 'ok' : 'todo'}`} aria-hidden="true">
                    {row.ok ? <Check /> : '!'}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>{row.text}</span>
                  <button type="button" className="link-btn" onClick={() => to(row.step)}>
                    {t('setup.done.change')}
                  </button>
                </div>
              ))}
            </section>

            <section aria-labelledby="done-how">
              <h2 id="done-how" style={{ fontSize: 15, marginBottom: 10 }}>
                {t('setup.done.howTitle')}
              </h2>
              <ol className="done-steps">
                <li>
                  <span className="num" aria-hidden="true">
                    1
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
                    <span>{t('setup.done.step1')}</span>
                    <PinPicture />
                  </div>
                </li>
                <li>
                  <span className="num" aria-hidden="true">
                    2
                  </span>
                  <span>{t('setup.done.step2', { shortcut: 'Alt+Shift+F' })}</span>
                </li>
                <li>
                  <span className="num" aria-hidden="true">
                    3
                  </span>
                  <span>{t('setup.done.step3')}</span>
                </li>
              </ol>
            </section>

            <div>
              <button type="button" className="btn primary lg" onClick={() => void finish()}>
                {t('setup.done.button')}
              </button>
            </div>
          </div>
        )}

        {step >= 1 && step <= 5 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              borderTop: '1px solid var(--rule)',
              paddingTop: 16,
              marginTop: 4,
            }}
          >
            {step >= 2 && (
              // Skips only this step; whatever it already has stays as it is.
              <button type="button" className="link-btn quiet" onClick={() => to(step + 1)}>
                {t('setup.skipStep')}
              </button>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button type="button" className="btn" onClick={() => to(step - 1)}>
                {t('common.back')}
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={step === 1 && !testedKey && !key.hasKey}
                onClick={() => void next()}
              >
                {t('common.continue')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Chrome's toolbar: the puzzle piece (1), then the pin beside the app (2). */
function PinPicture() {
  return (
    <svg
      width="300"
      height="72"
      viewBox="0 0 300 72"
      role="img"
      aria-label={t('setup.done.illustration')}
      style={{ maxWidth: '100%' }}
    >
      <rect
        x="1"
        y="1"
        width="298"
        height="70"
        rx="12"
        style={{ fill: 'var(--card)', stroke: 'var(--border)' }}
      />
      <rect x="16" y="22" width="150" height="28" rx="14" style={{ fill: 'var(--rule)' }} />
      <g transform="translate(186 22)">
        <path
          d="M5 9h4.5a3 3 0 1 1 6 0H20v5a3 3 0 1 1 0 6v5H5z"
          fill="none"
          style={{ stroke: 'var(--text-3)' }}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </g>
      <circle cx="210" cy="16" r="8" style={{ fill: 'var(--amber-bar)' }} />
      <text
        x="210"
        y="19.5"
        textAnchor="middle"
        fontSize="10"
        fontWeight="600"
        style={{ fill: 'var(--card)' }}
      >
        1
      </text>
      <g transform="translate(236 20)">
        <rect width="32" height="32" rx="8" style={{ fill: 'var(--teal-light)', stroke: 'var(--teal)' }} />
        <line
          x1="6"
          y1="14"
          x2="26"
          y2="10"
          style={{ stroke: 'var(--teal)' }}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path d="M16 13.5L21 23H11Z" style={{ fill: 'var(--teal)' }} />
      </g>
      <circle cx="276" cy="16" r="8" style={{ fill: 'var(--amber-bar)' }} />
      <text
        x="276"
        y="19.5"
        textAnchor="middle"
        fontSize="10"
        fontWeight="600"
        style={{ fill: 'var(--card)' }}
      >
        2
      </text>
    </svg>
  );
}
