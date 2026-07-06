import { useState, useEffect, useCallback } from 'react';

export type Theme = 'perfex' | 'perfex-dark' | 'system';

const PERFEX_DARK_ALIASES = new Set(['dark', 'perfex-dark']);
const PERFEX_SYSTEM_ALIASES = new Set(['auto', 'system']);

let systemThemeMode: Theme | null = null;
const THEME_VERSION = 'v3-perfex-only';

function normalizeTheme(value: string | null | undefined): Theme {
  if (value && PERFEX_DARK_ALIASES.has(value)) return 'perfex-dark';
  if (value && PERFEX_SYSTEM_ALIASES.has(value)) return 'system';
  return 'perfex';
}

export function setSystemThemeMode(theme: Theme | null) {
  systemThemeMode = theme;
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('perfex');
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'perfex'>('perfex');
  const [mounted, setMounted] = useState(false);

  const applyTheme = useCallback((value: Theme) => {
    if (typeof window === 'undefined') return;

    const resolved = value === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'perfex-dark' : 'perfex')
      : value;
    const root = document.documentElement;
    root.classList.remove('dark', 'classic', 'perfex');

    if (resolved === 'perfex-dark') {
      root.classList.add('perfex', 'dark');
      setResolvedTheme('dark');
    } else {
      root.classList.add('perfex');
      setResolvedTheme('perfex');
    }
  }, []);

  const setTheme = useCallback((value: Theme) => {
    const normalized = normalizeTheme(value);
    setThemeState(normalized);
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', normalized);
      localStorage.setItem('theme_override', 'true');
    }
    applyTheme(normalized);
  }, [applyTheme]);

  // Initial load: local header override wins, otherwise use the branding default.
  useEffect(() => {
    // Force-reset old cached themes so legacy light/dark/classic values collapse to Perfex.
    const storedVersion = localStorage.getItem('theme_version');
    if (storedVersion !== THEME_VERSION) {
      localStorage.setItem('theme_version', THEME_VERSION);
    }

    const stored = normalizeTheme(localStorage.getItem('theme'));
    const hasOverride = localStorage.getItem('theme_override') === 'true';

    // A header choice wins locally. Otherwise system branding setting wins.
    const initial: Theme = hasOverride ? stored : (systemThemeMode || stored);

    setThemeState(initial);
    setMounted(true);
    applyTheme(initial);
  }, [applyTheme]);

  // Persist theme to localStorage whenever it changes after mount
  useEffect(() => {
    if (!mounted) return;
    applyTheme(theme);
    localStorage.setItem('theme', theme);
  }, [theme, mounted, applyTheme]);

  useEffect(() => {
    if (theme !== 'system' || !mounted) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handle = () => applyTheme('system');
    mq.addEventListener('change', handle);
    return () => mq.removeEventListener('change', handle);
  }, [theme, mounted, applyTheme]);

  // Branding theme_mode applies when the user has not chosen a local header override.
  useEffect(() => {
    const handleSystemThemeChange = (e: CustomEvent) => {
      const newTheme = normalizeTheme(e.detail);
      setThemeState(newTheme);
      applyTheme(newTheme);
      localStorage.setItem('theme', newTheme);
    };

    window.addEventListener('systemThemeModeChanged', handleSystemThemeChange as EventListener);
    return () => {
      window.removeEventListener('systemThemeModeChanged', handleSystemThemeChange as EventListener);
    };
  }, [applyTheme]);

  return {
    theme,
    resolvedTheme,
    setTheme,
    applyTheme,
    mounted,
  };
}
