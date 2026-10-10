// Shared by the site content scripts: once a job page has rendered, tell the service
// worker, which decides whether to upgrade a preliminary score or auto-score.
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { readPage, siteFor } from './generic';

const WAIT_MS = 10_000;
const STEP_MS = 500;

export function watchJobPages(ctx: ContentScriptContext): void {
  let lastSent = '';
  const check = async () => {
    const known = siteFor(location.href);
    if (!known) return;
    const key = `${known.site}:${known.id}`;
    if (key === lastSent) return;
    // Single-page apps render the description after navigation; wait for it.
    for (let waited = 0; waited <= WAIT_MS; waited += STEP_MS) {
      if (ctx.isInvalid) return;
      const page = readPage(document, location.href);
      if (!page.selectorsFailed || waited >= WAIT_MS) {
        if (page.text.length < 200) return;
        lastSent = key;
        try {
          await chrome.runtime.sendMessage({ type: 'pageSeen', page });
        } catch {
          // The service worker may be restarting; the next navigation retries.
        }
        return;
      }
      await new Promise<void>((r) => ctx.setTimeout(r, STEP_MS));
    }
  };
  void check();
  ctx.addEventListener(window, 'wxt:locationchange', () => void check());
}
