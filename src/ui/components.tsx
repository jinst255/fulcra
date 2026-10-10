// Shared controls: switch, tags, toast, confirm dialog. Blueprint section 14 (Banner, Switch,
// DealbreakerMark, Toast, Dialog), matched to the approved demos.
import { useEffect, useRef, type ReactNode } from 'react';
import { t } from '../i18n/t';

export function Switch(props: { on: boolean; onToggle: () => void; labelledBy?: string; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={props.on}
      aria-labelledby={props.labelledBy}
      aria-label={props.label}
      onClick={props.onToggle}
    >
      <span className="track">
        <span className="knob" />
      </span>
    </button>
  );
}

export function SwitchRow(props: {
  id: string;
  label: string;
  hint?: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="switch-row">
      <span id={props.id} className="label">
        {props.label}
        {props.hint && <span className="hint">{props.hint}</span>}
      </span>
      <Switch on={props.on} onToggle={props.onToggle} labelledBy={props.id} />
    </div>
  );
}

export type TagKind = 'amber' | 'gray' | 'teal' | 'red';
export function Tag({ kind, children }: { kind: TagKind; children: ReactNode }) {
  return <span className={`tag ${kind}`}>{children}</span>;
}

export function Spinner({ large = false }: { large?: boolean }) {
  return <span aria-hidden="true" className={large ? 'spinner lg' : 'spinner'} />;
}

export function Swatch({
  color,
  size = 10,
  style,
}: {
  color: string;
  size?: number;
  style?: React.CSSProperties;
}) {
  return <span className="swatch" style={{ width: size, height: size, background: color, ...style }} />;
}

export function Segmented<T extends string>(props: {
  options: [T, string][];
  value: T;
  onChange: (v: T) => void;
  extraClass?: string;
}) {
  return (
    <div className="row-wrap">
      {props.options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          className={`seg ${props.extraClass ?? ''}`}
          aria-pressed={props.value === v}
          onClick={() => props.onChange(v)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Toast({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  return (
    <div role="status" className="toast">
      <span>{text}</span>
      {action && (
        <button type="button" className="btn" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

export function ConfirmDialog(props: {
  text: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);
  return (
    <div className="dialog-backdrop">
      <div role="alertdialog" aria-modal="true" aria-labelledby="dlg-text" className="dialog">
        <p id="dlg-text">{props.text}</p>
        <div className="actions">
          <button ref={cancelRef} type="button" className="btn" onClick={props.onCancel}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn danger-solid" onClick={props.onConfirm}>
            {props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
