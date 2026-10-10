// The jobs a page links to: a search page, an employer's job list, a careers page. For the
// popup's "Score all" button, which then opens and reads each one.
import { CHROME, JOB_URL } from './alerts/genericAlert';
import { isRole, linkTitle } from './alerts/common';
import { siteFor } from './generic';

export interface JobLink {
  url: string;
  title: string | null;
}

/** More than this is a whole search, not a page to compare; the first ones are enough. */
export const MAX_SCAN = 50;

function canonical(url: string): { key: string; url: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const known = siteFor(u.href);
  if (known) {
    const href =
      known.site === 'linkedin'
        ? `https://www.linkedin.com/jobs/view/${known.id}/`
        : known.site === 'indeed'
          ? `https://www.indeed.com/viewjob?jk=${known.id}`
          : u.href;
    return { key: `${known.site}:${known.id}`, url: href };
  }
  u.hash = '';
  return { key: u.href, url: u.href };
}

/** Job links on the page, once each, in page order. Leaves out the job the page itself shows. */
export function findJobLinks(doc: Document, pageUrl: string): { links: JobLink[]; more: boolean } {
  const self = canonical(pageUrl)?.key;
  const seen = new Set<string>(self ? [self] : []);
  const links: JobLink[] = [];
  let more = false;
  for (const a of Array.from(doc.querySelectorAll('a[href]')) as HTMLAnchorElement[]) {
    const c = canonical(a.href);
    if (!c || seen.has(c.key)) continue;
    const title = linkTitle(a, isRole);
    // A known site's job link counts whatever its text (cards often wrap a logo).
    if (!siteFor(c.url)) {
      if (!JOB_URL.test(c.url) || !title || CHROME.test(title)) continue;
      if (/^(view|apply|see|manage|explore|search|browse|save)\b/i.test(title)) continue;
      // A list page, not a posting: /jobs, /careers, /jobs?page=2.
      if (/\/(jobs?|careers?|positions?|openings?)\/?$/i.test(new URL(c.url).pathname)) continue;
    }
    seen.add(c.key);
    if (links.length >= MAX_SCAN) {
      more = true;
      break;
    }
    links.push({ url: c.url, title });
  }
  return { links, more };
}
