// LinkedIn job pages: selectors and closed detection, versioned.
// [Unverified] LinkedIn changes class names often. When reading breaks, update these
// lists and bump the version; the generic reader covers the gap meanwhile.
import { cleanText, looksClosed, textOf, type PageExtraction } from './extract';

export const LINKEDIN_SELECTORS_VERSION = 'linkedin-2026-10-10';

export function linkedInJobId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)linkedin\.com$/.test(u.hostname)) return null;
    const m = /\/jobs\/view\/(?:[^/]*-)?(\d{6,})/.exec(u.pathname);
    if (m) return m[1]!;
    const cur = u.searchParams.get('currentJobId');
    return cur && /^\d+$/.test(cur) ? cur : null;
  } catch {
    return null;
  }
}

const SEL = {
  title: [
    '.job-details-jobs-unified-top-card__job-title h1',
    '.job-details-jobs-unified-top-card__job-title',
    '.jobs-unified-top-card__job-title',
    'h1.top-card-layout__title',
    '.jobs-details h1',
    'main h1',
  ],
  company: [
    '.job-details-jobs-unified-top-card__company-name a',
    '.job-details-jobs-unified-top-card__company-name',
    '.jobs-unified-top-card__company-name',
    'a.topcard__org-name-link',
    '.topcard__flavor a',
  ],
  location: [
    '.job-details-jobs-unified-top-card__primary-description-container .tvm__text',
    '.job-details-jobs-unified-top-card__bullet',
    '.jobs-unified-top-card__bullet',
    '.topcard__flavor--bullet',
  ],
  description: [
    '#job-details',
    '.jobs-description__content',
    '.jobs-box__html-content',
    '.jobs-description-content__text',
    '.show-more-less-html__markup',
    '.description__text',
  ],
  pay: ['.job-details-preferences-and-skills', '.salary.compensation__salary', '.compensation__salary'],
  closed: ['.jobs-details-top-card__apply-error', '.closed-job', '.jobs-unified-top-card__apply-error'],
};

export function readLinkedIn(doc: Document, url: string): PageExtraction | null {
  const siteJobId = linkedInJobId(url);
  if (!siteJobId) return null;
  const description = textOf(doc, SEL.description);
  const title = textOf(doc, SEL.title);
  if (!description || !title) return null;
  const closedText = textOf(doc, SEL.closed) ?? '';
  const top =
    textOf(doc, [
      '.job-details-jobs-unified-top-card__container--two-pane',
      '.jobs-unified-top-card',
      '.top-card-layout',
    ]) ?? '';
  const pay = textOf(doc, SEL.pay);
  const header = [title, textOf(doc, SEL.company), textOf(doc, SEL.location), pay].filter(Boolean).join('\n');
  return {
    site: 'linkedin',
    siteJobId,
    url: `https://www.linkedin.com/jobs/view/${siteJobId}/`,
    title,
    company: textOf(doc, SEL.company),
    location: textOf(doc, SEL.location)?.split('·')[0]?.trim() ?? null,
    pay,
    text: cleanText(`${header}\n\n${description}`),
    closed: looksClosed(closedText) || looksClosed(top),
    isJobPage: true,
    selectorsFailed: false,
    selectorVersion: LINKEDIN_SELECTORS_VERSION,
  };
}
