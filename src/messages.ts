// Messages between the popup, the full-page app, content scripts, and the service worker.
import type { PageExtraction } from './readers/extract';

export type Request =
  | { type: 'scoreTab'; tabId: number }
  | { type: 'readTab'; tabId: number }
  | { type: 'addPaste'; text: string }
  | { type: 'rescoreJob'; jobId: string }
  | { type: 'kick' }
  | { type: 'keyChanged' }
  | { type: 'appOpened' }
  | { type: 'batchStart' }
  | { type: 'batchLater' }
  | { type: 'batchPause'; paused: boolean }
  | { type: 'emailCheckNow' }
  | { type: 'emailImport'; days: number | null }
  | { type: 'emailSignInCheck'; provider: 'gmail' | 'outlook'; account?: number }
  | { type: 'emailScheduleChanged' }
  | { type: 'pageSeen'; page: PageExtraction };

export type ScoreTabResult =
  | { ok: true; jobId: string; already: boolean }
  | {
      ok: false;
      code: 'KEY_MISSING' | 'PAGE_UNSUPPORTED' | 'PAGE_CHANGED' | 'JOB_CLOSED' | 'UNKNOWN';
      jobId?: string;
    };

export type ReadTabResult = { ok: true; page: PageExtraction; jobId: string | null } | { ok: false };

export function send<T = unknown>(msg: Request): Promise<T> {
  return chrome.runtime.sendMessage(msg) as Promise<T>;
}
