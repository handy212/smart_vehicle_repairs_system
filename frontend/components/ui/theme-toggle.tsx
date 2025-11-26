"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme, type Theme } from "@/lib/hooks/useTheme";

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme, mounted } = useTheme();

  if (!mounted) {
    return (
      <Button variant="outline" size="sm" className="w-9 h-9 p-0" disabled>
        <Sun className="h-4 w-4" />
      </Button>
    );
  }

  const cycleTheme = () => {
    // Immediately apply theme change to DOM for instant feedback
    const root = document.documentElement;
    let newTheme: Theme;

    if (theme === "light") {
      newTheme = "dark";
      root.classList.add("dark");
    } else if (theme === "dark") {
      newTheme = "system";
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList[isDark ? 'add' : 'remove']('dark');
    } else {
      newTheme = "light";
      root.classList.remove("dark");
    }

    // Update state (this will trigger useEffect in useTheme)
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);


  };

  const icon =
    theme === "system"
      ? <Monitor className="h-4 w-4" />
      : resolvedTheme === "dark"
        ? <Moon className="h-4 w-4" />
        : <Sun className="h-4 w-4" />;

  const title =
    theme === "light"
      ? "Light mode"
      : theme === "dark"
        ? "Dark mode"
        : "System theme";

  return (
    <Button
      type="button"
      variant="outline"
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
