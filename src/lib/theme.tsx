import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { brand } from '@/config/brand';
import type { ThemePref } from './types';

type Pref = 'light' | 'dark' | 'system';
interface ThemeCtx {
  pref: Pref;
  resolved: 'light' | 'dark';
  setPref: (p: Pref) => void;
}
const Ctx = createContext<ThemeCtx | null>(null);

const read = (): Pref => {
  try {
    const v = localStorage.getItem(brand.themeStorageKey);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
};
const prefersDark = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;

export const toApiTheme = (p: Pref): ThemePref => p.toUpperCase() as ThemePref;
export const fromApiTheme = (p: ThemePref): Pref => p.toLowerCase() as Pref;

/** Local cache avoids a flash on load; the saved profile (synced by <ThemeSync/>) is the source of truth. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<Pref>(read);
  const [systemDark, setSystemDark] = useState(prefersDark);

  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const resolved = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  const setPref = useCallback((p: Pref) => {
    setPrefState(p);
    try {
      localStorage.setItem(brand.themeStorageKey, p);
    } catch {
      /* private mode: preference simply won't be cached */
    }
  }, []);

  const value = useMemo(() => ({ pref, resolved, setPref }), [pref, resolved, setPref]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme must be used inside <ThemeProvider>');
  return v;
}
