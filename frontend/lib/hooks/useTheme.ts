import { useState, useEffect, useCallback } from 'react';

export type Theme = 'light' | 'dark' | 'system' | 'classic' | 'perfex';

const VALID_THEMES: readonly Theme[] = ['light', 'dark', 'system', 'classic', 'perfex'];

let systemThemeMode: Theme | null = null;
const THEME_VERSION = 'v2-light-default';

export function setSystemThemeMode(theme: Theme | null) {
  systemThemeMode = theme;
}

export function useTheme() {
  // Default to light to avoid initial flash of dark mode
  const [theme, setTheme] = useState<Theme>('light');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark' | 'classic' | 'perfex'>('light');
  const [mounted, setMounted] = useState(false);

  const applyTheme = useCallback((value: Theme) => {
    if (typeof window === 'undefined') return;

    const root = document.documentElement;
    // Remove all theme classes first for a clean state
    root.classList.remove('dark', 'classic', 'perfex');

    if (value === 'classic') {
      root.classList.add('classic');
      setResolvedTheme('classic');
    } else if (value === 'perfex') {
      root.classList.add('perfex');
      setResolvedTheme('perfex');
    } else {
      const isSystem = value === 'system';
      const isDark = isSystem
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : value === 'dark';
      setResolvedTheme(isDark ? 'dark' : 'light');
      if (isDark) root.classList.add('dark');
    }
  }, []);

  // Initial load — system setting always takes priority over cached localStorage value
  useEffect(() => {
    // Force-reset any old cached theme so we can apply new default (light)
    const storedVersion = localStorage.getItem('theme_version');
    if (storedVersion !== THEME_VERSION) {
      localStorage.removeItem('theme');
      localStorage.setItem('theme_version', THEME_VERSION);
    }

    const rawStored = localStorage.getItem('theme');
    const stored: Theme | null = rawStored && (VALID_THEMES as readonly string[]).includes(rawStored)
      ? rawStored as Theme
      : null;

    // System setting wins. Fall back to localStorage, then light.
    const initial: Theme = systemThemeMode || stored || 'light';

    setTheme(initial);
    setMounted(true);
    applyTheme(initial);
  }, [applyTheme]);

  // Persist theme to localStorage whenever it changes after mount
  useEffect(() => {
    if (!mounted) return;
    applyTheme(theme);
    localStorage.setItem('theme', theme);
  }, [theme, mounted, applyTheme]);

  // Update if system OS preference changes (only relevant for 'system' theme)
  useEffect(() => {
    if (theme !== 'system' || !mounted) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handle = () => applyTheme('system');
    mq.addEventListener('change', handle);
    return () => mq.removeEventListener('change', handle);
  }, [theme, mounted, applyTheme]);

  // System theme_mode from Settings > Branding always overrides — no user escape hatch
  useEffect(() => {
    const handleSystemThemeChange = (e: CustomEvent) => {
      const newTheme = e.detail as Theme;
      setTheme(newTheme);
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
