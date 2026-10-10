// Dealbreakers. Setup step 4 and Settings > Dealbreakers.
import { t } from '../../i18n/t';
import { useApp } from '../AppContext';
import { SwitchRow } from '../components';
import { NumberField } from './AboutForm';

export function DealForm({ showNone = false }: { showNone?: boolean }) {
  const { settings, update } = useApp();
  const d = settings.dealbreakers;
  const save = (fn: (x: typeof d) => void) => update((s) => void fn(s.dealbreakers));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', gap: '16px 32px', flexWrap: 'wrap' }}>
        <div>
          <label htmlFor="db-min" className="field-label">
            {t('setup.deal.minPay')}
          </label>
          <div className="money-input">
            <span aria-hidden="true">$</span>
            <NumberField
              id="db-min"
              min={0}
              step={500}
              value={d.minTakeHome}
              onSave={(v) => save((x) => void (x.minTakeHome = v))}
            />
          </div>
        </div>
        <div>
          <label htmlFor="db-hours" className="field-label">
            {t('setup.deal.maxHours')}
          </label>
          <NumberField
            id="db-hours"
            width={140}
            min={0}
            max={100}
            value={d.maxHours}
            onSave={(v) => save((x) => void (x.maxHours = v))}
          />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--rule)' }}>
        <SwitchRow
          id="lbl-mustremote"
          label={t('setup.deal.mustRemote')}
          on={d.mustRemote}
          onToggle={() => save((x) => void (x.mustRemote = !x.mustRemote))}
        />
        <SwitchRow
          id="lbl-noreloc"
          label={t('setup.deal.noRelocation')}
          on={d.noRelocation}
          onToggle={() => save((x) => void (x.noRelocation = !x.noRelocation))}
        />
        <SwitchRow
          id="lbl-langgap"
          label={t('setup.deal.languageGap')}
          on={d.languageGap}
          onToggle={() => save((x) => void (x.languageGap = !x.languageGap))}
        />
      </div>
      {showNone && (
        <div>
          <button
            type="button"
            className="btn"
            onClick={() =>
              update((s) => {
                s.dealbreakers = {
                  minTakeHome: null,
                  maxHours: null,
                  mustRemote: false,
                  noRelocation: false,
                  languageGap: false,
                };
              })
            }
          >
            {t('setup.deal.none')}
          </button>
        </div>
      )}
    </div>
  );
}
