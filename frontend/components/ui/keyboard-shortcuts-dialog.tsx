"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Keyboard } from "lucide-react";
import { commonShortcuts, type KeyboardShortcut } from "@/lib/hooks/useKeyboardShortcut";

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customShortcuts?: Array<{ key: string; ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean; description: string }>;
}

export function KeyboardShortcutsDialog({ 
  open, 
  onOpenChange,
  customShortcuts = []
}: KeyboardShortcutsDialogProps) {
  const allShortcuts: Array<KeyboardShortcut | { key: string; ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean; description: string }> = [...commonShortcuts, ...customShortcuts];

  const formatKey = (shortcut: { key: string; ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean }) => {
    const parts: string[] = [];
    if (shortcut.ctrl) parts.push('Ctrl');
    if (shortcut.meta) parts.push('Cmd');
    if (shortcut.shift) parts.push('Shift');
    if (shortcut.alt) parts.push('Alt');
    parts.push(shortcut.key.toUpperCase());
    return parts.join(' + ');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Keyboard className="w-5 h-5" />
            <span>Keyboard Shortcuts</span>
          </DialogTitle>
          <DialogDescription>
            Use these keyboard shortcuts to navigate and perform actions quickly
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Global Shortcuts</h3>
            <div className="space-y-2">
              {allShortcuts.map((shortcut, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted hover:bg-muted transition-colors"
                >
                  <span className="text-sm text-foreground">
                    {shortcut.description || 'Custom shortcut'}
                  </span>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {formatKey(shortcut)}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
          <div className="pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Tip: Press <kbd className="px-2 py-1 bg-muted rounded text-xs">?</kbd> to open this dialog
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

