// Service worker: queue, alarms, badge. Later steps add readers, email checks,
// notifications, the context menu, and the keyboard command.
import { defineBackground } from 'wxt/utils/define-background';
import type { Request } from '@/src/messages';
import { applyBadge } from '@/src/pipeline/badge';
import { addPaste, describeTab, pageSeen, rescoreJob, scoreTab } from '@/src/pipeline/intake';
import { onScored, planAndMaybeStart, pump, queueUnscored, startPlannedBatch } from '@/src/pipeline/queue';
import { retentionCleanup } from '@/src/store/jobs';
import {
  getSettings,
  getStatus,
  onSettingsChanged,
  onStatusChanged,
  updateStatus,
} from '@/src/store/settings';

const PUMP_ALARM = 'pump';
const DAILY_ALARM = 'daily';

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') void chrome.runtime.openOptionsPage();
  });

  void chrome.alarms.create(PUMP_ALARM, { periodInMinutes: 1 });
  void chrome.alarms.create(DAILY_ALARM, { periodInMinutes: 24 * 60, delayInMinutes: 5 });

  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name === PUMP_ALARM) void pump();
    if (a.name === DAILY_ALARM) void getSettings().then((s) => retentionCleanup(s.retentionDays));
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
  onScored((_job, item) => {
    if (item.kind === 'full') void updateStatus((s) => ({ newScoredCount: s.newScoredCount + 1 }));
  });

  self.addEventListener('online', () => void pump());

  chrome.runtime.onMessage.addListener((msg: Request, _sender, sendResponse) => {
    void handle(msg).then(sendResponse, () => sendResponse(undefined));
    return true;
  });

  void pump();
});

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
    case 'kick':
      await pump();
      return true;
    case 'keyChanged':
      await updateStatus({ scoringBlocked: null });
      await queueUnscored();
      await pump();
      return true;
    case 'appOpened':
      await updateStatus({ newScoredCount: 0 });
      return true;
    case 'batchStart':
      await startPlannedBatch();
      return true;
    case 'batchLater':
      await updateStatus({ askBatch: null });
      return true;
    case 'batchPause':
      await updateStatus((s) => (s.batch ? { batch: { ...s.batch, paused: msg.paused } } : {}));
      if (!msg.paused) await pump();
      return true;
    default:
      return undefined;
  }
}
