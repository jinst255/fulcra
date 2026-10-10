// Readability fallback for any page (reached through activeTab), and the dispatcher that
// tries the site readers first. Blueprint sections 7 (PAGE_UNSUPPORTED, PAGE_CHANGED) and 14.
import { Readability } from '@mozilla/readability';
import {
  cleanText,
  headerText,
  looksClosed,
  looksLikeJob,
  textOf,
  type PageExtraction,
  type Site,
} from './extract';
import { handshakeJobId, readHandshake } from './handshake';
import { indeedJobId, readIndeed } from './indeed';
import { linkedInJobId, readLinkedIn } from './linkedin';

function meta(doc: Document, name: string): string | null {
  const el = doc.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
  return el?.getAttribute('content')?.trim() || null;
}

/** JSON-LD JobPosting, which many job boards publish. */
function jobPostingLd(doc: Document): Record<string, unknown> | null {
  for (const s of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      const data = JSON.parse(s.textContent ?? '') as unknown;
      const list = Array.isArray(data)
        ? data
        : [data, ...((data as { '@graph'?: unknown[] })['@graph'] ?? [])];
      for (const x of list)
        if (x && (x as { '@type'?: string })['@type'] === 'JobPosting') return x as Record<string, unknown>;
    } catch {
      // Ignore malformed JSON-LD.
    }
  }
  return null;
}

function stripHtml(html: string, doc: Document): string {
  const div = doc.createElement('div');
  div.innerHTML = html;
  return cleanText(div.textContent);
}

export function readGeneric(doc: Document, url: string): PageExtraction {
  const ld = jobPostingLd(doc);
  let title: string | null = null;
  let company: string | null = null;
  let location: string | null = null;
  let text = '';
  if (ld) {
    title = typeof ld.title === 'string' ? ld.title : null;
    const org = ld.hiringOrganization as { name?: string } | undefined;
    company = org?.name ?? null;
    const loc = (Array.isArray(ld.jobLocation) ? ld.jobLocation[0] : ld.jobLocation) as
      { address?: { addressLocality?: string; addressRegion?: string } } | undefined;
    if (loc?.address)
      location = [loc.address.addressLocality, loc.address.addressRegion].filter(Boolean).join(', ') || null;
    if (typeof ld.description === 'string') text = stripHtml(ld.description, doc);
  }
  if (text.length < 200) {
    try {
      const article = new Readability(doc.cloneNode(true) as Document, { charThreshold: 300 }).parse();
      if (article?.textContent) text = cleanText(article.textContent);
      title ??= article?.title?.trim() || null;
    } catch {
      // Fall through to body text.
    }
  }
  if (text.length < 200)
    text = cleanText((doc.body as HTMLElement | null)?.innerText ?? doc.body?.textContent);
  title ??= meta(doc, 'og:title') ?? textOf(doc, ['h1']) ?? (doc.title || null);
  const header = [title, company, location].filter(Boolean).join('\n');
  return {
    site: null,
    siteJobId: null,
    url,
    title,
    company,
    location,
    pay: null,
    text: cleanText(header ? `${header}\n\n${text}` : text),
    closed: looksClosed(text.slice(0, 3000)) || looksClosed(headerText(doc)),
    isJobPage: !!ld || looksLikeJob(text),
    selectorsFailed: false,
    selectorVersion: null,
  };
}

export function siteFor(url: string): { site: Site; id: string } | null {
  const l = linkedInJobId(url);
  if (l) return { site: 'linkedin', id: l };
  const h = handshakeJobId(url);
  if (h) return { site: 'handshake', id: h };
  const i = indeedJobId(url);
  if (i) return { site: 'indeed', id: i };
  return null;
}

/** Site reader first; if a known site's selectors find nothing, the generic reader with PAGE_CHANGED noted. */
export function readPage(doc: Document, url: string): PageExtraction {
  const known = siteFor(url);
  if (known) {
    const r =
      known.site === 'linkedin'
        ? readLinkedIn(doc, url)
        : known.site === 'handshake'
          ? readHandshake(doc, url)
          : readIndeed(doc, url);
    if (r) return r;
    const g = readGeneric(doc, url);
    return {
      ...g,
      site: known.site,
      siteJobId: known.id,
      selectorsFailed: true,
      isJobPage: g.text.length >= 200,
    };
  }
  return readGeneric(doc, url);
}

export function isUrl(text: string): boolean {
  const t = text.trim();
  if (/\s/.test(t)) return false;
  try {
    const u = new URL(t);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}
