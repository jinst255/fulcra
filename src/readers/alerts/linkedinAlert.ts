// LinkedIn job alert email body to job cards. Layout checked against live alerts on 2026-10-10:
// each card has three links to /comm/jobs/view/<id> (logo, one wrapping the whole text block, and
// the title), then lines "Company · Location", an optional pay line, and badges.
import type { AlertCard } from '../../email/types';
import { cardFrom, cardRoot, unwrapLink } from './common';

const JOB_LINK = /linkedin\.com\/(?:comm\/)?jobs\/view\/(?:[^/?]*-)?(\d{6,})/;

export function parseLinkedInAlert(body: Element): AlertCard[] {
  const byId = new Map<string, HTMLAnchorElement[]>();
  for (const a of Array.from(body.querySelectorAll('a[href]')) as HTMLAnchorElement[]) {
    const id = JOB_LINK.exec(unwrapLink(a.getAttribute('href') ?? ''))?.[1];
    if (!id) continue;
    byId.set(id, [...(byId.get(id) ?? []), a]);
  }
  const cards: AlertCard[] = [];
  for (const [id, anchors] of byId) {
    // The title link is the innermost one with text; others wrap the logo, the whole card, or
    // "View job".
    const titled = anchors
      .filter((a) => !anchors.some((b) => b !== a && a.contains(b)))
      .map((a) => ({ a, text: (a.textContent ?? '').replace(/\s+/g, ' ').trim() }))
      .filter((x) => x.text && !/^(view job|apply)$/i.test(x.text))
      .sort((x, y) => y.text.length - x.text.length)[0];
    if (!titled) continue;
    const root = cardRoot(titled.a, body);
    cards.push(cardFrom(root, titled.text, `https://www.linkedin.com/jobs/view/${id}/`, 'linkedin', id));
  }
  return cards;
}
