// Job type filter shared by the ranked list and the radar: show only internships, say.
// Saved in settings, so switching tabs keeps it.
import { isNotAJob } from '../core/rank';
import type { JobType } from '../core/types';
import { t } from '../i18n/t';
import { useApp } from './AppContext';
import { jobTypeName } from './format';

const ORDER: JobType[] = ['full_time', 'part_time', 'internship', 'seasonal', 'contract', 'unknown'];

function typeLabel(ty: JobType): string {
  return ty === 'unknown' ? t('filter.unknown') : jobTypeName(ty);
}

export function TypeFilter() {
  const { settings, update, jobs } = useApp();
  const picked = settings.ui.jobTypes;
  const counts = new Map<JobType, number>();
  for (const j of jobs)
    if (j.status !== 'closed' && !isNotAJob(j))
      counts.set(j.facts.job_type, (counts.get(j.facts.job_type) ?? 0) + 1);
  const shown = ORDER.filter((ty) => counts.has(ty) || picked.includes(ty));
  // One type alone isn't worth filtering.
  if (shown.length < 2 && !picked.length) return null;
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
