import { useCallback, useEffect, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
const STORAGE_KEY = 'beleggingen_theme';

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* localStorage kan geblokkeerd zijn: dan volgen we het apparaat */
  }
  return 'system';
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function isDark(pref: ThemePreference): boolean {
  return pref === 'dark' || (pref === 'system' && systemPrefersDark());
}

function applyTheme(pref: ThemePreference) {
  document.documentElement.dataset.theme = isDark(pref) ? 'dark' : 'light';
}

/**
 * Eén knop: licht <-> donker. Zonder keuze volgt de site je apparaat; zodra je
 * klikt onthoudt hij jouw keuze. Het inline script in index.html zet het
 * thema al vóór de eerste paint, zodat er geen witte flits is.
 */
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);
  const [dark, setDark] = useState<boolean>(() => isDark(readPreference()));

  useEffect(() => {
    applyTheme(preference);
    setDark(isDark(preference));
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      /* negeren */
    }
    if (preference !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      applyTheme('system');
      setDark(mq.matches);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference]);

  const toggle = useCallback(() => setPreference(dark ? 'light' : 'dark'), [dark]);

  return { dark, toggle };
}
