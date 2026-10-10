// Indeed job pages: selectors and closed detection, versioned.
// [Unverified] Selectors based on Indeed's data-testid attributes as of 2025.
import { cleanText, looksClosed, textOf, type PageExtraction } from './extract';

export const INDEED_SELECTORS_VERSION = 'indeed-2026-10-10';

export function indeedJobId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)indeed\.com$/.test(u.hostname)) return null;
    const jk = u.searchParams.get('jk') ?? u.searchParams.get('vjk');
    return jk && /^[a-f0-9]{8,}$/i.test(jk) ? jk : null;
  } catch {
    return null;
  }
}

const SEL = {
  title: [
    '[data-testid="jobsearch-JobInfoHeader-title"]',
    'h1.jobsearch-JobInfoHeader-title',
    '.jobsearch-JobInfoHeader-title-container h1',
    'h2.jobsearch-JobInfoHeader-title',
  ],
  company: [
    '[data-testid="inlineHeader-companyName"]',
    '[data-company-name="true"]',
    '.jobsearch-CompanyInfoContainer a',
  ],
  location: [
    '[data-testid="inlineHeader-companyLocation"]',
    '[data-testid="job-location"]',
    '[data-testid="jobsearch-JobInfoHeader-companyLocation"]',
  ],
  description: ['#jobDescriptionText', '.jobsearch-jobDescriptionText', '[data-testid="jobDescriptionText"]'],
  pay: ['#salaryInfoAndJobType', '[data-testid="jobsearch-OtherJobDetailsContainer"]', '#jobDetailsSection'],
  expired: ['.jobsearch-JobInfoHeader-expiredHeader', '[data-testid="expired-job-header"]'],
};

export function readIndeed(doc: Document, url: string): PageExtraction | null {
  const siteJobId = indeedJobId(url);
  if (!siteJobId) return null;
  const description = textOf(doc, SEL.description);
  const title = textOf(doc, SEL.title)?.replace(/\s*-\s*job post$/i, '') ?? null;
  if (!description || !title) return null;
  const pay = textOf(doc, SEL.pay);
  const header = [title, textOf(doc, SEL.company), textOf(doc, SEL.location), pay].filter(Boolean).join('\n');
  const expired = textOf(doc, SEL.expired) ?? '';
  return {
    site: 'indeed',
    siteJobId,
    url: `https://www.indeed.com/viewjob?jk=${siteJobId}`,
    title,
    company: textOf(doc, SEL.company),
    location: textOf(doc, SEL.location),
    pay,
    text: cleanText(`${header}\n\n${description}`),
    closed: !!expired || looksClosed(header),
    isJobPage: true,
    selectorsFailed: false,
    selectorVersion: INDEED_SELECTORS_VERSION,
  };
}
