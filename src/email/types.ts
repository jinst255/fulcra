// Shared email-check types.

/** Average job cards per alert email, for the import estimate. LinkedIn alerts held 6 (Oct 10, 2026). */
export const JOBS_PER_ALERT = 6;

export type Range = '7' | '30' | '90' | 'all';
export type Provider = 'gmail' | 'outlook';

/** Alert emails found in one range. `atLeast` when the mail page only said "of many". */
export interface RangeCount {
  n: number;
  atLeast: boolean;
}

export interface SignInResult {
  status: 'ok' | 'signedOut' | 'changed' | 'error' | 'busy';
  provider?: Provider;
  /** Alert emails found per import range, when the check could count them. */
  emailCounts: Record<Range, RangeCount> | null;
}

/** Saved after a sign-in check so Settings can show the import estimate later. */
export interface SavedCounts {
  provider: Provider;
  at: number;
  counts: Record<Range, RangeCount>;
}

/** One job card read from an alert email. */
export interface AlertCard {
  title: string;
  company: string | null;
  location: string | null;
  pay: string | null;
  url: string | null;
  site: 'linkedin' | 'handshake' | null;
  siteJobId: string | null;
}

export interface MailRunResult {
  status: 'ok' | 'signedOut' | 'changed' | 'error';
  cards: AlertCard[];
  emailsRead: number;
}

/** What "Check now" and "Import" report back to the page that asked. */
export interface EmailCheckResult {
  status: 'ok' | 'signedOut' | 'changed' | 'error' | 'busy' | 'off';
  provider: Provider | null;
  emails: number;
  newJobs: number;
  /** New jobs are waiting for the user to approve the cost. */
  askedFirst: boolean;
}
