// Handshake job alert email body to job cards. [Unverified] Handshake emails may wrap links
// in click-tracking redirects; then the job id is unknown and dedupe falls back to the facts.
import type { AlertCard } from '../../email/types';
import { cardFrom, cardRoot, isRole, linkTitle, unwrapLink } from './common';

const JOB_LINK = /joinhandshake\.com\/(?:stu\/)?(?:jobs|job-search)\/(\d+)/;
const TRACKED = /(click|links?|email)\.[^/]*joinhandshake\.com|joinhandshake\.com\/(?:ls|e)\//;

export function parseHandshakeAlert(body: Element): AlertCard[] {
  const cards: AlertCard[] = [];
  const seen = new Set<string>();
  for (const a of Array.from(body.querySelectorAll('a[href]')) as HTMLAnchorElement[]) {
    const href = unwrapLink(a.getAttribute('href') ?? '');
    const id = JOB_LINK.exec(href)?.[1] ?? null;
    if (!id && !TRACKED.test(href)) continue;
    // The title link, or a link wrapping the whole card (the weekly round-up).
    const title = linkTitle(a, isRole);
    if (!title || /^(view|apply|see|manage|explore)\b/i.test(title)) continue;
    const key = id ?? title;
    if (seen.has(key)) continue;
    const root = cardRoot(a, body);
    const card = cardFrom(
      root,
      title,
      id ? `https://app.joinhandshake.com/stu/jobs/${id}` : href,
      'handshake',
      id,
    );
    // A tracked link with no job id is only a job if it reads like a card: an employer or a place.
    if (!id && !card.company && !card.location) continue;
    seen.add(key);
    cards.push(card);
  }
  return cards;
}
