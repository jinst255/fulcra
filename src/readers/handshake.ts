// Handshake job pages: selectors and closed detection, versioned.
// [Unverified] Handshake uses hashed class names; these rely on stable attributes and
// headings. The generic reader covers the gap when they miss.
import { cleanText, looksClosed, textOf, type PageExtraction } from './extract';

export const HANDSHAKE_SELECTORS_VERSION = 'handshake-2026-10-10';

export function handshakeJobId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)joinhandshake\.com$/.test(u.hostname)) return null;
    const m = /\/(?:stu\/)?(?:jobs|job-search)\/(\d+)/.exec(u.pathname);
    if (m) return m[1]!;
    const q = u.searchParams.get('jobId');
    return q && /^\d+$/.test(q) ? q : null;
  } catch {
    return null;
  }
}

const SEL = {
  title: ['[data-hook="job-details-page"] h1', '[data-hook="job-title"]', 'main h1', 'h1'],
  company: ['a[href*="/employers/"]', 'a[href*="/e/"]', '[data-hook="employer-name"]'],
  location: ['[data-hook="job-location"]', '[data-hook="location"]'],
  description: [
    '[data-hook="job-description"]',
    '[data-hook="job-details-page"] [class*="description"]',
    '[class*="job-description"]',
    '[data-hook="job-details-page"]',
    'main',
  ],
  pay: ['[data-hook="salary"]', '[data-hook="compensation"]'],
};

export function readHandshake(doc: Document, url: string): PageExtraction | null {
  const siteJobId = handshakeJobId(url);
  if (!siteJobId) return null;
  const description = textOf(doc, SEL.description);
  const title = textOf(doc, SEL.title);
  if (!description || !title || description.length < 200) return null;
  const header = [title, textOf(doc, SEL.company), textOf(doc, SEL.location), textOf(doc, SEL.pay)]
    .filter(Boolean)
    .join('\n');
  return {
    site: 'handshake',
    siteJobId,
    url,
    title,
    company: textOf(doc, SEL.company),
    location: textOf(doc, SEL.location),
    pay: textOf(doc, SEL.pay),
    text: cleanText(`${header}\n\n${description}`),
    closed: looksClosed(description.slice(0, 2000)),
    isJobPage: true,
    selectorsFailed: false,
    selectorVersion: HANDSHAKE_SELECTORS_VERSION,
  };
}
