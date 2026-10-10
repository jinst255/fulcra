// Helpers shared by the alert-email parsers.
import { cleanText } from '../extract';
import type { AlertCard } from '../../email/types';

/** Undoes Gmail and Outlook link wrapping (google.com/url?q=…, safelinks). */
export function unwrapLink(href: string): string {
  try {
    const u = new URL(href, 'https://mail.google.com/');
    if (/(^|\.)google\.com$/.test(u.hostname) && u.pathname === '/url')
      return u.searchParams.get('q') ?? u.searchParams.get('url') ?? href;
    if (/safelinks\.protection\.outlook\.com$/.test(u.hostname)) return u.searchParams.get('url') ?? href;
    return u.href;
  } catch {
    return href;
  }
}

/** The nearest ancestor that looks like one job card: a table cell or block holding a few lines. */
export function cardRoot(a: Element, stopAt: Element): Element {
  let el: Element = a;
  for (let i = 0; i < 8 && el.parentElement && el.parentElement !== stopAt; i++) {
    const parent = el.parentElement;
    const lines = lines_(parent);
    // Stop before the block grows to hold several jobs.
    if (lines.length > 8) break;
    el = parent;
    if (/^(td|table)$/i.test(parent.tagName) && lines.length >= 2) break;
  }
  return el;
}

export function lines_(el: Element): string[] {
  const html = el as HTMLElement;
  const text = typeof html.innerText === 'string' && html.innerText ? html.innerText : blockText(el);
  return cleanText(text)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** innerText stand-in for DOMs without layout (tests): new line at block boundaries. */
export function blockText(el: Element): string {
  const BLOCK = /^(P|DIV|TR|TD|TH|TABLE|LI|UL|OL|H[1-6]|BR|SECTION|ARTICLE|HEADER|FOOTER)$/;
  let out = '';
  const walk = (n: Node) => {
    // Source newlines inside text aren't line breaks once rendered.
    if (n.nodeType === 3) out += (n.textContent ?? '').replace(/\s+/g, ' ');
    else if (n.nodeType === 1) {
      const tag = (n as Element).tagName;
      if (tag === 'STYLE' || tag === 'SCRIPT') return;
      const block = BLOCK.test(tag);
      if (block) out += '\n';
      n.childNodes.forEach(walk);
      if (block) out += '\n';
    }
  };
  walk(el);
  return out;
}

const PAY =
  /(\$|USD|€|£)\s?[\d,.]+(\s?[kK])?(\s?(-|–|to)\s?(\$|USD|€|£)?\s?[\d,.]+(\s?[kK])?)?(\s?(\/|per|an?)\s?(hr|hour|yr|year|week|wk|month|mo))?/;

const NOISE =
  /^(view job|apply|easy apply|see all jobs|see jobs|actively recruiting|promoted|be an early applicant|\d+ (applicants?|connections?|school alum(ni)?).*|new|save|viewed|.*matches your (preferences|job alert).*|.*ago)$/i;

export function cardFrom(
  root: Element,
  title: string,
  url: string,
  site: AlertCard['site'],
  siteJobId: string | null,
): AlertCard {
  const ls = lines_(root).filter((l) => !NOISE.test(l) && l !== title);
  const payLine = ls.find((l) => PAY.test(l)) ?? null;
  const rest = ls.filter((l) => l !== payLine);
  let company: string | null;
  let location: string | null;
  const first = rest[0];
  if (first && /\s[·•|]\s/.test(first)) {
    const [c, loc] = first.split(/\s[·•|]\s/);
    company = c?.trim() || null;
    location = loc?.trim() || null;
  } else {
    company = rest[0] ?? null;
    location = rest[1] && rest[1].length < 80 ? rest[1] : null;
  }
  return {
    title,
    company,
    location,
    pay: payLine ? (PAY.exec(payLine)?.[0] ?? payLine) : null,
    url,
    site,
    siteJobId,
  };
}
