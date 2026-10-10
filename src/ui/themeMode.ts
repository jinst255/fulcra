// Light, dark, or follow the system. The choice lives in settings; a copy in localStorage
// lets each page pick the right colors before React loads, so there's no white flash.
import { useEffect } from 'react';
import type { Settings } from '../core/types';

export type ThemeChoice = Settings['ui']['theme'];
const CACHE = 'fulcra-theme';

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    localStorage.setItem(CACHE, choice);
  } catch {
    // Storage blocked: the page still follows settings once they load.
  }
}

/** Call first thing in each page's entry script. */
export function applyCachedTheme(): void {
  try {
    const c = localStorage.getItem(CACHE);
    if (c === 'light' || c === 'dark') document.documentElement.dataset.theme = c;
  } catch {
    // Ignore; settings apply it shortly.
  }
}

export function useTheme(choice: ThemeChoice | undefined): void {
  useEffect(() => {
    if (choice) applyTheme(choice);
  }, [choice]);
}

/** Whether the page is dark right now, given the choice and the system setting. */
export function isDark(choice: ThemeChoice): boolean {
  if (choice !== 'system') return choice === 'dark';
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}
