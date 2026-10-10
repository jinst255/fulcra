// Shared by the site content scripts: once a job page has rendered, tell the service
// worker, which decides whether to upgrade a preliminary score or auto-score.
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { readPage, siteFor } from './generic';

const WAIT_MS = 10_000;
const STEP_MS = 500;

export function watchJobPages(ctx: ContentScriptContext): void {
  let lastSent = '';
  // The last job text on screen. Single-page apps change the address before they swap the
  // job pane, so until the text moves off this, the page still shows the previous job.
  let shown = '';
  let run = 0;
  const check = async (url: string) => {
    const mine = ++run;
    const known = siteFor(url);
    if (!known) return;
    const key = `${known.site}:${known.id}`;
    if (key === lastSent) return;
    const before = shown;
    let prev = '';
    for (let waited = 0; waited <= WAIT_MS; waited += STEP_MS) {
      if (waited) await new Promise<void>((r) => ctx.setTimeout(r, STEP_MS));
      // Moved on to another job, or the extension was reloaded.
      if (ctx.isInvalid || mine !== run) return;
      const page = readPage(document, url);
      if (page.text.length < 200) continue;
      shown = page.text;
      // Send once the new job is up and has stopped changing between two reads. On the last
      // read, send what's there unless it's still the previous job; a page the site reader
      // can't read goes too, so the worker can log it.
      const fresh = page.text !== before;
      const settled = !page.selectorsFailed && fresh && page.text === prev;
      const last = waited + STEP_MS > WAIT_MS;
      prev = page.text;
      if (!settled && !(last && (fresh || page.selectorsFailed))) continue;
      lastSent = key;
      try {
        await chrome.runtime.sendMessage({ type: 'pageSeen', page });
      } catch {
        // The service worker may be restarting; the next navigation retries.
      }
      return;
    }
  };
  void check(location.href);
  // The event arrives before location.href changes, so read the new address from it.
  ctx.addEventListener(window, 'wxt:locationchange', (e) => void check(e.newUrl.href));
}
