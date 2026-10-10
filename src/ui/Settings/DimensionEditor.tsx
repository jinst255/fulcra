// "What Fulcra scores": reorder, edit, remove, restore, and add dimensions. Blueprint section 11.3.
import { useState } from 'react';
import {
  addDimension,
  editDimension,
  MAX_DIMENSIONS,
  moveDimension,
  removeDimension,
  type DimensionDraft,
} from '../../core/dimensions';
import type { Dimension } from '../../core/types';
import { t } from '../../i18n/t';
import { useApp } from '../AppContext';
import { Swatch } from '../components';

function Arrow({ dir }: { dir: 'up' | 'down' }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d={dir === 'up' ? 'M8 13V3M4 7l4-4 4 4' : 'M8 3v10M4 9l4 4 4-4'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DraftEditor(props: {
  draft: DimensionDraft;
  setDraft: (d: DimensionDraft) => void;
  saveLabel: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { draft, setDraft } = props;
  const field = (k: keyof DimensionDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft({ ...draft, [k]: e.target.value });
  return (
    <div className="subtle-box" style={{ marginTop: 8 }}>
      <div>
        <label htmlFor="dim-name" className="field-label" style={{ marginBottom: 4 }}>
          {t('settings.dims.name')}
        </label>
        <input id="dim-name" type="text" className="input" value={draft.name} onChange={field('name')} />
      </div>
      <div>
        <label htmlFor="dim-def" className="field-label" style={{ marginBottom: 4 }}>
          {t('settings.dims.definition')}
        </label>
        <textarea
          id="dim-def"
          rows={2}
          className="textarea"
          value={draft.definition}
          onChange={field('definition')}
        />
      </div>
      <div className="row-wrap" style={{ gap: 10, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 200px' }}>
          <label htmlFor="dim-low" className="field-label" style={{ marginBottom: 4 }}>
            {t('settings.dims.low')}
          </label>
          <input
            id="dim-low"
            type="text"
            className="input"
            value={draft.anchorLow}
            onChange={field('anchorLow')}
          />
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <label htmlFor="dim-high" className="field-label" style={{ marginBottom: 4 }}>
            {t('settings.dims.high')}
          </label>
          <input
            id="dim-high"
            type="text"
            className="input"
            value={draft.anchorHigh}
            onChange={field('anchorHigh')}
          />
        </div>
      </div>
      <div className="row-wrap">
        <button
          type="button"
          className="btn primary"
          disabled={!draft.name.trim() || !draft.definition.trim()}
          onClick={props.onSave}
        >
          {props.saveLabel}
        </button>
        <button type="button" className="btn" onClick={props.onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}

const EMPTY: DimensionDraft = { name: '', definition: '', anchorLow: '', anchorHigh: '' };

export function DimensionEditor() {
  const { settings, update } = useApp();
  const [editing, setEditing] = useState<{ id: string | null; draft: DimensionDraft } | null>(null);
  const active = settings.dimensions.filter((d) => d.active);
  const removed = settings.dimensions.filter((d) => !d.active);
  const atMax = active.length >= MAX_DIMENSIONS;
  const set = (fn: (dims: Dimension[]) => Dimension[]) =>
    update((s) => void (s.dimensions = fn(s.dimensions)));

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        borderTop: '1px solid var(--rule)',
        paddingTop: 18,
      }}
    >
      <h2 style={{ fontSize: 16 }}>{t('settings.dims.title')}</h2>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {active.map((d, i) => (
          <div key={d.id} style={{ borderBottom: '1px solid var(--rule)', padding: '8px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px 10px', flexWrap: 'wrap' }}>
              <Swatch color={d.color} size={14} style={{ marginTop: 2 }} />
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{d.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.4 }}>
                  {d.computedByApp ? t('settings.dims.payNote') : d.definition}
                </div>
              </div>
              <div className="row-wrap" style={{ gap: 4 }}>
                <button
                  type="button"
                  className="btn icon"
                  aria-label={t('settings.dims.moveUp', { name: d.name })}
                  disabled={i === 0}
                  onClick={() => set((x) => moveDimension(x, d.id, -1))}
                >
                  <Arrow dir="up" />
                </button>
                <button
                  type="button"
                  className="btn icon"
                  aria-label={t('settings.dims.moveDown', { name: d.name })}
                  disabled={i === active.length - 1}
                  onClick={() => set((x) => moveDimension(x, d.id, 1))}
                >
                  <Arrow dir="down" />
                </button>
                {!d.computedByApp && (
                  <>
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        setEditing({
                          id: d.id,
                          draft: {
                            name: d.name,
                            definition: d.definition,
                            anchorLow: d.anchorLow,
                            anchorHigh: d.anchorHigh,
                          },
                        })
                      }
                    >
                      {t('settings.dims.edit')}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        if (editing?.id === d.id) setEditing(null);
                        set((x) => removeDimension(x, d.id));
                      }}
                    >
                      {t('settings.dims.remove')}
                    </button>
                  </>
                )}
              </div>
            </div>
            {editing?.id === d.id && (
              <DraftEditor
                draft={editing.draft}
                setDraft={(draft) => setEditing({ id: d.id, draft })}
                saveLabel={t('common.saveChanges')}
                onCancel={() => setEditing(null)}
                onSave={() => {
                  set((x) => editDimension(x, d.id, editing.draft));
                  setEditing(null);
                }}
              />
            )}
          </div>
        ))}
      </div>
      <div className="small-note">{t('settings.dims.removeNote')}</div>
      {removed.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{t('settings.dims.removed')}</span>
          {removed.map((d) => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Swatch color={d.color} size={12} />
              <span style={{ flex: 1, fontSize: 14, color: 'var(--text-2)' }}>{d.name}</span>
              <button
                type="button"
                className="btn"
                disabled={atMax}
                onClick={() => set((x) => addDimension(x, EMPTY, d.id))}
              >
                {t('settings.dims.restore')}
              </button>
            </div>
          ))}
        </div>
      )}
      {editing?.id === null && (
        <DraftEditor
          draft={editing.draft}
          setDraft={(draft) => setEditing({ id: null, draft })}
          saveLabel={t('settings.dims.add')}
          onCancel={() => setEditing(null)}
          onSave={() => {
            set((x) => addDimension(x, editing.draft));
            setEditing(null);
          }}
        />
      )}
      {!editing && !atMax && (
        <div>
          <button type="button" className="btn" onClick={() => setEditing({ id: null, draft: EMPTY })}>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            {t('settings.dims.add')}
          </button>
        </div>
      )}
      {atMax && <div className="note-amber">{t('settings.dims.max')}</div>}
    </div>
  );
}
