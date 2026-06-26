"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils/cn";

export interface QboSearchableOption {
  value: string;
  label: string;
  searchText: string;
  disabled?: boolean;
  hint?: string;
}

interface QboSearchableSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: QboSearchableOption[];
  placeholder?: string;
  className?: string;
  emptyMessage?: string;
}

export function QboSearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  className,
  emptyMessage = "No matches found.",
}: QboSearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = options.find((option) => option.value === value);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return options;
    }
    return options.filter((option) => option.searchText.includes(term));
  }, [options, search]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setSearch("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-8 w-full justify-between font-normal text-left text-xs bg-card", className)}
        >
          <span className="truncate">{selected?.label || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          <Input
            className="h-9 border-none bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
            placeholder="Search by number, name, or type…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="max-h-[280px] overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">{emptyMessage}</div>
          ) : (
            filtered.map((option) => {
              const isSelected = value === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={option.disabled}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left text-xs hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50",
                    isSelected && "bg-accent/60",
                  )}
                  onClick={() => {
                    if (option.disabled) {
                      return;
                    }
                    onValueChange(option.value);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <Check className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{option.label}</span>
                    {option.hint ? (
                      <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{option.hint}</span>
                    ) : null}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
