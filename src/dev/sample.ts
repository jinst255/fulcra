// Turns demo/sample-data.json into job records and settings. Used by
// "Load sample data" in developer mode and by the tests (blueprint 23.4).
import sample from '../../demo/sample-data.json';
import { DEFAULT_ORDER } from '../core/dimensions';
import { dedupeKey } from '../core/dedupe';
import type {
  About,
  Dealbreakers,
  JobRecord,
  JobStatus,
  JobType,
  PayPeriod,
  Remote,
  Source,
  YesNoUnknown,
} from '../core/types';

interface SampleJob {
  id: string;
  title: string;
  company: string;
  location: string;
  source: string;
  status: string;
  preliminary?: boolean;
  pay: { min: number; max: number; period: string; is_estimate: boolean };
  hours: number;
  weeks: number;
  takeHome: number;
  payUnitCorrection?: { from: string; to: string; reason: string };
  scores: number[];
  reasons: string[];
}

/** Facts the approved demo filled in that the sample file doesn't carry. */
const EXTRA: Record<string, { jobType: JobType; remote: Remote; relocation: YesNoUnknown; added: string }> = {
  dev: { jobType: 'internship', remote: 'hybrid', relocation: 'yes', added: '2026-10-06' },
  contract: { jobType: 'contract', remote: 'yes', relocation: 'no', added: '2026-10-05' },
  sales: { jobType: 'seasonal', remote: 'no', relocation: 'yes', added: '2026-10-03' },
  warehouse: { jobType: 'seasonal', remote: 'no', relocation: 'no', added: '2026-10-04' },
  tutor: { jobType: 'part_time', remote: 'hybrid', relocation: 'no', added: '2026-10-02' },
  ta: { jobType: 'part_time', remote: 'no', relocation: 'no', added: '2026-10-01' },
  analyst: { jobType: 'full_time', remote: 'unknown', relocation: 'unknown', added: '2026-10-08' },
  helpdesk: { jobType: 'full_time', remote: 'no', relocation: 'no', added: '2026-09-28' },
};

export const SAMPLE_ABOUT: About = sample.about as About;
export const SAMPLE_DEALBREAKERS: Dealbreakers = sample.dealbreakers as Dealbreakers;
export const SAMPLE_JOBS: SampleJob[] = sample.jobs as SampleJob[];

export function sampleJobRecords(now = Date.now()): JobRecord[] {
  return SAMPLE_JOBS.map((s) => {
    const extra = EXTRA[s.id]!;
    const added = new Date(extra.added + 'T12:00:00').getTime();
    const scores: JobRecord['scores'] = {};
    DEFAULT_ORDER.forEach((dimId, i) => {
      if (dimId === 'pay') return;
      scores[dimId] = {
        score: s.scores[i]!,
        reason: s.reasons[i]!,
        dimVersion: 1,
        state: s.preliminary ? 'preliminary' : 'current',
        override: null,
      };
    });
    const status = s.status as JobStatus;
    return {
      id: `sample-${s.id}`,
      dedupeKey: dedupeKey({ company: s.company, title: s.title, location: s.location }),
      source: s.source as Source,
      sourceUrl: s.source === 'paste' ? null : `https://example.com/jobs/${s.id}`,
      siteJobId: null,
      listingText: `${s.title} at ${s.company}, ${s.location}.`,
      facts: {
        title: s.title,
        company: s.company,
        location: s.location,
        remote: extra.remote,
        pay: {
          min: s.pay.min,
          max: s.pay.max,
          period: s.pay.period as PayPeriod,
          currency: 'USD',
          is_estimate: s.pay.is_estimate,
        },
        hours_per_week: s.hours,
        duration_weeks: s.weeks,
        job_type: extra.jobType,
        commission_or_variable: s.id === 'sales' ? 'yes' : 'no',
        relocation_required: extra.relocation,
        languages_required: ['English'],
        status,
      },
      payUnitCorrection: s.payUnitCorrection
        ? {
            from: s.payUnitCorrection.from as PayPeriod,
            to: s.payUnitCorrection.to as PayPeriod,
            reason: s.payUnitCorrection.reason,
          }
        : null,
      scores,
      status,
      addedAt: added,
      updatedAt: added,
      lastSeenAt: now,
      flags: [],
      preliminary: !!s.preliminary,
      scoring: 'scored',
      scoreError: null,
      knownCosts: 0,
      rawOutput: null,
      sample: true,
    };
  });
}
