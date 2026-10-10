// "What matters most": profile cards, sliders, and "Describe it in your own words".
// Setup step 3 and Settings > Priorities. Nothing changes without approval.
import { useState } from 'react';
import { addDimension } from '../../core/dimensions';
import { PROFILE_ORDER, type PresetId } from '../../core/presets';
import { t } from '../../i18n/t';
import { openai } from '../../llm/openai';
import type { Suggestions } from '../../llm/provider';
import { addLog } from '../../store/log';
import { getApiKey } from '../../store/settings';
import { pickProfile, setWeight } from '../actions';
import { useApp } from '../AppContext';
import { Spinner } from '../components';
import { Sliders } from '../WeightPanel';

type Item =
  | {
      id: string;
      kind: 'weight';
      dimId: string;
      from: number;
      to: number;
      status: null | 'approved' | 'declined';
    }
  | {
      id: string;
      kind: 'dim';
      dim: Suggestions['newDimensions'][number];
      status: null | 'approved' | 'declined';
    };

export function PriorityForm() {
  const { settings, update, jobs, key, view } = useApp();
  const [describe, setDescribe] = useState('');
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);

  const suggest = async () => {
    setBusy(true);
    setError(null);
    setItems([]);
    try {
      const k = await getApiKey();
      if (!k) {
        setError(t('err.keyMissing'));
        return;
      }
      const r = await openai.suggestPriorities(k, settings.model, {
        text: describe,
        dims: settings.dimensions,
        weights: settings.weights,
      });
      await addLog('SUGGEST_OK', 'app');
      setItems([
        ...r.weightChanges.map((w, i): Item => ({
          id: `w${i}`,
          kind: 'weight',
          dimId: w.dimensionId,
          from: settings.weights[w.dimensionId] ?? 5,
          to: w.to,
          status: null,
        })),
        ...r.newDimensions.map((d, i): Item => ({ id: `d${i}`, kind: 'dim', dim: d, status: null })),
      ]);
    } catch (e) {
      const code = (e as { code?: string }).code ?? 'UNKNOWN';
      await addLog(code, 'app', 'suggest');
      setError(
        code === 'NO_CREDIT'
          ? t('err.noCredit')
          : code === 'KEY_INVALID'
            ? t('err.keyInvalid')
            : code === 'OFFLINE'
              ? t('err.offline')
              : t('err.unknown'),
      );
    } finally {
      setBusy(false);
    }
  };

  const decide = (it: Item, approve: boolean) => {
    setItems((xs) =>
      xs.map((x) => (x.id === it.id ? { ...x, status: approve ? 'approved' : 'declined' } : x)),
    );
    if (!approve) return;
    if (it.kind === 'weight') setWeight(update, it.dimId, it.to);
    else
      update((s) => {
        s.dimensions = addDimension(s.dimensions, it.dim);
      });
  };

  const nameOf = (id: string) => view.dims.find((d) => d.id === id)?.name ?? id;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div
        role="group"
        aria-label={t('weights.profile')}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 8 }}
      >
        {PROFILE_ORDER.map((p) => {
          const on = settings.profileId === p;
          return (
            <button
              key={p}
              type="button"
              className="choice-card"
              aria-pressed={on}
              disabled={p === 'custom'}
              style={p === 'custom' && !on ? { opacity: 0.6 } : undefined}
              onClick={() => p !== 'custom' && pickProfile(update, jobs, p as PresetId)}
            >
              <span style={{ display: 'block', fontSize: 14, fontWeight: 500 }}>{t(`profile.${p}`)}</span>
              <span
                style={{
                  display: 'block',
                  fontSize: 12,
                  color: 'var(--text-2)',
                  marginTop: 3,
                  lineHeight: 1.35,
                }}
              >
                {t(`profile.${p}.desc`)}
              </span>
            </button>
          );
        })}
      </div>
      <Sliders idPrefix="wb" grid />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          borderTop: '1px solid var(--rule)',
          paddingTop: 16,
        }}
      >
        <label htmlFor="pr-desc" className="field-label" style={{ marginBottom: 0 }}>
          {t('setup.priorities.describe')}
        </label>
        <textarea
          id="pr-desc"
          rows={2}
          className="textarea"
          value={describe}
          onChange={(e) => setDescribe(e.target.value)}
        />
        <div className="small-note">{t('setup.priorities.describeHint')}</div>
        <div>
          <button
            type="button"
            className="btn"
            disabled={busy || !describe.trim() || !key.hasKey}
            onClick={() => void suggest()}
          >
            {busy && <Spinner />}
            {busy ? t('setup.priorities.suggesting') : t('setup.priorities.describeButton')}
          </button>
        </div>
        {error && (
          <div role="status" className="note-red">
            {error}
          </div>
        )}
        {items.map((it) => (
          <div
            key={it.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px 12px',
              flexWrap: 'wrap',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '8px 8px 8px 14px',
            }}
          >
            <span style={{ flex: '1 1 240px', fontSize: 14 }}>
              {it.kind === 'weight'
                ? t(it.to >= it.from ? 'setup.priorities.suggestWeight' : 'setup.priorities.suggestLower', {
                    dimension: nameOf(it.dimId),
                    from: it.from,
                    to: it.to,
                  })
                : t('setup.priorities.suggestDimension', {
                    name: it.dim.name,
                    definition: it.dim.definition,
                  })}
            </span>
            {it.status == null ? (
              <div className="row-wrap">
                <button type="button" className="btn primary" onClick={() => decide(it, true)}>
                  {t('setup.priorities.approve')}
                </button>
                <button type="button" className="btn" onClick={() => decide(it, false)}>
                  {t('setup.priorities.decline')}
                </button>
              </div>
            ) : (
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  padding: '0 8px',
                  color: it.status === 'approved' ? 'var(--teal-dark)' : 'var(--text-2)',
                }}
              >
                {it.status === 'approved' ? t('setup.priorities.approved') : t('setup.priorities.declined')}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
