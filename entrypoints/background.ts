// Service worker: queue, alarms, badge. Later steps add readers, email checks,
// notifications, the context menu, and the keyboard command.
import { defineBackground } from 'wxt/utils/define-background';
import { runEmailCheck, signInCheck } from '@/src/email/run';
import { CATCHUP_ALARM, EMAIL_ALARM, scheduleCatchUp, scheduleEmail } from '@/src/email/scheduler';
import type { Request } from '@/src/messages';
import { applyBadge } from '@/src/pipeline/badge';
import { t } from '@/src/i18n/t';
import { addPaste, describeTab, pageSeen, rescoreJob, scoreTab } from '@/src/pipeline/intake';
import { hardReset } from '@/src/pipeline/reset';
import { jobIdFromNotification, maybeNotify } from '@/src/pipeline/notify';
import { siteFor } from '@/src/readers/generic';
import { onScored, planAndMaybeStart, pump, queueUnscored, rescoreAll } from '@/src/pipeline/queue';
import { markPresent } from '@/src/pipeline/presence';
import { BATCH_POLL_ALARM, initHalfPrice, pollHalfPrice, speedUp } from '@/src/pipeline/halfprice';
import { allJobs, retentionCleanup, updateJob } from '@/src/store/jobs';
import { looksLikeJobTitle } from '@/src/readers/alerts/common';
import {
  getSettings,
  getStatus,
  onSettingsChanged,
  onStatusChanged,
  updateStatus,
} from '@/src/store/settings';

const PUMP_ALARM = 'pump';
const MENU_ID = 'score';
const DAILY_ALARM = 'daily';

/** Alarms every install has. A reset clears all alarms, then calls this again. */
function startAlarms(): void {
  void chrome.alarms.create(PUMP_ALARM, { periodInMinutes: 1 });
  void chrome.alarms.create(DAILY_ALARM, { periodInMinutes: 24 * 60, delayInMinutes: 5 });
}

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') void chrome.runtime.openOptionsPage();
    void scheduleEmail();
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({ id: MENU_ID, title: t('contextMenu.score'), contexts: ['page', 'link'] });
    });
  });
  chrome.runtime.onStartup.addListener(() => {
    void scheduleEmail();
    void scheduleCatchUp();
  });

  // A check can't be running in a service worker that just started; clear a flag left by one that died.
  void updateStatus({ emailRunning: false });
  void flagPromotions();
  initHalfPrice();

  startAlarms();

  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name === PUMP_ALARM) void pump();
    if (a.name === BATCH_POLL_ALARM) void pollHalfPrice();
    if (a.name === EMAIL_ALARM) void runEmailCheck({ reason: 'scheduled' });
    if (a.name === CATCHUP_ALARM) void runEmailCheck({ reason: 'catchup' });
    if (a.name === DAILY_ALARM) {
      void getSettings().then((s) => retentionCleanup(s.retentionDays));
      // Anything left unscored (no key at the time, say) gets scored.
      void queueUnscored();
    }
  });

  onStatusChanged((s) => void applyBadge(s));
  void getStatus().then(applyBadge);

  // Dimension edits trigger re-scoring.
  let dimSig = '';
  void getSettings().then((s) => (dimSig = sig(s.dimensions)));
  onSettingsChanged((s) => {
    const next = sig(s.dimensions);
    if (next !== dimSig) {
      dimSig = next;
      void planAndMaybeStart();
    }
  });

  // Badge count: new scored jobs since the app was last opened.
  onScored((job, item) => {
    if (item.kind === 'full') void updateStatus((s) => ({ newScoredCount: s.newScoredCount + 1 }));
    void maybeNotify(job);
  });

  chrome.notifications.onClicked.addListener((id) => {
    const jobId = jobIdFromNotification(id);
    if (jobId) void openApp(`job/${jobId}`);
    void chrome.notifications.clear(id);
  });

  // Right-click and the keyboard shortcut grant activeTab, like the popup does.
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== MENU_ID) return;
    if (info.linkUrl) {
      if (siteFor(info.linkUrl)) void addPaste(info.linkUrl).then(showPopup);
      // Other sites need their own permission; open the link so the icon can score it.
      else void chrome.tabs.create({ url: info.linkUrl, active: true, index: (tab?.index ?? 0) + 1 });
    } else if (tab?.id != null) {
      void scoreTab(tab.id).then(showPopup);
    }
  });
  chrome.commands.onCommand.addListener((command, tab) => {
    if (command === 'score-page' && tab?.id != null) void scoreTab(tab.id).then(showPopup);
  });

  self.addEventListener('online', () => void pump());

  chrome.runtime.onMessage.addListener((msg: Request, _sender, sendResponse) => {
    void handle(msg).then(sendResponse, () => sendResponse(undefined));
    return true;
  });

  void pump();
});

/** Shows the popup so the user sees the result or the error. */
function showPopup(): void {
  void chrome.action.openPopup?.().catch(() => undefined);
}

async function openApp(route: string): Promise<void> {
  await chrome.tabs.create({ url: chrome.runtime.getURL(`/options.html#${route}`) });
}

function sig(dims: { id: string; version: number; active: boolean }[]): string {
  return dims.map((d) => `${d.id}:${d.version}:${d.active ? 1 : 0}`).join('|');
}

async function handle(msg: Request): Promise<unknown> {
  switch (msg.type) {
    case 'scoreTab':
      return scoreTab(msg.tabId);
    case 'readTab':
      return describeTab(msg.tabId);
    case 'addPaste':
      return addPaste(msg.text);
    case 'rescoreJob':
      return rescoreJob(msg.jobId);
    case 'pageSeen':
      await pageSeen(msg.page);
      return true;
    case 'emailSignInCheck':
      return signInCheck(msg.provider, msg.account);
    case 'emailCheckNow':
      return runEmailCheck({ reason: 'now' });
    case 'emailImport':
      return runEmailCheck({ reason: 'import', importDays: msg.days, accountId: msg.accountId });
    case 'emailScheduleChanged':
      await scheduleEmail();
      return true;
    case 'hardReset':
      await hardReset();
      startAlarms();
      return true;
    case 'kick':
      await pump();
      return true;
    case 'keyChanged':
      await updateStatus({ scoringBlocked: null });
      await queueUnscored();
      await pump();
      return true;
    case 'appOpened':
      await markPresent();
      await updateStatus({ newScoredCount: 0 });
      await queueUnscored();
      return true;
    case 'presence':
      await markPresent();
      return true;
    case 'batchSpeedUp':
      await speedUp();
      return true;
    case 'rescoreAll':
      return rescoreAll();
    case 'batchPause':
      await updateStatus((s) => (s.batch ? { batch: { ...s.batch, paused: msg.paused } } : {}));
      if (!msg.paused) await pump();
      return true;
    default:
      return undefined;
  }
}

/** Email jobs saved before the promotion filter existed: fold away the ones titled like ads. */
async function flagPromotions(): Promise<void> {
  for (const j of await allJobs()) {
    if (j.source !== 'email' || j.flags.includes('not_a_job') || j.flags.includes('confirmed_job')) continue;
    if (!looksLikeJobTitle(j.facts.title))
      await updateJob(j.id, (x) => ({ ...x, flags: [...x.flags, 'not_a_job'] }));
  }
}
