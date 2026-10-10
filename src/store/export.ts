// Export everything (no key) and delete everything. Blueprint section 12.5.
import type { JobRecord, Settings } from '../core/types';
import { db } from './db';
import { addLog, recentLog } from './log';
import { allJobs, jobCounts } from './jobs';
import { getSettings } from './settings';

export interface ExportFile {
  version: string;
  exportedAt: string;
  settings: Omit<Settings, 'dimensions'>;
  dimensions: Settings['dimensions'];
  jobs: JobRecord[];
}

function extensionVersion(): string {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return '0.0.0';
  }
}

export async function buildExport(): Promise<ExportFile> {
  const settings = await getSettings();
  const { dimensions, ...rest } = settings;
  return {
    version: extensionVersion(),
    exportedAt: new Date().toISOString(),
    settings: rest,
    dimensions,
    jobs: await allJobs(),
  };
}

/** Clears IndexedDB and chrome.storage.local, including the key. */
export async function deleteEverything(): Promise<void> {
  const d = await db();
  const tx = d.transaction(['jobs', 'log', 'overrides', 'queue'], 'readwrite');
  await Promise.all([
    tx.objectStore('jobs').clear(),
    tx.objectStore('log').clear(),
    tx.objectStore('overrides').clear(),
    tx.objectStore('queue').clear(),
    tx.done,
  ]);
  await chrome.storage.local.clear();
  await chrome.storage.local.set({ jobsVersion: Date.now() });
}

/** Diagnostics for problem reports: no key, no listing text, no email content. */
export async function diagnostics(): Promise<string> {
  const s = await getSettings();
  const counts = await jobCounts();
  const codes = (await recentLog(50)).map((e) => e.code);
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const chromeVersion = /Chrome\/([\d.]+)/.exec(ua)?.[1] ?? 'unknown';
  const os = typeof navigator !== 'undefined' ? (navigator.platform ?? 'unknown') : 'unknown';
  await addLog('DIAGNOSTICS', 'app', 'copied');
  return JSON.stringify(
    {
      extension: extensionVersion(),
      chrome: chromeVersion,
      os,
      model: s.model,
      emailInboxes: s.email.accounts.map((a) => a.id).join(', ') || 'none',
      jobs: counts,
      lastLogCodes: codes,
    },
    null,
    2,
  );
}
