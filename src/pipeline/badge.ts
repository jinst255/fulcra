// Toolbar badge. Blueprint section 13: teal count of new scored jobs, gray "…" while
// working, red "!" when Fulcra needs attention.
import { t } from '../i18n/t';
import type { AppStatus } from '../store/settings';

export interface BadgeState {
  text: string;
  color: string;
  title: string;
}

export function badgeFor(s: AppStatus): BadgeState {
  if (s.scoringBlocked || s.emailProblem === 'MAIL_SIGNED_OUT')
    return { text: '!', color: '#B42318', title: t('badge.attention') };
  if (s.emailRunning || (s.batch && !s.batch.paused))
    return { text: '…', color: '#5A6068', title: t('appName') };
  if (s.newScoredCount > 0)
    return {
      text: s.newScoredCount > 99 ? '99+' : String(s.newScoredCount),
      color: '#0F6B5F',
      title: t('appName'),
    };
  return { text: '', color: '#0F6B5F', title: t('appName') };
}

export async function applyBadge(s: AppStatus): Promise<void> {
  const b = badgeFor(s);
  await chrome.action.setBadgeText({ text: b.text });
  await chrome.action.setBadgeBackgroundColor({ color: b.color });
  if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#FFFFFF' });
  await chrome.action.setTitle({ title: b.title });
}
