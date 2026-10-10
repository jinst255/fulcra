// Shared page-text extraction. Blueprint section 14 (readers).
export type Site = 'linkedin' | 'handshake' | 'indeed';

export interface PageExtraction {
  site: Site | null;
  siteJobId: string | null;
  url: string;
  title: string | null;
  company: string | null;
  location: string | null;
  pay: string | null;
  /** Visible listing text, trimmed to 30 KB. */
  text: string;
  closed: boolean;
  /** False when the page doesn't look like a single job posting. */
  isJobPage: boolean;
  /** True when a known site's selectors found nothing and the generic reader was used. */
  selectorsFailed: boolean;
  selectorVersion: string | null;
}

export const MAX_TEXT = 30_000;

/** Collapses whitespace in visible text and caps the length. */
export function cleanText(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT);
}

export function textOf(root: ParentNode, selectors: string[]): string | null {
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    const txt = cleanText((el as HTMLElement | null)?.innerText ?? el?.textContent);
    if (txt) return txt;
  }
  return null;
}

const CLOSED_PATTERNS = [
  /no longer accepting applications/i,
  /this job has expired/i,
  /this job is no longer available/i,
  /job (?:posting )?(?:has been )?closed/i,
  /applications? (?:are |is )?closed/i,
  /position has been filled/i,
];

export function looksClosed(text: string): boolean {
  return CLOSED_PATTERNS.some((p) => p.test(text));
}

/** A rough check that generic page text is a job posting, before spending a model call. */
export function looksLikeJob(text: string): boolean {
  if (text.length < 200) return false;
  const hits = [
    /\b(responsibilities|requirements|qualifications)\b/i,
    /\b(apply|application)\b/i,
    /\b(salary|pay|compensation|per hour|\/hr|hourly|wage|stipend)\b/i,
    /\b(full[- ]time|part[- ]time|intern(ship)?|contract|seasonal|remote|hybrid|on-?site)\b/i,
    /\b(experience|skills|role|position|job)\b/i,
  ].filter((p) => p.test(text)).length;
  return hits >= 3;
}
