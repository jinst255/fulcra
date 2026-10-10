// IndexedDB setup. Blueprint section 12.1.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { JobRecord, LogEntry, OverrideEntry } from '../core/types';

export interface QueueItem {
  id: string;
  jobId: string;
  /** full: score every dimension. dims: score only dimIds. payUnit: check a flagged pay unit. */
  kind: 'full' | 'dims' | 'payUnit';
  dimIds: string[];
  preliminary: boolean;
  attempts: number;
  /** Don't start before this time (backoff and offline retry). */
  notBefore: number;
  addedAt: number;
  /** Batch this item belongs to, for the re-score banner. */
  batch: string | null;
}

interface FulcraDB extends DBSchema {
  jobs: { key: string; value: JobRecord; indexes: { dedupeKey: string; status: string; addedAt: number } };
  log: { key: number; value: LogEntry };
  overrides: { key: number; value: OverrideEntry; indexes: { dimensionId: string } };
  queue: { key: string; value: QueueItem; indexes: { jobId: string } };
}

export const DB_NAME = 'fulcra';
export const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<FulcraDB>> | null = null;

export function db(): Promise<IDBPDatabase<FulcraDB>> {
  dbPromise ??= openDB<FulcraDB>(DB_NAME, DB_VERSION, {
    upgrade(d) {
      const jobs = d.createObjectStore('jobs', { keyPath: 'id' });
      jobs.createIndex('dedupeKey', 'dedupeKey');
      jobs.createIndex('status', 'status');
      jobs.createIndex('addedAt', 'addedAt');
      d.createObjectStore('log', { keyPath: 'id', autoIncrement: true });
      const ov = d.createObjectStore('overrides', { keyPath: 'id', autoIncrement: true });
      ov.createIndex('dimensionId', 'dimensionId');
      const q = d.createObjectStore('queue', { keyPath: 'id' });
      q.createIndex('jobId', 'jobId');
    },
    blocking() {
      // Another context is upgrading; let it.
      void dbPromise?.then((x) => x.close());
      dbPromise = null;
    },
  });
  return dbPromise;
}

/** Test hook: forget the open connection. */
export function resetDbForTests(): void {
  dbPromise = null;
}

export class StorageFullError extends Error {
  constructor() {
    super('STORAGE_FULL');
  }
}

export function isQuotaError(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'UnknownError');
}
