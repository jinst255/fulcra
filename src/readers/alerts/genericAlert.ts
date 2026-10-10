// Job alert emails from any other sender (Indeed, ZipRecruiter, a company's careers site, a
// forward): links that read like job titles, with the lines around them. Runs only when no
// site-specific parser found a job. Mistakes cost little: scoring flags non-jobs as not_a_job.
import type { AlertCard } from '../../email/types';
import { cardFrom, cardRoot, isRole, linkTitle, lines_, unwrapLink } from './common';

/** Links that point at a posting or an application. */
const JOB_URL =
  /\/(jobs?|careers?|positions?|openings?|vacanc(y|ies)|postings?|requisitions?|apply|viewjob|rc\/clk)\b|[?&](jk|gh_jid|job_?id|jobid|req(uisition)?_?id)=|greenhouse\.io|lever\.co|myworkdayjobs\.com|ashbyhq\.com|smartrecruiters\.com|icims\.com|jobvite\.com|workable\.com|bamboohr\.com|indeed\.com|ziprecruiter\.com|glassdoor\.com|monster\.com|dice\.com|simplyhired\.com|wellfound\.com/i;

/** Links every email has: footers, accounts, and settings. */
const CHROME =
  /^(privacy|privacy policy|terms|terms of (use|service)|help|help center|contact( us)?|support|about( us)?|careers? (home|site)|view (in|on) (browser|web)|unsubscribe|preferences|settings|edit (alert|search)|manage alerts?|download|app store|google play|facebook|twitter|x|linkedin|instagram|youtube|tiktok|home|here|click here|this link|see (all|more)( jobs)?|view (all|more)( jobs)?|more jobs|show more|.*@.*|https?:\/\/.*|www\..*)$/i;

const MAX_CARDS = 30;

export function parseGenericAlert(body: Element): AlertCard[] {
  const cards: AlertCard[] = [];
  const seen = new Set<string>();
  for (const a of Array.from(body.querySelectorAll('a[href]')) as HTMLAnchorElement[]) {
    if (cards.length >= MAX_CARDS) break;
    const href = unwrapLink(a.getAttribute('href') ?? '');
    if (!/^https?:\/\//i.test(href)) continue;
    const title = linkTitle(a, isRole);
    if (!title || CHROME.test(title) || /^(view|apply|see|manage|explore)\b/i.test(title)) continue;
    const root = cardRoot(a, body);
    // A job link, or a role name with something beside it (a company, a place, pay).
    const jobUrl = JOB_URL.test(href);
    if (!jobUrl && !(isRole(title) && lines_(root).length >= 2)) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push(cardFrom(root, title, href, null, null));
  }
  return cards;
}
