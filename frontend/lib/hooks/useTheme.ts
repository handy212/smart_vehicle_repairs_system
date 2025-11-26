import { useState, useEffect, useCallback } from 'react';

export type Theme = 'light' | 'dark' | 'system';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('system');
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

  // Initial load
  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme | null;
    const initial = stored || 'system';
    setTheme(initial);
    setMounted(true);
    applyTheme(initial);
  }, [applyTheme]);

  // Update DOM and storage when theme changes after mount
  useEffect(() => {
    if (!mounted) return;
    applyTheme(theme);
    localStorage.setItem('theme', theme);
  }, [theme, mounted, applyTheme]);

  // Update if system preferences change
  useEffect(() => {
    if (theme !== 'system' || !mounted) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handle = (e: MediaQueryListEvent) => applyTheme('system');
    mq.addEventListener('change', handle);
    return () => mq.removeEventListener('change', handle);
  }, [theme, mounted, applyTheme]);

  return {
    theme,
    resolvedTheme,
    setTheme,
    mounted,
  };
}
