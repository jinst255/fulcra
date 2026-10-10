import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jobIdFromNotification, maybeNotify } from '../src/pipeline/notify';
import { resetDbForTests } from '../src/store/db';
import { putSampleJobs, updateJob } from '../src/store/jobs';
import { updateSettings } from '../src/store/settings';
import { SAMPLE_ABOUT } from '../src/dev/sample';
import { sampleJobs } from './helpers';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
});

describe('strong-match notifications', () => {
  it('sends one notification after the last job from a check is scored', async () => {
    const create = vi.fn(async () => 'id');
    (chrome.notifications as unknown as { create: unknown }).create = create;
    await updateSettings((s) => {
      s.about = structuredClone(SAMPLE_ABOUT);
      s.scoring.notifyThreshold = 7;
      s.scoring.spread = false;
    });
    const jobs = sampleJobs();
    await putSampleJobs(jobs);
    await updateJob('sample-contract', (j) => ({ ...j, scoring: 'queued' }));
    await chrome.storage.local.set({ emailNotify: { ids: ['sample-dev', 'sample-contract'], at: 1 } });
    await maybeNotify(jobs.find((j) => j.id === 'sample-dev')!);
    expect(create).not.toHaveBeenCalled();
    await updateJob('sample-contract', (j) => ({ ...j, scoring: 'scored' }));
    await maybeNotify(jobs.find((j) => j.id === 'sample-contract')!);
    expect(create).toHaveBeenCalledTimes(1);
    const [id, opts] = create.mock.calls[0] as unknown as [string, { title: string; message: string }];
    expect(opts.title).toBe('Strong match: 7.3');
    expect(opts.message).toBe('Clinic operations internship at Northbeam Health');
    expect(jobIdFromNotification(id)).toBe('sample-dev');
  });
});
