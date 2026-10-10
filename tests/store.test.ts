import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDbForTests } from '../src/store/db';
import { buildExport, deleteEverything, diagnostics } from '../src/store/export';
import {
  addOverride,
  allJobs,
  deleteClosedJobs,
  getJob,
  overrideHistory,
  retentionCleanup,
  upsertJob,
  putSampleJobs,
  clearSampleJobs,
} from '../src/store/jobs';
import { addLog, recentLog, scrub, LOG_MAX } from '../src/store/log';
import {
  getApiKey,
  getSettings,
  keyInfo,
  setApiKey,
  updateSettings,
  withDefaults,
} from '../src/store/settings';
import { job, sampleJobs } from './helpers';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
});

describe('storage', () => {
  it('saves settings with defaults filled in, and the key only in local storage', async () => {
    expect((await getSettings()).profileId).toBe('balanced');
    await updateSettings((s) => {
      s.about.windowWeeks = 22;
    });
    expect((await getSettings()).about.windowWeeks).toBe(22);
    await setApiKey('  sk-test-abcdefghijklmnop7Qx2 ');
    expect(await getApiKey()).toBe('sk-test-abcdefghijklmnop7Qx2');
    expect(await keyInfo()).toEqual({ hasKey: true, last4: '7Qx2' });
    expect(await chrome.storage.sync.get(null)).toEqual({});
  });

  it('turns old "job types to skip" into the job type filter', () => {
    const old = { dealbreakers: { excludeTypes: ['seasonal', 'contract'] } } as never;
    const s = withDefaults(old);
    expect(s.ui.jobTypes).toEqual(['full_time', 'part_time', 'internship', 'unknown']);
    expect('excludeTypes' in s.dealbreakers).toBe(false);
    expect(withDefaults({} as never).ui.jobTypes).toEqual([]);
  });

  it('merges a duplicate job instead of adding a second one', async () => {
    const a = job('analyst');
    await upsertJob(a);
    const b = { ...job('analyst'), id: 'other', preliminary: false, listingText: 'Full posting '.repeat(20) };
    const out = await upsertJob(b);
    expect(out.id).toBe(a.id);
    expect((await allJobs()).length).toBe(1);
    expect((await getJob(a.id))!.preliminary).toBe(false);
  });

  it('deletes closed jobs, old jobs, and sample jobs', async () => {
    await putSampleJobs(sampleJobs());
    expect(await deleteClosedJobs()).toBe(1);
    const old = {
      ...job('dev'),
      id: 'old',
      dedupeKey: 'x',
      sample: false,
      lastSeenAt: Date.now() - 100 * 86400000,
    };
    await upsertJob(old);
    expect(await retentionCleanup(90)).toBeGreaterThanOrEqual(1);
    expect(await getJob('old')).toBeUndefined();
    expect(await retentionCleanup(null)).toBe(0);
    await clearSampleJobs();
    expect(await allJobs()).toEqual([]);
  });

  it('keeps the log to 500 entries and never stores a key', async () => {
    expect(scrub('failed with sk-proj-abcdefghijkl123 and Bearer xyz')).toBe('failed with sk-… and Bearer …');
    for (let i = 0; i < LOG_MAX + 5; i++) await addLog('TEST', 'background', String(i));
    const log = await recentLog();
    expect(log.length).toBe(LOG_MAX);
    expect(log[0]!.detail).toBe(String(LOG_MAX + 4));
  });

  it('exports without the key, and deletes everything', async () => {
    await setApiKey('sk-secret-value-1234567890');
    await upsertJob(job('dev'));
    await addOverride({ jobId: 'x', dimensionId: 'impact', modelScore: 5, userScore: 8, at: 1 });
    const file = await buildExport();
    expect(JSON.stringify(file)).not.toContain('sk-secret');
    expect(file.jobs.length).toBe(1);
    expect(await diagnostics()).not.toContain('sk-secret');
    await addLog('MAIL_CHANGED', 'background', 'outlook now days=2 [0-2] no search box; box=0 list=1');
    expect(JSON.parse(await diagnostics()).lastEmailProblem).toMatch(
      /MAIL_CHANGED outlook now .*no search box/,
    );
    await deleteEverything();
    expect(await allJobs()).toEqual([]);
    expect(await overrideHistory()).toEqual([]);
    expect(await getApiKey()).toBeNull();
  });
});
