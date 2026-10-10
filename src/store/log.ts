// Local log ring buffer and diagnostics. Blueprint section 12.5.
// Never logs the key, listing text, or email content.
import type { LogEntry } from '../core/types';
import { db } from './db';

export const LOG_MAX = 500;

/** Strips anything that looks like a key and caps the length. */
export function scrub(detail: string): string {
  return detail
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-…')
    .replace(/Bearer\s+\S+/gi, 'Bearer …')
    .slice(0, 160);
}

export async function addLog(code: string, surface: LogEntry['surface'], detail = ''): Promise<void> {
  try {
    const d = await db();
    await d.add('log', { at: Date.now(), code, surface, detail: scrub(detail) });
    const count = await d.count('log');
    if (count > LOG_MAX) {
      const tx = d.transaction('log', 'readwrite');
      let cursor = await tx.store.openCursor();
      let extra = count - LOG_MAX;
      while (cursor && extra > 0) {
        await cursor.delete();
        extra--;
        cursor = await cursor.continue();
      }
      await tx.done;
    }
  } catch {
    // Logging must never break the caller.
  }
}

export async function recentLog(n = LOG_MAX): Promise<LogEntry[]> {
  const all = await (await db()).getAll('log');
  return all.slice(-n).reverse();
}

export function formatLogLine(e: LogEntry): string {
  const dt = new Date(e.at);
  const date = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date} ${time}  ${e.code.padEnd(13)} ${e.surface.padEnd(11)} ${e.detail}`;
}
