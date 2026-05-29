import { useEffect, useRef } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  callback: () => void;
  description?: string;
}

export const commonShortcuts: Array<{ key: string; ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean; description: string }> = [
  { key: '?', description: 'Show keyboard shortcuts' },
  { key: 'k', ctrl: true, description: 'Open search' },
  { key: 'n', ctrl: true, description: 'New item (context dependent)' },
  { key: 's', ctrl: true, description: 'Save' },
  { key: 'Escape', description: 'Close dialog/modal' },
];

export function useKeyboardShortcut(
  shortcuts: KeyboardShortcut[],
  enabled: boolean = true
) {
  const shortcutsRef = useRef(shortcuts);

  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;

      const isEditable =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // Editable fields allow only ctrl/meta shortcuts
      if (isEditable && !event.ctrlKey && !event.metaKey) return;

      const pressedKey = event.key.toLowerCase();

      for (const shortcut of shortcutsRef.current) {
        const keyMatches = pressedKey === shortcut.key.toLowerCase();

        if (!keyMatches) continue;

        const ctrlMatch = shortcut.ctrl === undefined ? true : (event.ctrlKey || event.metaKey) === shortcut.ctrl;
        const shiftMatch = shortcut.shift === undefined ? true : event.shiftKey === shortcut.shift;
        const altMatch = shortcut.alt === undefined ? true : event.altKey === shortcut.alt;
        const metaMatch = shortcut.meta === undefined ? true : event.metaKey === shortcut.meta;

        if (ctrlMatch && shiftMatch && altMatch && metaMatch) {
          event.preventDefault();
          shortcut.callback();
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}
