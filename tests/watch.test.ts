// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { pageSeen } from '../src/pipeline/intake';
import { readPage } from '../src/readers/generic';
import type { PageExtraction } from '../src/readers/extract';
import { watchJobPages } from '../src/readers/watch';
import { resetDbForTests } from '../src/store/db';
import { allJobs } from '../src/store/jobs';
import { recentLog } from '../src/store/log';
import { updateSettings } from '../src/store/settings';

const search = (id: string) => `https://www.linkedin.com/jobs/search/?currentJobId=${id}&keywords=intern`;

/** LinkedIn's split view, showing one job in the details pane. */
function show(title: string) {
  document.body.innerHTML = `
    <div class="job-details-jobs-unified-top-card__job-title"><h1>${title}</h1></div>
    <div class="job-details-jobs-unified-top-card__company-name"><a>Northbeam</a></div>
    <div id="job-details">${`The ${title} role builds and ships features with a small team. `.repeat(6)}</div>`;
}

function watch() {
  const sent: PageExtraction[] = [];
  vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockImplementation((async (m: { page: PageExtraction }) => {
    sent.push(m.page);
  }) as never);
  let onChange: (e: { newUrl: URL }) => void = () => undefined;
  const ctx = {
    isInvalid: false,
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    addEventListener: (_t: unknown, _type: string, h: typeof onChange) => (onChange = h),
  } as unknown as ContentScriptContext;
  return { sent, ctx, go: (url: string) => onChange({ newUrl: new URL(url) }) };
}

describe('watching job pages', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sends each job you click to, with that job’s text, not the one still on screen', async () => {
    vi.spyOn(window, 'location', 'get').mockReturnValue(new URL(search('1111111')) as never);
    show('Data intern');
    const w = watch();
    watchJobPages(w.ctx);
    await vi.advanceTimersByTimeAsync(1000);
    expect(w.sent.map((p) => [p.siteJobId, p.title])).toEqual([['1111111', 'Data intern']]);

    // The address changes first; the pane still shows the old job for a moment.
    w.go(search('2222222'));
    await vi.advanceTimersByTimeAsync(1500);
    expect(w.sent).toHaveLength(1);
    show('Design intern');
    await vi.advanceTimersByTimeAsync(1000);
    expect(w.sent.map((p) => [p.siteJobId, p.title])).toEqual([
      ['1111111', 'Data intern'],
      ['2222222', 'Design intern'],
    ]);
  });

  it('sends nothing when the pane never changes, and only the last of quick clicks', async () => {
    vi.spyOn(window, 'location', 'get').mockReturnValue(new URL(search('1111111')) as never);
    show('Data intern');
    const w = watch();
    watchJobPages(w.ctx);
    await vi.advanceTimersByTimeAsync(1000);
    w.go(search('3333333'));
    await vi.advanceTimersByTimeAsync(12_000);
    expect(w.sent).toHaveLength(1);

    w.go(search('4444444'));
    await vi.advanceTimersByTimeAsync(200);
    w.go(search('5555555'));
    show('Ops intern');
    await vi.advanceTimersByTimeAsync(12_000);
    expect(w.sent.map((p) => p.siteJobId)).toEqual(['1111111', '5555555']);
  });
});

describe('auto-scoring a page you opened', () => {
  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    await updateSettings((s) => {
      s.scoring.autoScore = true;
    });
  });

  it('saves a job once, even when two tabs report it at the same time', async () => {
    show('Data intern');
    const page = readPage(document, search('1111111'));
    await Promise.all([pageSeen(page), pageSeen(page)]);
    expect(await allJobs()).toHaveLength(1);
  });

  it('logs a page the site reader can’t read instead of scoring it', async () => {
    document.body.innerHTML = `<main>${'Search results: many jobs listed here. '.repeat(10)}</main>`;
    const page = readPage(document, search('1111111'));
    expect(page.selectorsFailed).toBe(true);
    await pageSeen(page);
    expect(await allJobs()).toHaveLength(0);
    expect((await recentLog()).map((e) => e.code)).toContain('PAGE_CHANGED');
  });
});
