import { defaultSettings } from '../src/core/defaults';
import type { JobRecord, Settings } from '../src/core/types';
import { SAMPLE_ABOUT, SAMPLE_DEALBREAKERS, sampleJobRecords } from '../src/dev/sample';

export function sampleSettings(): Settings {
  const s = defaultSettings();
  s.about = structuredClone(SAMPLE_ABOUT);
  s.dealbreakers = structuredClone(SAMPLE_DEALBREAKERS);
  // The blueprint's worked examples use the model's raw scores.
  s.scoring.spread = false;
  return s;
}

export function sampleJobs(): JobRecord[] {
  return sampleJobRecords(0);
}

export function job(id: string): JobRecord {
  return sampleJobs().find((j) => j.id === `sample-${id}`)!;
}
