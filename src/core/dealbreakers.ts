// Dealbreakers, evaluated only on extracted facts. Unknown facts never fail. Blueprint sections 5.3 and 9.2.
import type { Dealbreakers, Facts, Language } from './types';

export type FailReason = 'minPay' | 'maxHours' | 'remote' | 'relocation' | 'language';

/** Normalizes "Spanish (fluent)" or "spanish" to "spanish". */
export function languageName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .split(/[,;/-]/)[0]!
    .trim();
}

export function missingLanguages(required: string[], spoken: Language[]): string[] {
  const have = new Set(spoken.map((l) => languageName(l.name)));
  return required.filter((r) => {
    const n = languageName(r);
    return n !== '' && !have.has(n);
  });
}

export function evaluateDealbreakers(
  facts: Facts,
  takeHomeTotal: number | null,
  rules: Dealbreakers,
  spoken: Language[],
  flags: string[] = [],
): FailReason[] {
  const out: FailReason[] = [];
  if (rules.minTakeHome != null && takeHomeTotal != null && takeHomeTotal < rules.minTakeHome)
    out.push('minPay');
  if (rules.maxHours != null && facts.hours_per_week != null && facts.hours_per_week > rules.maxHours)
    out.push('maxHours');
  if (rules.mustRemote && facts.remote === 'no') out.push('remote');
  if (rules.noRelocation && facts.relocation_required === 'yes') out.push('relocation');
  if (
    rules.languageGap &&
    (missingLanguages(facts.languages_required, spoken).length > 0 || flags.includes('language_gap'))
  )
    out.push('language');
  return out;
}
