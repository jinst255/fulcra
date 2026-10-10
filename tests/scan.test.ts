import { fakeBrowser } from 'wxt/testing/fake-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageExtraction } from '../src/readers/extract';

const intake = vi.hoisted(() => ({
  readTab: vi.fn(),
  intakePage: vi.fn(),
  waitForLoad: vi.fn(async () => undefined),
}));
vi.mock('../src/pipeline/intake', () => intake);

const { scanJobs, stopScan } = await import('../src/pipeline/scan');
const { getStatus, onStatusChanged } = await import('../src/store/settings');

const page = (url: string): PageExtraction => ({
  site: null,
  siteJobId: null,
  url,
  title: 'Analyst',
  company: null,
  location: null,
  pay: null,
  text: 'Responsibilities and qualifications for this full-time analyst job. '.repeat(5),
  closed: false,
  isJobPage: true,
  selectorsFailed: false,
  selectorVersion: null,
});

let nextTab = 1;
const urlOf = new Map<number, string>();
const removed: number[] = [];
const groups: number[] = [];

beforeEach(() => {
  nextTab = 1;
  urlOf.clear();
  removed.length = 0;
  groups.length = 0;
  vi.clearAllMocks();
  const c = fakeBrowser as unknown as Record<string, Record<string, unknown>>;
  c.windows!.getLastFocused = async () => ({ id: 7 });
  c.tabs!.create = async ({ url }: { url: string }) => {
    const id = nextTab++;
    urlOf.set(id, url);
    return { id };
  };
  c.tabs!.group = async (o: { groupId?: number }) => {
    const g = o.groupId ?? 100 + groups.length;
    groups.push(g);
    return g;
  };
  c.tabs!.remove = async (id: number) => void removed.push(id);
  c.tabGroups = { update: async () => ({}) };
  intake.readTab.mockImplementation(async (tabId: number) => {
    const url = urlOf.get(tabId)!;
    return url.endsWith('/gone') ? null : page(url);
  });
  intake.intakePage.mockImplementation(async (p: PageExtraction) => ({
    ok: true,
    jobId: p.url,
    already: false,
  }));
});

describe('scoring every job on a page', () => {
  it('reads each link in one tucked-away group, saves the jobs, and reports progress', async () => {
    const seen: (string | null)[] = [];
    const off = onStatusChanged((s) => seen.push(s.scan && `${s.scan.done}/${s.scan.total}`));
    const urls = ['a', 'b', 'gone', 'c'].map((x) => `https://jobs.example/jobs/${x}`);
    await scanJobs(urls.map((url) => ({ url, title: null })));
    off();

    expect(intake.intakePage.mock.calls.map((c) => (c[0] as PageExtraction).url).sort()).toEqual(
      [urls[0], urls[1], urls[3]].sort(),
    );
    expect(new Set(groups).size).toBe(1);
    expect(removed.sort()).toEqual([1, 2, 3, 4]);
    expect(seen).toContain('4/4');
    expect((await getStatus()).scan).toBeNull();
  }, 30_000);

  it('stops when asked, and leaves no scan running', async () => {
    intake.readTab.mockImplementation(async () => {
      stopScan();
      return page('https://jobs.example/jobs/x');
    });
    await scanJobs(
      Array.from({ length: 10 }, (_, i) => ({ url: `https://jobs.example/jobs/${i}`, title: null })),
    );
    expect(intake.intakePage.mock.calls.length).toBeLessThanOrEqual(3);
    expect((await getStatus()).scan).toBeNull();
  });
});
