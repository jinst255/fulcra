// Live data for React surfaces: settings, jobs, status, and the key, kept fresh
// through chrome.storage change events so the popup and app always agree.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { rankJobs, type RankView } from '../core/rank';
import type { JobRecord, Settings } from '../core/types';
import { send } from '../messages';
import { allJobs } from '../store/jobs';
import {
  getSettings,
  getStatus,
  keyInfo,
  onJobsChanged,
  onKeyChanged,
  onSettingsChanged,
  onStatusChanged,
  updateSettings,
  type AppStatus,
} from '../store/settings';

export function useSettings(): [
  Settings | null,
  (fn: (s: Settings) => Settings | void) => Promise<Settings>,
] {
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => {
    let alive = true;
    void getSettings().then((x) => alive && setS(x));
    const off = onSettingsChanged((x) => setS(x));
    return () => {
      alive = false;
      off();
    };
  }, []);
  const update = useCallback(async (fn: (s: Settings) => Settings | void) => {
    const next = await updateSettings(fn);
    setS(next);
    return next;
  }, []);
  return [s, update];
}

export function useJobs(): [JobRecord[] | null, () => Promise<void>] {
  const [jobs, setJobs] = useState<JobRecord[] | null>(null);
  const reload = useCallback(async () => setJobs(await allJobs()), []);
  useEffect(() => {
    void reload();
    return onJobsChanged(() => void reload());
  }, [reload]);
  return [jobs, reload];
}

export function useStatus(): AppStatus | null {
  const [s, setS] = useState<AppStatus | null>(null);
  useEffect(() => {
    let alive = true;
    void getStatus().then((x) => alive && setS(x));
    const off = onStatusChanged(setS);
    return () => {
      alive = false;
      off();
    };
  }, []);
  return s;
}

export function useKeyInfo(): { hasKey: boolean; last4: string } | null {
  const [k, setK] = useState<{ hasKey: boolean; last4: string } | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => void keyInfo().then((x) => alive && setK(x));
    load();
    const off = onKeyChanged(load);
    return () => {
      alive = false;
      off();
    };
  }, []);
  return k;
}

export function useRank(jobs: JobRecord[] | null, settings: Settings | null): RankView | null {
  return useMemo(() => (jobs && settings ? rankJobs(jobs, settings) : null), [jobs, settings]);
}

export function useOnline(): boolean {
  const [on, setOn] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true);
    const down = () => setOn(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return on;
}

/**
 * Tells the service worker someone is looking at Fulcra, every 30 seconds while this page shows.
 * Bulk scoring then runs right away instead of at half price (pipeline/presence.ts).
 */
export function usePresence(): void {
  useEffect(() => {
    const beat = () => {
      if (document.visibilityState === 'visible') void send({ type: 'presence' }).catch(() => undefined);
    };
    beat();
    const timer = setInterval(beat, 30_000);
    document.addEventListener('visibilitychange', beat);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', beat);
    };
  }, []);
}

/** Opens the full-page app at a route, reusing an open Fulcra tab. */
export async function openApp(route = ''): Promise<void> {
  const base = chrome.runtime.getURL('/options.html');
  const url = route ? `${base}#${route}` : base;
  const tabs = await chrome.tabs.query({ url: `${base}*` });
  const tab = tabs[0];
  if (tab?.id != null) {
    await chrome.tabs.update(tab.id, { active: true, url });
    if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
}

export function openExternal(url: string): void {
  void chrome.tabs.create({ url });
}

export const LINKS = {
  billing: 'https://platform.openai.com/settings/organization/billing/overview',
  limits: 'https://platform.openai.com/settings/organization/limits',
  apiKeys: 'https://platform.openai.com/api-keys',
  issues: 'https://github.com/jinst255/fulcra/issues',
  shortcuts: 'chrome://extensions/shortcuts',
};
