// First-run setup, steps 0 to 6. Blueprint section 10, matched to the approved demo.
import { useState } from 'react';
import { presetWeights } from '../../core/presets';
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

export const SETUP_STEPS = 7;

/** Three example jobs for the welcome screen's bars, from the demo sample data. */
const WELCOME = [
  { name: 'Software dev internship', s: [5.0, 8, 6, 10, 7, 8, 7] },
  { name: 'Contract AI work', s: [4.0, 6, 5, 7, 8, 6, 10] },
  { name: 'Summer sales rep', s: [9.0, 3, 3, 3, 2, 3, 2] },
];

export function Setup({ step }: { step: number }) {
  const app = useApp();
  const { settings, update, go, jobs, key } = app;
  const [testedKey, setTestedKey] = useState<string | null>(null);
  const to = (n: number) => go(`setup/${n}`);

  const finish = async (skipped: boolean) => {
    update((s) => {
      if (skipped) {
        s.weights = { ...s.weights, ...presetWeights('balanced', s.dimensions) };
        s.profileId = 'balanced';
        s.dealbreakers = {
          minTakeHome: null,
          maxHours: null,
          mustRemote: false,
          noRelocation: false,
          excludeTypes: [],
          languageGap: false,
        };
      }
      s.ui.setupSkipped = skipped;
      s.ui.showOutsideDealbreakers = null;
      s.ui.baselineOrder = rankJobs(jobs, s).passingIds;
    });
    await setSetupComplete(true);
    if (!skipped && settings.email.provider)
      void send({ type: 'emailImport', days: settings.email.importDays });
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
                        key={i}
                        style={{
                          display: 'block',
                          height: 14,
                          flex: 'none',
                          width: `${((v / 7) * 10).toFixed(2)}%`,
                          background: dims[i]?.color ?? '#6B7280',
                          boxShadow: 'inset -2px 0 0 #F6F5F1',
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '8px 0' }}>
            <h1 style={{ fontSize: 28 }}>{t('setup.done.title')}</h1>
            <svg
              width="300"
              height="72"
              viewBox="0 0 300 72"
              role="img"
              aria-label={t('setup.done.illustration')}
              style={{ maxWidth: '100%' }}
            >
              <rect x="1" y="1" width="298" height="70" rx="12" fill="#FFFFFF" stroke="#DAD7CE" />
              <rect x="16" y="22" width="160" height="28" rx="14" fill="#ECEAE3" />
              <g transform="translate(196 22)">
                <path
                  d="M5 9h4.5a3 3 0 1 1 6 0H20v5a3 3 0 1 1 0 6v5H5z"
                  fill="none"
                  stroke="#3A3F45"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </g>
              <g transform="translate(240 20)">
                <rect width="32" height="32" rx="8" fill="#E6F3EF" stroke="#0F6B5F" />
                <line
                  x1="6"
                  y1="14"
                  x2="26"
                  y2="10"
                  stroke="#0F6B5F"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                <path d="M16 13.5L21 23H11Z" fill="#0F6B5F" />
              </g>
              <path d="M262 58l6-6M265 49l6 6" stroke="#B45309" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <p style={{ fontSize: 15, lineHeight: 1.5 }}>{t('setup.done.pin')}</p>
            <p style={{ fontSize: 15, lineHeight: 1.5 }}>{t('setup.done.how')}</p>
            <div>
              <button type="button" className="btn primary lg" onClick={() => void finish(false)}>
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
              <button type="button" className="link-btn quiet" onClick={() => void finish(true)}>
                {t('common.skip')}
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
