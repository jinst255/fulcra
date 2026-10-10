// "What matters most": starting profile and one slider per dimension. Live reorder.
import type { PresetId } from '../core/presets';
import { PROFILE_ORDER } from '../core/presets';
import type { Dimension, ProfileId } from '../core/types';
import { t } from '../i18n/t';
import { pickProfile, setWeight } from './actions';
import { useApp } from './AppContext';
import { InfoTip, Swatch } from './components';
import { Pencil } from './Icons';

const HELP: Record<string, Parameters<typeof t>[0]> = {
  pay: 'dimHelp.pay',
  enjoyment: 'dimHelp.enjoyment',
  impact: 'dimHelp.impact',
  career: 'dimHelp.career',
  life: 'dimHelp.life',
  risk: 'dimHelp.risk',
  location: 'dimHelp.location',
};

/** What a dimension measures and what a high score means, in plain words. */
export function dimensionHelp(d: Dimension): string {
  const key = HELP[d.id];
  if (key) return t(key);
  const def = d.definition ? `${d.definition.replace(/\.$/, '')}.` : '';
  return d.anchorHigh ? `${def} ${t('dimHelp.customHigh', { high: d.anchorHigh })}`.trim() : def;
}

export function Sliders({ idPrefix, grid = false }: { idPrefix: string; grid?: boolean }) {
  const { settings, update, view } = useApp();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p className="small-note" style={{ margin: 0 }}>
        {t('weights.scale')}
      </p>
      <div
        style={
          grid
            ? {
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))',
                gap: '10px 24px',
              }
            : { display: 'flex', flexDirection: 'column', gap: 8 }
        }
      >
        {view.dims.map((d) => {
          const w = settings.weights[d.id] ?? 5;
          const id = `${idPrefix}-${d.id}`;
          return (
            <div
              key={d.id}
              className="slider-row"
              style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
            >
              <div className="slider-head">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                  <label htmlFor={id}>
                    <Swatch color={d.color} />
                    {d.name}
                  </label>
                  <InfoTip label={t('weights.about', { name: d.name })} text={dimensionHelp(d)} />
                </span>
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
                aria-valuetext={t('weights.valueText', { n: w, meaning: weightMeaning(w) })}
                onChange={(e) => setWeight(update, d.id, Number(e.target.value))}
              />
              <div className="slider-ends" aria-hidden="true">
                <span>{t('weights.low')}</span>
                <span>{t('weights.high')}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function weightMeaning(w: number): string {
  if (w === 0) return t('weights.low').toLowerCase();
  if (w >= 9) return t('weights.high').toLowerCase();
  return w >= 6 ? t('weights.more') : w <= 3 ? t('weights.less') : t('weights.some');
}

export function profileName(id: ProfileId): string {
  return t(`profile.${id}`);
}

export function WeightPanel() {
  const { settings, update, jobs, go } = useApp();
  return (
    <aside aria-label={t('weights.title')} className="card side-col">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 16 }}>{t('weights.title')}</h2>
          <div className="small-note" style={{ marginTop: 2 }}>
            {t('weights.hint')}
          </div>
        </div>
        <button
          type="button"
          className="btn small-btn"
          title={t('weights.editHint')}
          onClick={() => go('settings/priorities')}
        >
          <Pencil size={14} />
          {t('weights.edit')}
        </button>
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
