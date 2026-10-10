// Display helpers shared by the popup and the app.
import type { FailReason } from '../core/dealbreakers';
import { approxAmount, formatMoney } from '../core/pay';
import type { JobRecord, JobType, PayPeriod } from '../core/types';
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

/** "About $13,300 before tax over 15 weeks (estimate)." without the period. */
export function payLine(total: number | null, weeks: number, estimate: boolean): string {
  if (total == null) return t('ranked.notScored');
  const line = t('detail.payLine', { amount: formatMoney(approxAmount(total)), weeks });
  return estimate ? `${line} ${t('common.estimateParen')}` : line;
}

/** The pay dimension's reason line: "About $13,300 before tax over 15 weeks." */
export function payReason(take: { total: number | null; weeks: number; estimate: boolean }): string {
  if (take.total == null) return t('ranked.notScored');
  return payLine(take.total, take.weeks, take.estimate) + '.';
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

export function jobTitle(job: JobRecord): string {
  return job.facts.title || (job.source === 'paste' ? t('popup.pasted') : t('ranked.notScored'));
}

export function jobSub(job: JobRecord): string {
  return [job.facts.company, job.facts.location].filter(Boolean).join(' · ');
}
