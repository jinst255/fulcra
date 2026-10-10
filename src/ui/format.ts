// Display helpers shared by the popup and the app.
import type { FailReason } from '../core/dealbreakers';
import { approxAmount, formatMoney, formatRate, payMeasure, type TakeHome } from '../core/pay';
import type { EmailAccount, JobRecord, JobType, PayPeriod, PayUnit } from '../core/types';
import { t } from '../i18n/t';

export function failText(reasons: FailReason[]): string {
  return t('ranked.fails', { reasons: reasons.map((r) => t(`fail.${r}`)).join(', ') });
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "3 hours ago", "2 days ago", "just now". */
export function relativeTime(at: number, now = Date.now()): string {
  const s = Math.round((at - now) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return t('email.checkedNow');
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
}

export function shortDate(at: number): string {
  return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * The pay measure in words, without the period: "About $13,300 before tax over 15 weeks (estimate)",
 * or with no time frame, "$18.50 an hour before tax" or "About $38,500 a year before tax".
 */
export function payLine(take: TakeHome): string {
  if (take.total == null) return t('ranked.notScored');
  const line =
    take.per === 'hour'
      ? t('pay.line.hour', { amount: formatRate(take.total) })
      : take.per === 'year'
        ? t('pay.line.year', { amount: formatMoney(approxAmount(take.total)) })
        : t('detail.payLine', { amount: formatMoney(approxAmount(take.total)), weeks: take.weeks });
  return take.estimate ? `${line} ${t('common.estimateParen')}` : line;
}

/** The pay dimension's reason line: "About $13,300 before tax over 15 weeks." */
export function payReason(take: TakeHome): string {
  if (take.total == null) return t('ranked.notScored');
  return payLine(take) + '.';
}

/** The listing's rate in the person's unit, when it's quoted in another: "about $53 an hour". */
export function rateInUnit(job: JobRecord, unit: PayUnit): string | null {
  const p = job.facts.pay.period;
  if (unit === 'total' || p === unit || p === 'unknown') return null;
  const m = payMeasure(job.facts, { per: unit }).total;
  if (m == null || m <= 0) return null;
  return unit === 'hour'
    ? t('pay.equiv.hour', { amount: formatRate(m) })
    : t('pay.equiv.year', { amount: formatMoney(approxAmount(m)) });
}

export function payRate(job: JobRecord): string {
  const p = job.facts.pay;
  if (p.min == null && p.max == null) return t('common.cantTell');
  const lo = p.min ?? p.max!;
  const hi = p.max ?? p.min!;
  const amount = lo === hi ? formatMoney(lo) : `${formatMoney(lo)}–${formatMoney(hi)}`;
  if (p.period === 'unknown') return amount;
  return t(`rate.${p.period}`, { amount });
}

export function periodName(p: PayPeriod): string {
  return p === 'unknown' ? t('common.cantTell') : t(`period.${p}`);
}

export function jobTypeName(jt: JobType): string {
  const key = {
    full_time: 'fullTime',
    part_time: 'partTime',
    internship: 'internship',
    seasonal: 'seasonal',
    contract: 'contract',
  } as const;
  return jt === 'unknown' ? t('common.cantTell') : t(`jobType.${key[jt]}`);
}

/** An inbox's name: its address when known, else "Gmail (account 2)" or "Outlook". */
export function inboxName(a: Pick<EmailAccount, 'provider' | 'index' | 'address'>): string {
  if (a.address) return a.address;
  return a.provider === 'gmail' ? t('email.gmailAccount', { n: a.index + 1 }) : t('setup.email.outlook');
}

/** The name of the inbox with this id, or "your email" if it's gone. */
export function inboxNameById(accounts: EmailAccount[], id: string | null): string {
  const a = id ? accounts.find((x) => x.id === id) : undefined;
  return a ? inboxName(a) : t('email.yourEmail');
}

export function jobTitle(job: JobRecord): string {
  return job.facts.title || (job.source === 'paste' ? t('popup.pasted') : t('ranked.notScored'));
}

export function jobSub(job: JobRecord): string {
  return [job.facts.company, job.facts.location].filter(Boolean).join(' · ');
}
