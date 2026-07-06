"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme, type Theme } from "@/lib/hooks/useTheme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme, mounted } = useTheme();

  if (!mounted) {
    return (
      <Button variant="secondary" size="sm" className="w-9 h-9 p-0" disabled>
        <Sun className="h-4 w-4" />
      </Button>
    );
  }

  const options: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
    { value: "perfex", label: "Light", icon: Sun },
    { value: "perfex-dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];

  const TriggerIcon = theme === "system"
    ? Monitor
    : resolvedTheme === "dark"
      ? Moon
      : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Theme"
          aria-label="Theme"
        >
          <TriggerIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {options.map((option) => {
          const Icon = option.icon;
          const selected = theme === option.value;

          return (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => setTheme(option.value)}
              className="cursor-pointer"
            >
              <Icon className="mr-2 h-4 w-4" />
              <span className="flex-1">{option.label}</span>
              {selected && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
