// Shared state for the full-page app: settings (saved instantly, optimistically),
// jobs, ranking, status, key, toasts, and confirm dialogs.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ofTypes, rankJobs, type RankView } from '../core/rank';
import type { JobRecord, Settings } from '../core/types';
import { getSettings, onSettingsChanged, saveSettings, type AppStatus } from '../store/settings';
import { useTheme } from './themeMode';
import { t } from '../i18n/t';
import { diagnostics } from '../store/export';
import { addLog } from '../store/log';
import { ConfirmDialog, Toast } from './components';
import { useJobs, useKeyInfo, useStatus } from './hooks';

interface Confirm {
  text: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
}

export interface AppCtx {
  settings: Settings;
  /** Applies a change now and saves it; shows "Saved". */
  update: (fn: (s: Settings) => Settings | void, opts?: { silent?: boolean }) => void;
  jobs: JobRecord[];
  /** Ranking of the jobs the job type filter shows. */
  view: RankView;
  /** Ranking of every job, for a job the filter hides (opened from a notification, say). */
  fullView: RankView;
  status: AppStatus;
  key: { hasKey: boolean; last4: string };
  saved: boolean;
  toast: (text: string, action?: { label: string; run: () => void }) => void;
  confirm: (c: Confirm) => void;
  route: string;
  go: (route: string) => void;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp outside AppProvider');
  return c;
}

function readRoute(): string {
  return decodeURIComponent(location.hash.replace(/^#/, ''));
}

export function AppProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [jobs] = useJobs();
  const status = useStatus();
  const key = useKeyInfo();
  const [saved, setSaved] = useState(false);
  const [toastState, setToastState] = useState<{
    text: string;
    action?: { label: string; run: () => void };
  } | null>(null);
  const [confirmState, setConfirmState] = useState<Confirm | null>(null);
  const [route, setRoute] = useState(readRoute());
  const latest = useRef<Settings | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingSave = useRef(false);

  useEffect(() => {
    void getSettings().then((s) => {
      latest.current = s;
      setSettings(s);
    });
    return onSettingsChanged((s) => {
      // Ignore our own echo while a save is pending, so a slider doesn't jump back.
      if (pendingSave.current) return;
      latest.current = s;
      setSettings(s);
    });
  }, []);

  // Anything unexpected: a plain message with Copy diagnostics (section 7, UNKNOWN).
  useEffect(() => {
    const onError = () => {
      void addLog('UNKNOWN', 'app', 'uncaught');
      setToastState({
        text: t('err.unknown'),
        action: {
          label: t('err.copyDiagnostics'),
          run: () => void diagnostics().then((d) => navigator.clipboard.writeText(d)),
        },
      });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onError);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onError);
    };
  }, []);

  useEffect(() => {
    const on = () => setRoute(readRoute());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const update = useCallback((fn: (s: Settings) => Settings | void, opts?: { silent?: boolean }) => {
    const cur = latest.current;
    if (!cur) return;
    const draft = structuredClone(cur);
    const next = fn(draft) ?? draft;
    latest.current = next;
    setSettings(next);
    pendingSave.current = true;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveSettings(latest.current!).finally(() => {
        pendingSave.current = false;
      });
    }, 150);
    if (opts?.silent) return;
    setSaved(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1600);
  }, []);

  const toast = useCallback((text: string, action?: { label: string; run: () => void }) => {
    setToastState({ text, action });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastState(null), action ? 8000 : 3200);
  }, []);

  const go = useCallback((r: string) => {
    location.hash = r;
    setRoute(r);
  }, []);

  const fullView = useMemo(() => (jobs && settings ? rankJobs(jobs, settings) : null), [jobs, settings]);
  const view = useMemo(
    () =>
      jobs && settings && settings.ui.jobTypes.length
        ? rankJobs(ofTypes(jobs, settings.ui.jobTypes), settings)
        : fullView,
    [jobs, settings, fullView],
  );
  useTheme(settings?.ui.theme);

  if (!settings || !jobs || !status || !key || !view || !fullView) return <>{fallback}</>;

  const value: AppCtx = {
    settings,
    update,
    jobs,
    view,
    fullView,
    status,
    key,
    saved,
    toast,
    confirm: setConfirmState,
    route,
    go,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {toastState && (
        <Toast
          text={toastState.text}
          action={toastState.action?.label}
          onAction={() => {
            toastState.action?.run();
            setToastState(null);
          }}
        />
      )}
      {confirmState && (
        <ConfirmDialog
          text={confirmState.text}
          confirmLabel={confirmState.confirmLabel}
          onCancel={() => setConfirmState(null)}
          onConfirm={() => {
            const c = confirmState;
            setConfirmState(null);
            void c.onConfirm();
          }}
        />
      )}
    </Ctx.Provider>
  );
}
