// One-time card suggesting a weight change after repeated overrides. Blueprint section 12.6.
import { LEARN_STEP } from '../core/learning';
import { lowerFirst } from '../core/standouts';
import { t } from '../i18n/t';
import { setWeight, suppressLearning } from './actions';
import { useApp } from './AppContext';

export interface Learn {
  dimId: string;
  dir: 'up' | 'down';
}

export function LearnCard({ learn, onDone }: { learn: Learn; onDone: () => void }) {
  const { settings, update, view } = useApp();
  const dim = view.dims.find((d) => d.id === learn.dimId);
  if (!dim) return null;
  const w = settings.weights[dim.id] ?? 5;
  const text =
    learn.dir === 'up'
      ? t('learn.card', { dimension: dim.name })
      : t('learn.cardLower', { dimension: dim.name });
  return (
    <div
      role="status"
      style={{
        background: 'var(--teal-light)',
        border: '1px solid var(--teal-line)',
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        alignItems: 'center',
        gap: '12px 16px',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: '1 1 280px', fontSize: 14, color: 'var(--teal-dark)' }}>{text}</div>
      <div className="row-wrap">
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            setWeight(update, dim.id, w + (learn.dir === 'up' ? LEARN_STEP : -LEARN_STEP));
            suppressLearning(update, dim.id);
            onDone();
          }}
        >
          {t('learn.yes', { dimension: lowerFirst(dim.name), n: LEARN_STEP })}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            suppressLearning(update, dim.id);
            onDone();
          }}
        >
          {t('learn.no')}
        </button>
      </div>
    </div>
  );
}
