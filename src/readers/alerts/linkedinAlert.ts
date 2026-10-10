// LinkedIn job alert email body to job cards. [Unverified] Based on the alert email layout
// as of 2025: each job is a block with a link to /comm/jobs/view/<id>, then "Company · Location".
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
    // The title link is the one with the most text; others wrap logos or "View job".
    const titled = anchors
      .map((a) => ({ a, text: (a.textContent ?? '').replace(/\s+/g, ' ').trim() }))
      .filter((x) => x.text && !/^(view job|apply)$/i.test(x.text))
      .sort((x, y) => y.text.length - x.text.length)[0];
    if (!titled) continue;
    const root = cardRoot(titled.a, body);
    cards.push(cardFrom(root, titled.text, `https://www.linkedin.com/jobs/view/${id}/`, 'linkedin', id));
  }
  return cards;
}
