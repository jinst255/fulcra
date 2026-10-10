// "Score all" from the popup: list the jobs a page links to, then open each in a tucked-away
// tab, read it, and queue it like a page you scored yourself. Runs in the service worker.
import { t } from '../i18n/t';
import type { PageExtraction } from '../readers/extract';
import type { JobLink } from '../readers/links';
import { addLog } from '../store/log';
import { updateStatus } from '../store/settings';
import { intakePage, readTab, waitForLoad } from './intake';

/** Tabs open at once: quick enough, without looking like a flood to the site. */
const TABS = 3;
const READ_WAIT_MS = 10_000;
const READ_STEP_MS = 1000;

export async function listJobLinks(tabId: number): Promise<{ links: JobLink[]; more: boolean }> {
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, files: ['/links.js'] });
    return (res?.result as { links: JobLink[]; more: boolean } | undefined) ?? { links: [], more: false };
  } catch {
    return { links: [], more: false };
  }
}

let stopping = false;
let running = false;

export function stopScan(): void {
  stopping = true;
}

/** Reads and saves each link; scoring starts as each is saved. One scan at a time. */
export async function scanJobs(links: JobLink[]): Promise<boolean> {
  if (running || !links.length) return false;
  running = true;
  stopping = false;
  await updateStatus({ scan: { total: links.length, done: 0, saved: 0, failed: 0 } });
  await addLog('SCAN_START', 'background', String(links.length));
  const tabs = new TabGroup();
  const todo = [...links];
  const worker = async () => {
    for (let link = todo.shift(); link && !stopping; link = todo.shift()) {
      const ok = await readAndSave(link.url, tabs).catch(() => false);
      await updateStatus((s) =>
        s.scan
          ? {
              scan: {
                ...s.scan,
                done: s.scan.done + 1,
                saved: s.scan.saved + (ok ? 1 : 0),
                failed: s.scan.failed + (ok ? 0 : 1),
              },
            }
          : {},
      );
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(TABS, links.length) }, worker));
  } finally {
    running = false;
    await updateStatus({ scan: null });
  }
  return true;
}

async function readAndSave(url: string, tabs: TabGroup): Promise<boolean> {
  const tabId = await tabs.open(url);
  try {
    await waitForLoad(tabId, 500);
    const page = await readWhenReady(tabId);
    if (!page) return false;
    const r = await intakePage(page);
    // Saved without a key still counts: it's scored once a key is added.
    return r.ok || r.code === 'KEY_MISSING';
  } finally {
    await chrome.tabs.remove(tabId).catch(() => undefined);
  }
}

/** Job sites draw the posting after the page loads; read until it's there or time runs out. */
async function readWhenReady(tabId: number): Promise<PageExtraction | null> {
  let last: PageExtraction | null = null;
  for (let waited = 0; waited <= READ_WAIT_MS; waited += READ_STEP_MS) {
    if (waited) await new Promise((r) => setTimeout(r, READ_STEP_MS));
    if (stopping) return null;
    last = await readTab(tabId);
    if (last?.isJobPage && !last.selectorsFailed && last.text.length >= 200) return last;
  }
  return last?.isJobPage ? last : null;
}

/** One collapsed "Fulcra" tab group for the whole scan, in the window you're using. */
class TabGroup {
  private groupId: number | null = null;
  private windowId: number | null | undefined;
  // One tab at a time, so the first few don't each start their own group.
  private chain: Promise<unknown> = Promise.resolve();

  open(url: string): Promise<number> {
    const next = this.chain.then(() => this.openNow(url));
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async openNow(url: string): Promise<number> {
    if (this.windowId === undefined) {
      const w = await chrome.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null);
      this.windowId = w?.id ?? null;
    }
    const win = this.windowId != null ? { windowId: this.windowId } : {};
    const tab = await chrome.tabs.create({ url, active: false, ...win });
    const tabId = tab.id!;
    try {
      if (this.groupId != null) await chrome.tabs.group({ tabIds: tabId, groupId: this.groupId });
      else {
        this.groupId = await chrome.tabs.group({
          tabIds: tabId,
          ...(this.windowId != null ? { createProperties: { windowId: this.windowId } } : {}),
        });
        await chrome.tabGroups.update(this.groupId, {
          title: t('email.tabGroup'),
          color: 'green',
          collapsed: true,
        });
      }
    } catch {
      // Tab groups aren't available, or you closed the group: an inactive tab still works.
      this.groupId = null;
    }
    return tabId;
  }
}
