"use client";

import { Moon, Sun, Monitor, Archive, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme, type Theme } from "@/lib/hooks/useTheme";

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme, applyTheme, mounted } = useTheme();

  if (!mounted) {
    return (
      <Button variant="secondary" size="sm" className="w-9 h-9 p-0" disabled>
        <Sun className="h-4 w-4" />
      </Button>
    );
  }

  const cycleTheme = () => {
    const order: Theme[] = ["light", "dark", "system", "classic", "perfex"];
    const newTheme = order[(order.indexOf(theme) + 1) % order.length];
    // Apply immediately to DOM for instant visual feedback, then update state
    applyTheme(newTheme);
    setTheme(newTheme);
  };

  const icon =
    theme === "classic"
      ? <Archive className="h-4 w-4" />
      : theme === "perfex"
        ? <Layers className="h-4 w-4" />
        : theme === "system"
          ? <Monitor className="h-4 w-4" />
          : resolvedTheme === "dark"
            ? <Moon className="h-4 w-4" />
            : <Sun className="h-4 w-4" />;

  const title =
    theme === "light"
      ? "Light mode"
      : theme === "dark"
        ? "Dark mode"
        : theme === "classic"
          ? "Classic theme"
          : theme === "perfex"
            ? "Perfex theme"
            : "System theme";

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="w-9 h-9 p-0"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        cycleTheme();
      }}
      title={title}
      aria-label={title}
    >
      {icon}
    </Button>
  );
}
