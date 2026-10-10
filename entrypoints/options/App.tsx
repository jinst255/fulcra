// Full-page app router: setup, ranked list, radar, settings, and the job drawer.
// Blueprint section 9.2, matched to the approved demo.
import { useEffect, useState } from 'react';
import { t } from '@/src/i18n/t';
import { send } from '@/src/messages';
import { isSetupComplete } from '@/src/store/settings';
import { AppProvider, useApp } from '@/src/ui/AppContext';
import { Banner } from '@/src/ui/Banner';
import { Gear, Logo, Moon, Sun } from '@/src/ui/Icons';
import { isDark } from '@/src/ui/themeMode';
import { JobDetail } from '@/src/ui/JobDetail';
import type { Learn } from '@/src/ui/LearnCard';
import { Radar } from '@/src/ui/Radar';
import { RankedList } from '@/src/ui/RankedList';
import { Settings } from '@/src/ui/Settings/Settings';
import { Setup, SETUP_STEPS } from '@/src/ui/Setup/Setup';

export function App() {
  return (
    <AppProvider fallback={<div className="app" />}>
      <Shell />
    </AppProvider>
  );
}

function parse(route: string): { screen: 'ranked' | 'radar' | 'settings' | 'setup'; arg: string } {
  const [head = '', arg = ''] = route.split('/');
  if (head === 'radar' || head === 'settings' || head === 'setup') return { screen: head, arg };
  if (head === 'job') return { screen: 'ranked', arg };
  return { screen: 'ranked', arg: '' };
}

function Shell() {
  const { route, go, update } = useApp();
  const [learn, setLearn] = useState<Learn | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    void send({ type: 'appOpened' }).catch(() => undefined);
    update((s) => void (s.ui.lastOpenedAt = Date.now()), { silent: true });
    void isSetupComplete().then((done) => {
      if (!done && !route.startsWith('setup')) go('setup/0');
      setChecked(true);
    });
    // Run once on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { screen, arg } = parse(route);
  if (!checked) return <div className="app" />;
  const detailId = route.startsWith('job/') ? arg : null;
  const step = Math.max(0, Math.min(SETUP_STEPS - 1, Number(arg) || 0));

  return (
    <div className="app">
      <header className="topbar">
        <div className="wrap topbar-inner">
          <div className="wordmark">
            <Logo />
            <span>{t('appName')}</span>
          </div>
          {screen !== 'setup' ? (
            <>
              <nav aria-label="Views" className="row-wrap" style={{ gap: 4 }}>
                <button
                  type="button"
                  className="tab"
                  aria-current={screen === 'ranked' ? 'page' : undefined}
                  onClick={() => go('')}
                >
                  {t('app.tab.ranked')}
                </button>
                <button
                  type="button"
                  className="tab"
                  aria-current={screen === 'radar' ? 'page' : undefined}
                  onClick={() => go('radar')}
                >
                  {t('app.tab.radar')}
                </button>
              </nav>
              <ThemeButton />
              <button
                type="button"
                className="tab"
                aria-current={screen === 'settings' ? 'page' : undefined}
                onClick={() => go('settings')}
              >
                <Gear />
                {t('app.settings')}
              </button>
            </>
          ) : (
            step >= 1 && (
              <div className="progress">
                <span>{t('setup.progress', { n: step })}</span>
                <span aria-hidden="true" className="progress-bar">
                  <span style={{ width: `${Math.round((step / 6) * 100)}%` }} />
                </span>
              </div>
            )
          )}
        </div>
      </header>
      <main>
        {screen !== 'setup' && <Banner />}
        {screen === 'ranked' && (
          <RankedList onOpen={(id) => go(`job/${id}`)} learn={learn} setLearn={setLearn} />
        )}
        {screen === 'radar' && <Radar />}
        {screen === 'settings' && <Settings section={arg || 'key'} />}
        {screen === 'setup' && <Setup step={step} />}
      </main>
      {detailId && <JobDetail jobId={detailId} onClose={() => go('')} onLearn={setLearn} />}
    </div>
  );
}

/** One tap between light and dark; Settings > Appearance also offers "match the system". */
function ThemeButton() {
  const { settings, update } = useApp();
  const dark = isDark(settings.ui.theme);
  return (
    <button
      type="button"
      className="tab icon-only"
      style={{ marginLeft: 'auto' }}
      aria-label={dark ? t('app.lightMode') : t('app.darkMode')}
      title={dark ? t('app.lightMode') : t('app.darkMode')}
      onClick={() => update((s) => void (s.ui.theme = dark ? 'light' : 'dark'))}
    >
      {dark ? <Sun /> : <Moon />}
    </button>
  );
}
