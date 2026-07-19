"use client";

import React, { useState } from "react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./dialog";
import { Input } from "./input";
import { Label } from "./label";
import { DateRangePicker } from "./date-range-picker";
import { X, Filter, Calendar, CheckCircle } from "lucide-react";
import { Badge } from "./badge";
import { cn } from "@/lib/utils/cn";
import {
  areFilterStatesEqual,
  normalizeFilterState,
  type FilterState,
} from "@/lib/utils/filter-state";

export interface FilterOption {
  key: string;
  label: string;
  type: "text" | "select" | "date" | "daterange" | "number";
  options?: { value: string; label: string }[];
  placeholder?: string;
  min?: number;
  max?: number;
}

export interface QuickFilter {
  label: string;
  value: string;
  /** Presets replace the complete committed filter state; they are not merged. */
  filters: FilterState;
}

export interface AdvancedFiltersProps {
  filters: FilterOption[];
  quickFilters?: QuickFilter[];

  activeFilters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  onClear: () => void;
  title?: string;
}

export function countActiveFilters(activeFilters: FilterState, filters: FilterOption[]): number {
  const normalized = normalizeFilterState(activeFilters);
  const consumedKeys = new Set<string>();
  let count = 0;

  for (const filter of filters) {
    if (filter.type === "daterange") {
      const fromKey = `${filter.key}_from`;
      const toKey = `${filter.key}_to`;
      consumedKeys.add(fromKey);
      consumedKeys.add(toKey);
      if (normalized[fromKey] !== undefined || normalized[toKey] !== undefined) count += 1;
    } else {
      consumedKeys.add(filter.key);
      if (normalized[filter.key] !== undefined) count += 1;
    }
  }

  return count + Object.keys(normalized).filter((key) => !consumedKeys.has(key)).length;
}

