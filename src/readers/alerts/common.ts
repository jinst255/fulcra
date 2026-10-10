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
  // innerText needs layout: on a detached copy (what the readers parse) Chrome runs the lines together.
  const text =
    el.isConnected && typeof html.innerText === 'string' && html.innerText ? html.innerText : blockText(el);
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

/**
 * Link text from promotions, newsletters, and account emails. Kept to phrases no job title uses,
 * so "Event Coordinator" or "Premium Account Manager" still count.
 */
const PROMO =
  /\b(subscribe|subscription|unsubscribe|last chance|limited time|free trial|try premium|try it free|upgrade (to|now)|sign ?up|log ?in|sign ?in|newsletter|webinar|reset your|update your|manage (your )?(preferences|settings|alerts)|refer a friend|get the app|learn more|read more|shop now)\b|\d+% off/i;

/** Words that name a role, for titles whose links don't say "job". */
const ROLE =
  /\b(engineer|developer|programmer|manager|analyst|assistant|associate|specialist|coordinator|technician|tech|nurse|rn|lpn|cna|intern(ship)?|fellow(ship)?|representative|rep|consultant|designer|administrator|director|lead|officer|clerk|cashier|driver|teacher|tutor|instructor|scientist|researcher|operator|supervisor|agent|advisor|accountant|therapist|aide|worker|attendant|cook|chef|server|barista|sales(person)?|recruiter|writer|editor|librarian|mechanic|electrician|plumber|carpenter|pharmacist|physician|counselor|coach|scheduler|planner|architect|auditor|bookkeeper|receptionist|secretary|paralegal|attorney|lifeguard|caregiver|housekeeper|janitor|custodian|laborer|installer|inspector|dispatcher|courier|warehouse|stocker|host(ess)?|bartender|dishwasher|volunteer|apprentice|trainee|part[- ]time|full[- ]time|remote)\b/i;

/** True when the text names a role. */
export const isRole = (s: string): boolean => ROLE.test(s);

/** A detail line of a card: "$12/hr • Part-Time • Pocatello, ID (Onsite)". */
const BULLETS = /\s[·•|]\s/;
/** A place: "City, ST" first, else a work arrangement. */
const PLACES = [/,\s*[A-Z]{2}\b/, /\b(remote|on-?site|hybrid)\b/i];

/**
 * The job title in a link: its text, or, for a link that wraps a whole card (logo, company,
 * title, details), the line that names the role, else the last plain line (company comes first).
 */
export function linkTitle(a: Element, isRole: (s: string) => boolean = () => false): string | null {
  const whole = (a.textContent ?? '').replace(/\s+/g, ' ').trim();
  const ls = lines_(a).filter((l) => !NOISE.test(l) && !PAY.test(l) && !BULLETS.test(l));
  if (ls.length <= 1) {
    const one = looksLikeJobTitle(whole) ? whole : (ls[0] ?? '');
    return looksLikeJobTitle(one) ? one : null;
  }
  const pick = ls.find(isRole) ?? ls[ls.length - 1]!;
  return looksLikeJobTitle(pick) ? pick : null;
}

/** True when link text looks like a job title rather than a promotion or account notice. */
export function looksLikeJobTitle(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean).length;
  return text.length >= 3 && text.length <= 120 && words <= 16 && !PROMO.test(text) && !/[!?]$/.test(text);
}

export function cardFrom(
  root: Element,
  title: string,
  url: string,
  site: AlertCard['site'],
  siteJobId: string | null,
): AlertCard {
  const ls = lines_(root).filter((l) => !NOISE.test(l) && l !== title);
  const payLine = ls.find((l) => PAY.test(l)) ?? null;
  // "$12/hr • Part-Time • Pocatello, ID (Onsite)": pay and place share one line.
  const detailPlace =
    payLine && BULLETS.test(payLine)
      ? (() => {
          const parts = payLine
            .split(BULLETS)
            .map((x) => x.trim())
            .filter((x) => !PAY.test(x));
          for (const re of PLACES) {
            const hit = parts.find((x) => re.test(x));
            if (hit) return hit;
          }
          return null;
        })()
      : null;
  const rest = ls.filter((l) => l !== payLine);
  let company: string | null;
  let location: string | null;
  const first = rest[0];
  if (detailPlace) {
    company = first ?? null;
    location = detailPlace;
  } else if (first && BULLETS.test(first)) {
    const [c, loc] = first.split(BULLETS);
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
