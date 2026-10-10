// chrome.storage.local wrapper. Blueprint sections 3 and 12.1.
// The API key lives only here, never in chrome.storage.sync, never in exports or logs.
import { defaultSettings } from '../core/defaults';
import type { Settings } from '../core/types';

const K = {
  settings: 'settings',
  apiKey: 'apiKey',
  setupComplete: 'setupComplete',
  jobsVersion: 'jobsVersion',
  status: 'status',
} as const;

/** Shared status other surfaces watch: key problems, email check state, batch progress. */
export interface AppStatus {
  /** Section 7 code that pauses scoring until fixed: KEY_INVALID or NO_CREDIT. */
  scoringBlocked: 'KEY_INVALID' | 'NO_CREDIT' | null;
  emailRunning: boolean;
  emailProblem: 'MAIL_SIGNED_OUT' | 'MAIL_CHANGED' | null;
  storageFull: boolean;
  rateLimited: boolean;
  batch: {
    id: string;
    label: string;
    kind: 'new' | 'edit' | 'mixed';
    done: number;
    total: number;
    cost: number;
    paused: boolean;
  } | null;
  /** A large batch waiting for the user's go-ahead. */
  askBatch: { kind: 'rescore' | 'unscored'; count: number; cost: number; seconds: number } | null;
  newScoredCount: number;
}

export function defaultStatus(): AppStatus {
  return {
    scoringBlocked: null,
    emailRunning: false,
    emailProblem: null,
    storageFull: false,
    rateLimited: false,
    batch: null,
    askBatch: null,
    newScoredCount: 0,
  };
}

/** Fills in fields added after the settings were first saved. */
export function withDefaults(saved: Partial<Settings> | undefined): Settings {
  const d = defaultSettings();
  if (!saved) return d;
  return {
    ...d,
    ...saved,
    about: { ...d.about, ...saved.about },
    dealbreakers: { ...d.dealbreakers, ...saved.dealbreakers },
    email: migrateEmail({ ...d.email, ...saved.email }),
    scoring: { ...d.scoring, ...saved.scoring },
    ui: { ...d.ui, ...saved.ui },
    dimensions: saved.dimensions?.length ? saved.dimensions : d.dimensions,
    weights: { ...d.weights, ...saved.weights },
  };
}

/** The first builds guessed Handshake's sender wrong; swap in the real one. */
function migrateEmail(e: Settings['email']): Settings['email'] {
  const old = 'notifications@joinhandshake.com';
  if (!e.senders.includes(old)) return e;
  const real = 'handshake@g.joinhandshake.com';
  const senders = e.senders.filter((x) => x !== old);
  if (!senders.includes(real)) senders.push(real);
  return { ...e, senders };
}

export async function getSettings(): Promise<Settings> {
  const r = await chrome.storage.local.get(K.settings);
  return withDefaults(r[K.settings] as Partial<Settings> | undefined);
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ [K.settings]: s });
}

/** Read-modify-write. Callers in one context are serialized. */
let chain: Promise<unknown> = Promise.resolve();
export function updateSettings(fn: (s: Settings) => Settings | void): Promise<Settings> {
  const next = chain.then(async () => {
    const draft = structuredClone(await getSettings());
    const out = fn(draft) ?? draft;
    await saveSettings(out);
    return out;
  });
  chain = next.catch(() => undefined);
  return next;
}

export function onSettingsChanged(cb: (s: Settings) => void): () => void {
  const l = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[K.settings]) cb(withDefaults(changes[K.settings]!.newValue as Settings));
  };
  chrome.storage.onChanged.addListener(l);
  return () => chrome.storage.onChanged.removeListener(l);
}

// API key

export async function getApiKey(): Promise<string | null> {
  const r = await chrome.storage.local.get(K.apiKey);
  const k = r[K.apiKey];
  return typeof k === 'string' && k ? k : null;
}

export async function setApiKey(key: string): Promise<void> {
  await chrome.storage.local.set({ [K.apiKey]: key.trim() });
}

export async function removeApiKey(): Promise<void> {
  await chrome.storage.local.remove(K.apiKey);
}

/** The only form of the key the UI ever shows. */
export function last4(key: string | null): string {
  return key ? key.slice(-4) : '';
}

export async function keyInfo(): Promise<{ hasKey: boolean; last4: string }> {
  const k = await getApiKey();
  return { hasKey: !!k, last4: last4(k) };
}

export function onKeyChanged(cb: () => void): () => void {
  const l = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[K.apiKey]) cb();
  };
  chrome.storage.onChanged.addListener(l);
  return () => chrome.storage.onChanged.removeListener(l);
}

// Setup

export async function isSetupComplete(): Promise<boolean> {
  const r = await chrome.storage.local.get(K.setupComplete);
  return r[K.setupComplete] === true;
}

export async function setSetupComplete(v: boolean): Promise<void> {
  await chrome.storage.local.set({ [K.setupComplete]: v });
}

// Change signal for jobs, so every open surface refreshes after a write.

export async function bumpJobsVersion(): Promise<void> {
  await chrome.storage.local.set({ [K.jobsVersion]: Date.now() + Math.random() });
}

export function onJobsChanged(cb: () => void): () => void {
  const l = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[K.jobsVersion]) cb();
  };
  chrome.storage.onChanged.addListener(l);
  return () => chrome.storage.onChanged.removeListener(l);
}

// Status

export async function getStatus(): Promise<AppStatus> {
  const r = await chrome.storage.local.get(K.status);
  return { ...defaultStatus(), ...(r[K.status] as Partial<AppStatus> | undefined) };
}

let statusChain: Promise<unknown> = Promise.resolve();
export function updateStatus(
  patch: Partial<AppStatus> | ((s: AppStatus) => Partial<AppStatus>),
): Promise<AppStatus> {
  const next = statusChain.then(async () => {
    const cur = await getStatus();
    const p = typeof patch === 'function' ? patch(cur) : patch;
    const out = { ...cur, ...p };
    await chrome.storage.local.set({ [K.status]: out });
    return out;
  });
  statusChain = next.catch(() => undefined);
  return next;
}

export function onStatusChanged(cb: (s: AppStatus) => void): () => void {
  const l = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[K.status])
      cb({ ...defaultStatus(), ...(changes[K.status]!.newValue as Partial<AppStatus>) });
  };
  chrome.storage.onChanged.addListener(l);
  return () => chrome.storage.onChanged.removeListener(l);
}
