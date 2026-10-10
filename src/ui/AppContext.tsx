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
import { rankJobs, type RankView } from '../core/rank';
import type { JobRecord, Settings } from '../core/types';
import { getSettings, onSettingsChanged, saveSettings, type AppStatus } from '../store/settings';
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
  update: (fn: (s: Settings) => Settings | void) => void;
  jobs: JobRecord[];
  view: RankView;
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

  useEffect(() => {
    const on = () => setRoute(readRoute());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const update = useCallback((fn: (s: Settings) => Settings | void) => {
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

  const view = useMemo(() => (jobs && settings ? rankJobs(jobs, settings) : null), [jobs, settings]);

  if (!settings || !jobs || !status || !key || !view) return <>{fallback}</>;

  const value: AppCtx = {
    settings,
    update,
    jobs,
    view,
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
