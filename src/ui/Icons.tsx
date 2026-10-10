// Small inline icons from the approved demos.

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <line
        x1="3"
        y1="11.5"
        x2="25"
        y2="7"
        style={{ stroke: 'var(--teal)' }}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path d="M14 10.5L20 22H8Z" style={{ fill: 'var(--teal)' }} />
    </svg>
  );
}

export function Gear({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function Check({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3 8.5l3 3 7-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Red dashed circle with an X: the dealbreaker failure marker. */
export function DealbreakerMark({ size = 20, stroke = 2 }: { size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }}>
      <circle
        cx="12"
        cy="12"
        r="9"
        style={{ fill: 'var(--card)', stroke: 'var(--red)' }}
        strokeWidth={stroke}
        strokeDasharray="4 3"
      />
      <line x1="8" y1="8" x2="16" y2="16" style={{ stroke: 'var(--red)' }} strokeWidth={stroke} />
      <line x1="16" y1="8" x2="8" y2="16" style={{ stroke: 'var(--red)' }} strokeWidth={stroke} />
    </svg>
  );
}

export function Close({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function Alert() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" style={{ flex: 'none' }}>
      <circle cx="9" cy="9" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 5v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="9" cy="12.8" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function Refresh() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" style={{ flex: 'none' }}>
      <path
        d="M15 9a6 6 0 1 1-2-4.5M15 3v3.5h-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function KeyIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="18" cy="24" r="9" fill="none" style={{ stroke: 'var(--teal)' }} strokeWidth="2.5" />
      <path
        d="M27 24h16M37 24v6M42 24v4"
        fill="none"
        style={{ stroke: 'var(--teal)' }}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function External() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path
        d="M4.5 2H10v5.5M10 2L3 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Search() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      style={{ position: 'absolute', left: 12, top: 14 }}
    >
      <circle cx="7" cy="7" r="4.5" fill="none" style={{ stroke: 'var(--text-2)' }} strokeWidth="1.6" />
      <path
        d="M10.5 10.5L14 14"
        style={{ stroke: 'var(--text-2)' }}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Moon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    >
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
    </svg>
  );
}

export function Sun({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </svg>
  );
}
