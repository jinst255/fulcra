// Filters shared by the ranked list and the radar, saved in settings so switching tabs keeps them.
// Job type hides other types. The must-haves (remote, relocating, languages, pay, hours) are the
// dealbreakers: jobs that miss one are set aside in "Filtered out", not hidden or deleted.
import { useState } from 'react';
import { isNotAJob } from '../core/rank';
import type { Dealbreakers, JobType } from '../core/types';
import { t } from '../i18n/t';
import { useApp } from './AppContext';
import { NumberField, PayUnitSelect, unitName } from './forms/AboutForm';
import { formatMoney, formatRate } from '../core/pay';
import { jobTypeName } from './format';

const ORDER: JobType[] = ['full_time', 'part_time', 'internship', 'seasonal', 'contract', 'unknown'];

function typeLabel(ty: JobType): string {
  return ty === 'unknown' ? t('filter.unknown') : jobTypeName(ty);
}

export function TypeFilter() {
  const { settings, jobs } = useApp();
  const picked = settings.ui.jobTypes;
  const counts = new Map<JobType, number>();
  for (const j of jobs)
    if (j.status !== 'closed' && !isNotAJob(j))
      counts.set(j.facts.job_type, (counts.get(j.facts.job_type) ?? 0) + 1);
  const shown = ORDER.filter((ty) => counts.has(ty) || picked.includes(ty));
  // One type alone isn't worth filtering.
  if (shown.length < 2 && !picked.length) return null;
  return <TypeChips shown={shown} picked={picked} counts={counts} />;
}

function TypeChips({
  shown,
  picked,
  counts,
}: {
  shown: JobType[];
  picked: JobType[];
  counts: Map<JobType, number>;
}) {
  const { update } = useApp();
  const set = (types: JobType[]) =>
    update((s) => void (s.ui.jobTypes = types.length === shown.length ? [] : types), { silent: true });
  const toggle = (ty: JobType) => {
    // From "All", a click shows only that type; after that, clicks add and remove types.
    if (!picked.length) return set([ty]);
    set(picked.includes(ty) ? picked.filter((x) => x !== ty) : [...picked, ty]);
  };
  return (
    <div role="group" aria-label={t('filter.label')} className="type-filter">
      <span className="small-note" style={{ marginRight: 2 }}>
        {t('filter.label')}
      </span>
      <button type="button" className="chip" aria-pressed={!picked.length} onClick={() => set([])}>
        {t('filter.all')}
      </button>
      {shown.map((ty) => (
        <button
          key={ty}
          type="button"
          className="chip"
          aria-pressed={picked.includes(ty)}
          onClick={() => toggle(ty)}
        >
          {typeLabel(ty)}
          <span className="chip-count">{counts.get(ty) ?? 0}</span>
        </button>
      ))}
    </div>
  );
}

/** Shown when the filter hides every job. */
export function FilteredOut() {
  const { settings, update } = useApp();
  const names = settings.ui.jobTypes.map((ty) => typeLabel(ty).toLowerCase()).join(', ');
  return (
    <div className="small-note" style={{ padding: '12px 8px', fontSize: 14 }}>
      {t('filter.none', { types: names })}{' '}
      <button
        type="button"
        className="link-btn"
        onClick={() => update((s) => void (s.ui.jobTypes = []), { silent: true })}
      >
        {t('filter.showAll')}
      </button>
    </div>
  );
}

type Toggle = 'mustRemote' | 'noRelocation' | 'languageGap';
const TOGGLES: { key: Toggle; label: Parameters<typeof t>[0] }[] = [
  { key: 'mustRemote', label: 'filter.remote' },
  { key: 'noRelocation', label: 'filter.noRelocation' },
  { key: 'languageGap', label: 'filter.languages' },
];

/** Job type plus the must-haves, with pay and hours behind More filters. */
export function FilterBar() {
  const { settings, update } = useApp();
  const d = settings.dealbreakers;
  const unit = settings.about.payUnit;
  const [more, setMore] = useState(false);
  const save = (fn: (x: Dealbreakers) => void) => update((s) => void fn(s.dealbreakers), { silent: true });
  const extra = (d.minTakeHome != null ? 1 : 0) + (d.maxHours != null ? 1 : 0);
  const payChip =
    d.minTakeHome != null
      ? t('filter.payChip', {
          amount: unit === 'hour' ? formatRate(d.minTakeHome) : formatMoney(d.minTakeHome),
          unit: unitName(unit, settings.about.windowWeeks),
        })
      : null;
  return (
    <div className="filter-bar">
      <TypeFilter />
      <div role="group" aria-label={t('filter.mustHave')} className="type-filter">
        <span className="small-note" style={{ marginRight: 2 }}>
          {t('filter.mustHave')}
        </span>
        {TOGGLES.map((x) => (
          <button
            key={x.key}
            type="button"
            className="chip"
            aria-pressed={d[x.key]}
            onClick={() => save((y) => void (y[x.key] = !y[x.key]))}
          >
            {t(x.label)}
          </button>
        ))}
        {payChip && (
          <button type="button" className="chip" aria-pressed="true" onClick={() => setMore(true)}>
            {payChip}
          </button>
        )}
        {d.maxHours != null && (
          <button type="button" className="chip" aria-pressed="true" onClick={() => setMore(true)}>
            {t('filter.hoursChip', { n: d.maxHours })}
          </button>
        )}
        <button
          type="button"
          className="link-btn"
          style={{ minHeight: 36, fontSize: 13 }}
          aria-expanded={more}
          aria-controls="more-filters"
          onClick={() => setMore(!more)}
        >
          {more ? t('filter.fewer') : extra ? t('filter.moreCount', { count: extra }) : t('filter.more')}
        </button>
      </div>
      {more && (
        <div id="more-filters" className="more-filters">
          <div>
            <label htmlFor="flt-min" className="field-label">
              {t('setup.deal.minPay')}
            </label>
            <div className="row-wrap" style={{ gap: 8 }}>
              <div className="money-input">
                <span aria-hidden="true">$</span>
                <NumberField
                  id="flt-min"
                  min={0}
                  step={unit === 'hour' ? 0.5 : 500}
                  value={d.minTakeHome}
                  onSave={(v) => save((x) => void (x.minTakeHome = v && v > 0 ? v : null))}
                />
              </div>
              <PayUnitSelect id="flt-min-unit" label={t('setup.deal.minPayUnit')} />
            </div>
          </div>
          <div>
            <label htmlFor="flt-hours" className="field-label">
              {t('setup.deal.maxHours')}
            </label>
            <NumberField
              id="flt-hours"
              width={120}
              min={0}
              max={100}
              value={d.maxHours}
              onSave={(v) => save((x) => void (x.maxHours = v && v > 0 ? v : null))}
            />
          </div>
          <p className="small-note" style={{ flexBasis: '100%', margin: 0 }}>
            {t('filter.note')}
          </p>
        </div>
      )}
    </div>
  );
}
