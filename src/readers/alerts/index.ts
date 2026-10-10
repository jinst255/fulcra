// Every alert parser, run over one email body.
import type { AlertCard } from '../../email/types';
import { parseGenericAlert } from './genericAlert';
import { parseHandshakeAlert } from './handshakeAlert';
import { parseLinkedInAlert } from './linkedinAlert';

export function parseAlert(body: Element): AlertCard[] {
  const out: AlertCard[] = [];
  for (const parse of [parseLinkedInAlert, parseHandshakeAlert]) {
    try {
      out.push(...parse(body));
    } catch {
      // One parser failing shouldn't lose the other's cards.
    }
  }
  if (out.length) return out;
  // Any other sender: links that read like job titles.
  try {
    return parseGenericAlert(body);
  } catch {
    return [];
  }
}
