// chrome.alarms for email checks, plus a catch-up check after Chrome starts. Blueprint sections 7 (MISSED_CHECK) and 8.
import { getSettings } from '../store/settings';

export const EMAIL_ALARM = 'email-check';
export const CATCHUP_ALARM = 'email-catchup';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Recreates the email alarm from settings. Chrome's minimum period is 30 seconds. */
export async function scheduleEmail(): Promise<void> {
  const s = await getSettings();
  await chrome.alarms.clear(EMAIL_ALARM);
  if (!s.email.provider) return;
  const period = Math.max(0.5, s.email.intervalMinutes);
  await chrome.alarms.create(EMAIL_ALARM, { periodInMinutes: period, delayInMinutes: period });
}

/** If the last check is over a day old (Chrome was closed), check 2 minutes after startup. */
export async function scheduleCatchUp(now = Date.now()): Promise<boolean> {
  const s = await getSettings();
  if (!s.email.provider) return false;
  const last = s.email.lastCheck?.at ?? 0;
  if (now - last <= DAY_MS) return false;
  await chrome.alarms.create(CATCHUP_ALARM, { delayInMinutes: 2 });
  return true;
}
