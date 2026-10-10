// "What matters most": starting profile and one slider per dimension. Live reorder.
import type { PresetId } from '../core/presets';
import { PROFILE_ORDER } from '../core/presets';
import type { ProfileId } from '../core/types';
import { t } from '../i18n/t';
import { pickProfile, setWeight } from './actions';
import { useApp } from './AppContext';
import { Swatch } from './components';

export function Sliders({ idPrefix, grid = false }: { idPrefix: string; grid?: boolean }) {
  const { settings, update, view } = useApp();
  return (
    <div
      style={
        grid
          ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: '10px 24px' }
          : { display: 'flex', flexDirection: 'column', gap: 8 }
      }
    >
      {view.dims.map((d) => {
        const w = settings.weights[d.id] ?? 5;
        const id = `${idPrefix}-${d.id}`;
        return (
          <div key={d.id} className="slider-row" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div className="slider-head">
              <label htmlFor={id}>
                <Swatch color={d.color} />
                {d.name}
              </label>
              <span className="mono" style={{ fontSize: 12 }}>
                {w}
              </span>
            </div>
            <input
              id={id}
              type="range"
              min={0}
              max={10}
              step={1}
              value={w}
              onChange={(e) => setWeight(update, d.id, Number(e.target.value))}
            />
          </div>
        );
      })}
    </div>
  );
}

export function profileName(id: ProfileId): string {
  return t(`profile.${id}`);
}

export function WeightPanel() {
  const { settings, update, jobs } = useApp();
  return (
    <aside aria-label={t('weights.title')} className="card side-col">
      <div>
        <h2 style={{ fontSize: 16 }}>{t('weights.title')}</h2>
        <div className="small-note" style={{ marginTop: 2 }}>
          {t('weights.hint')}
        </div>
      </div>
      <div>
        <label htmlFor="rk-profile" className="small-note" style={{ display: 'block', marginBottom: 4 }}>
          {t('weights.profile')}
        </label>
        <select
          id="rk-profile"
          className="select"
          value={settings.profileId}
          onChange={(e) =>
            e.target.value !== 'custom' && pickProfile(update, jobs, e.target.value as PresetId)
          }
        >
          {PROFILE_ORDER.map((p) => (
            <option key={p} value={p} disabled={p === 'custom'}>
              {profileName(p)}
            </option>
          ))}
        </select>
      </div>
      <Sliders idPrefix="wa" />
      <div className="small-note">
        {t('weights.movement')} {t('weights.local')}
      </div>
    </aside>
  );
}
