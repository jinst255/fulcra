// Shared email-check types.

/** Average job cards per LinkedIn or Handshake alert email, for the import estimate. [Unverified] */
export const JOBS_PER_ALERT = 4;

export interface SignInResult {
  status: 'ok' | 'signedOut' | 'changed' | 'error';
  provider?: 'gmail' | 'outlook';
  /** Alert emails found per import range, when the check could count them. */
  emailCounts: Record<'7' | '30' | '90' | 'all', number> | null;
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