export function AdvancedFilters({
  filters,
  quickFilters = [],
  activeFilters,
  onFiltersChange,
  onClear,
  title = "Advanced Filters",
}: AdvancedFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localFilters, setLocalFilters] = useState<FilterState>(() =>
    normalizeFilterState(activeFilters)
  );
  const committedFilters = normalizeFilterState(activeFilters);
  const activeFilterCount = countActiveFilters(committedFilters, filters);

  const handleOpenChange = (open: boolean) => {
    if (open) setLocalFilters(normalizeFilterState(activeFilters));
    setIsOpen(open);
  };

  const handleFilterChange = (key: string, value: string | number) => {
    setLocalFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleApply = () => {
    onFiltersChange(normalizeFilterState(localFilters));
    setIsOpen(false);
  };

  const handleQuickFilter = (quickFilter: QuickFilter) => {
    const replacementFilters = normalizeFilterState(quickFilter.filters);
    setLocalFilters(replacementFilters);
    onFiltersChange(replacementFilters);
    setIsOpen(false);
  };

  const handleClear = () => {
    setLocalFilters({});
    onClear();
    setIsOpen(false);
  };

  const handleReset = () => {
    setLocalFilters(normalizeFilterState(activeFilters));
  };

  const handleRemoveFilter = (filter: FilterOption) => {
    const keys =
      filter.type === "daterange"
        ? [`${filter.key}_from`, `${filter.key}_to`]
        : [filter.key];
    const withoutFilter = { ...committedFilters };
    keys.forEach((key) => delete withoutFilter[key]);

    // Remove the same fields from the draft, but never commit its unrelated edits.
    setLocalFilters((draft) => {
      const nextDraft = { ...draft };
      keys.forEach((key) => delete nextDraft[key]);
      return nextDraft;
    });
    onFiltersChange(normalizeFilterState(withoutFilter));
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => handleOpenChange(true)}
        className="relative h-9 border-dashed shadow-sm"
      >
        <Filter className="w-3.5 h-3.5 mr-2" />
        Filters
        {activeFilterCount > 0 && (
          <Badge
            variant="secondary"
            className="ml-2 h-5 min-w-[1.25rem] rounded-full px-1 flex items-center justify-center text-[10px]"
          >
            {activeFilterCount}
          </Badge>
        )}
      </Button>

      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-2xl max-h-[calc(100vh-1.5rem)] sm:max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0">
          <DialogHeader className="border-b px-4 py-4 sm:px-6 bg-muted/50 bg-muted/50">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="text-lg font-semibold tracking-tight">{title}</DialogTitle>
              {/* Close handled by Dialog primitives usually, but custom button here is fine */}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-800">
            <div className="space-y-8">
              {/* Quick Filters */}
              {quickFilters.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quick Filters</Label>
                  <p className="text-xs text-muted-foreground">
                    Choosing a preset replaces all current filters.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {quickFilters.map((quickFilter) => {
                      const isSelected = areFilterStatesEqual(
                        committedFilters,
                        quickFilter.filters
                      );

                      return (
                        <Button
                          key={quickFilter.value}
                          variant={isSelected ? "secondary" : "outline"}
                          size="sm"
                          aria-pressed={isSelected}
                          onClick={() => handleQuickFilter(quickFilter)}
                          className="text-xs h-7 font-normal bg-transparent hover:bg-muted"
                        >
                          <Calendar className="w-3 h-3 mr-1.5 opacity-70" />
                          {quickFilter.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Filter Fields */}
              <div className="space-y-4">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filter Options</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  {filters.map((filter) => (
                    <div 
                      key={filter.key} 
                      className={cn(
                        "space-y-2.5",
                        (filter.type === "daterange" || filter.type === "text") && "md:col-span-2"
                      )}
                    >
                      <Label
                        htmlFor={filter.type === "daterange" ? undefined : filter.key}
                        className="text-sm font-medium text-foreground"
                      >
                        {filter.label}
                      </Label>
                      {filter.type === "text" && (
                        <Input
                          id={filter.key}
                          type="text"
                          placeholder={filter.placeholder || `Enter ${filter.label.toLowerCase()}`}
                          value={localFilters[filter.key] || ""}
                          onChange={(e) => handleFilterChange(filter.key, e.target.value)}
                          className="w-full h-9 text-sm"
                        />
                      )}
                      {filter.type === "select" && (
                        <select
                          id={filter.key}
                          value={localFilters[filter.key] || ""}
                          onChange={(e) => handleFilterChange(filter.key, e.target.value)}
                          className="flex h-9 w-full rounded-md border border-input bg-muted/30 px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <option value="">All {filter.label}</option>
                          {filter.options?.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      )}
                      {filter.type === "date" && (
                        <Input
                          id={filter.key}
                          type="date"
                          value={localFilters[filter.key] || ""}
                          onChange={(e) => handleFilterChange(filter.key, e.target.value)}
                          className="w-full h-9 text-sm"
                        />
                      )}
                      {filter.type === "daterange" && (
                        <div className="space-y-2">
                          <DateRangePicker
                            startDate={localFilters[`${filter.key}_from`] || ""}
                            endDate={localFilters[`${filter.key}_to`] || ""}
                            onStartDateChange={(date) => handleFilterChange(`${filter.key}_from`, date)}
                            onEndDateChange={(date) => handleFilterChange(`${filter.key}_to`, date)}
                            label=""
                            idPrefix={`${filter.key}-range`}
                            className="w-full"
                          />
                        </div>
                      )}
                      {filter.type === "number" && (
                        <Input
                          id={filter.key}
                          type="number"
                          min={filter.min}
                          max={filter.max}
                          placeholder={filter.placeholder || `Enter ${filter.label.toLowerCase()}`}
                          value={localFilters[filter.key] || ""}
                          onChange={(e) => handleFilterChange(filter.key, e.target.value)}
                          className="w-full h-9 text-sm"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Active Filters Display */}
              {activeFilterCount > 0 && (
                <div className="space-y-3 pt-4 border-t border-dashed">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Filters</Label>
                  <div className="flex flex-wrap gap-2">
                    {filters.map((filter) => {
                      let displayValue: string | null = null;

                      if (filter.type === "daterange") {
                        const from = committedFilters[`${filter.key}_from`];
                        const to = committedFilters[`${filter.key}_to`];
                        if (from !== undefined && to !== undefined) {
                          displayValue = `${from} - ${to}`;
                        } else if (from !== undefined) {
                          displayValue = `From ${from}`;
                        } else if (to !== undefined) {
                          displayValue = `Until ${to}`;
                        }
                      } else {
                        const value = committedFilters[filter.key];
                        if (value !== undefined) {
                          displayValue =
                            filter.type === "select"
                              ? filter.options?.find((option) => option.value === String(value))
                                  ?.label || String(value)
                              : String(value);
                        }
                      }

                      if (displayValue === null) return null;

                      return (
                        <Badge
                          key={filter.key}
                          variant="outline"
                          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-normal border-dashed"
                        >
                          <span className="font-medium text-muted-foreground">{filter.label}:</span>
                          <span>{displayValue}</span>
                          <button
                            onClick={() => handleRemoveFilter(filter)}
                            aria-label={`Remove ${filter.label} filter`}
                            className="ml-1 text-muted-foreground hover:text-destructive dark:hover:text-destructive transition-colors"
                            type="button"
                          >
                            <X aria-hidden="true" className="w-3 h-3" />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="border-t p-4 bg-muted/50 bg-muted/50 mt-0">
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" onClick={handleReset} type="button" className="text-muted-foreground hover:text-foreground">
                  Reset
                </Button>
                <Button variant="ghost" size="sm" onClick={handleClear} type="button" className="text-muted-foreground hover:text-destructive">
                  Clear All
                </Button>
              </div>
              <Button onClick={handleApply} type="button" size="sm" className="min-w-[100px]">
                <CheckCircle className="w-3.5 h-3.5 mr-2" />
                Apply Filters
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
