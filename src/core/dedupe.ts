// Dedupe keys and merging. Blueprint section 12.3.
import type { JobRecord } from './types';

export function normalize(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** site:jobId when the site's id is known, else normalized company|title|location. */
export function dedupeKey(input: {
  site?: string | null;
  siteJobId?: string | null;
  company?: string | null;
  title?: string | null;
  location?: string | null;
}): string {
  if (input.site && input.siteJobId) return `${input.site}:${input.siteJobId}`;
  return [normalize(input.company), normalize(input.title), normalize(input.location)].join('|');
}

/** The other key a job can be matched by, so a page visit finds the email record and the reverse. */
export function factsKey(job: Pick<JobRecord, 'facts'>): string {
  return dedupeKey({ company: job.facts.company, title: job.facts.title, location: job.facts.location });
}

function richness(j: JobRecord): number {
  return (j.preliminary ? 0 : 1_000_000) + j.listingText.length;
}

/**
 * Merges two records for the same job. Keeps the richer listing, and a full
 * score over a preliminary one. The older id and added date are kept.
 */
export function mergeJobs(existing: JobRecord, incoming: JobRecord): JobRecord {
  const richer = richness(incoming) > richness(existing) ? incoming : existing;
  const base = { ...richer };
  base.id = existing.id;
  base.addedAt = Math.min(existing.addedAt, incoming.addedAt);
  base.lastSeenAt = Math.max(existing.lastSeenAt, incoming.lastSeenAt);
  base.updatedAt = Date.now();
  base.siteJobId = existing.siteJobId ?? incoming.siteJobId;
  base.sourceUrl = richer.sourceUrl ?? existing.sourceUrl ?? incoming.sourceUrl;
  // A dedupe key with a site id beats a facts key.
  base.dedupeKey = existing.dedupeKey.includes(':') ? existing.dedupeKey : incoming.dedupeKey;
  // Keep the user's overrides whichever record wins.
  for (const [id, s] of Object.entries(existing.scores)) {
    const target = base.scores[id];
    if (s.override != null && target)
      base.scores = { ...base.scores, [id]: { ...target, override: s.override } };
  }
  // The newest known status wins.
  base.status = incoming.status !== 'unknown' ? incoming.status : existing.status;
  return base;
}
