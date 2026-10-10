// Strong-match notifications after an email check: one per check, summarizing if more than one.
// Blueprint sections 6 and 9.3.
import { rankJobs } from '../core/rank';
import type { JobRecord } from '../core/types';
import { EMAIL_NOTIFY_KEY } from '../email/run';
import { t } from '../i18n/t';
import { allJobs } from '../store/jobs';
import { getSettings } from '../store/settings';

interface Pending {
  ids: string[];
  at: number;
}

const NOTE_PREFIX = 'fulcra-job:';

/** Called after each job is scored. When the last job from a check is done, notifies once. */
export async function maybeNotify(job: JobRecord): Promise<void> {
  const got = (await chrome.storage.local.get(EMAIL_NOTIFY_KEY))[EMAIL_NOTIFY_KEY] as Pending | undefined;
  if (!got?.ids.includes(job.id)) return;
  const jobs = await allJobs();
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const waiting = got.ids.filter((id) => {
    const j = byId.get(id);
    return j && (j.scoring === 'queued' || j.scoring === 'notScored');
  });
  if (waiting.length) return;
  await chrome.storage.local.remove(EMAIL_NOTIFY_KEY);
  const settings = await getSettings();
  if (!settings.scoring.notify) return;
  const view = rankJobs(jobs, settings);
  const strong = view.openPass
    .filter((r) => got.ids.includes(r.job.id) && r.value >= settings.scoring.notifyThreshold)
    .sort((a, b) => b.value - a.value);
  const top = strong[0];
  if (!top) return;
  const title = top.job.facts.title;
  const company = top.job.facts.company ?? '';
  const opts: chrome.notifications.NotificationCreateOptions =
    strong.length === 1
      ? {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('/icons/128.png'),
          title: t('notify.strongMatch.title', { score: top.value.toFixed(1) }),
          message: t('notify.strongMatch.body', { title, company }),
        }
      : {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('/icons/128.png'),
          title: t('notify.many.title', { count: strong.length }),
          message: t('notify.many.body', { title, company, score: top.value.toFixed(1) }),
        };
  await chrome.notifications.create(`${NOTE_PREFIX}${top.job.id}:${Date.now()}`, opts);
}

/** Notification clicks open the app on that job. */
export function jobIdFromNotification(id: string): string | null {
  if (!id.startsWith(NOTE_PREFIX)) return null;
  return id.slice(NOTE_PREFIX.length).split(':')[0] ?? null;
}
