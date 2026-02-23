import { useState, useEffect, useCallback } from 'react';

export type Theme = 'light' | 'dark' | 'system';

let systemThemeMode: Theme | null = null;
const THEME_VERSION = 'v2-light-default';

export function setSystemThemeMode(theme: Theme | null) {
  systemThemeMode = theme;
}

export function useTheme() {
  // Default to light to avoid initial flash of dark mode
  const [theme, setTheme] = useState<Theme>('light');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  const applyTheme = useCallback((value: Theme) => {
    if (typeof window === 'undefined') return;

    const root = document.documentElement;
    const isSystem = value === 'system';
    const isDark = isSystem
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : value === 'dark';

    setResolvedTheme(isDark ? 'dark' : 'light');
    
    // Force remove first, then add if needed to ensure clean state
    root.classList.remove('dark');
    if (isDark) {
      root.classList.add('dark');
    }
    
  }, []);

  // Initial load - check system theme_mode setting first, then localStorage
  useEffect(() => {
    // Force-reset any old cached theme so we can apply new default (light)
    const storedVersion = localStorage.getItem('theme_version');
    if (storedVersion !== THEME_VERSION) {
      localStorage.removeItem('theme');
      localStorage.removeItem('theme_override');
      localStorage.setItem('theme_version', THEME_VERSION);
    }

    // If system theme_mode is set, use it (unless user has manually overridden)
    const userOverride = localStorage.getItem('theme_override');
    const stored = localStorage.getItem('theme') as Theme | null;
    
    let initial: Theme;
    if (userOverride === 'true' && stored) {
      // User has manually changed theme, respect their choice
      initial = stored;
    } else if (systemThemeMode) {
      // Use system setting
      initial = systemThemeMode as Theme;
      // Sync to localStorage
      localStorage.setItem('theme', initial);
    } else {
      // Default to light when nothing is set
      initial = stored || 'light';
    }
    
    setTheme(initial);
    setMounted(true);
    applyTheme(initial);
  }, [applyTheme]);

  // Update DOM and storage when theme changes after mount
  useEffect(() => {
    if (!mounted) return;
    applyTheme(theme);
    localStorage.setItem('theme', theme);
    // Mark that user has manually overridden theme
    localStorage.setItem('theme_override', 'true');
  }, [theme, mounted, applyTheme]);

  // Update if system preferences change
  useEffect(() => {
    if (theme !== 'system' || !mounted) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const handle = (e: MediaQueryListEvent) => applyTheme('system');
    mq.addEventListener('change', handle);
    return () => mq.removeEventListener('change', handle);
  }, [theme, mounted, applyTheme]);

  // Listen for system theme_mode changes from branding settings
  useEffect(() => {
    const handleSystemThemeChange = (e: CustomEvent) => {
      const newTheme = e.detail as Theme;
      // Only apply if user hasn't manually overridden
      const userOverride = localStorage.getItem('theme_override');
      if (userOverride !== 'true') {
        setTheme(newTheme);
        applyTheme(newTheme);
        localStorage.setItem('theme', newTheme);
      }
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
    mounted,
  };
}
