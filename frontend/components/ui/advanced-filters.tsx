"use client";

import React, { useState, useEffect } from "react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./dialog";
import { Input } from "./input";
import { Label } from "./label";
import { DateRangePicker } from "./date-range-picker";
import { X, Filter, Calendar, CheckCircle } from "lucide-react";
import { Badge } from "./badge";
import { cn } from "@/lib/utils/cn";

export interface FilterOption {
  key: string;
  label: string;
  type: "text" | "select" | "date" | "daterange" | "number";
  options?: { value: string; label: string }[];
  placeholder?: string;
}

export interface QuickFilter {
  label: string;
  value: string;

  filters: Record<string, any>;
}

export interface AdvancedFiltersProps {
  filters: FilterOption[];
  quickFilters?: QuickFilter[];

  activeFilters: Record<string, any>;

  onFiltersChange: (filters: Record<string, any>) => void;
  onClear: () => void;
  title?: string;
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

  const [localFilters, setLocalFilters] = useState<Record<string, any>>(activeFilters);

  // Sync local filters when activeFilters change
  useEffect(() => {
    if (isOpen) {
      setLocalFilters(activeFilters);
    }
  }, [activeFilters, isOpen]);

  const activeFilterCount = Object.keys(activeFilters).filter(
    (key) => activeFilters[key] !== "" && activeFilters[key] !== null && activeFilters[key] !== undefined
  ).length;


  const handleFilterChange = (key: string, value: any) => {
    setLocalFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleApply = () => {
    onFiltersChange(localFilters);
    setIsOpen(false);
  };

  const handleQuickFilter = (quickFilter: QuickFilter) => {
    setLocalFilters(quickFilter.filters);
    onFiltersChange(quickFilter.filters);
    setIsOpen(false);
  };

  const handleClear = () => {
    setLocalFilters({});
    onClear();
    setIsOpen(false);
  };

  const handleReset = () => {
    setLocalFilters({});
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setIsOpen(true)}
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

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0">
          <DialogHeader className="border-b px-6 py-4 bg-muted/50 bg-muted/50">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-lg font-semibold tracking-tight">{title}</DialogTitle>
              {/* Close handled by Dialog primitives usually, but custom button here is fine */}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-800">
            <div className="space-y-8">
              {/* Quick Filters */}
              {quickFilters.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quick Filters</Label>
                  <div className="flex flex-wrap gap-2">
                    {quickFilters.map((quickFilter) => (
                      <Button
                        key={quickFilter.value}
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickFilter(quickFilter)}
                        className="text-xs h-7 font-normal bg-transparent hover:bg-muted hover:bg-muted"
                      >
                        <Calendar className="w-3 h-3 mr-1.5 opacity-70" />
                        {quickFilter.label}
                      </Button>
                    ))}
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
                      <Label htmlFor={filter.key} className="text-sm font-medium text-foreground">
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
                            className="w-full"
                          />
                        </div>
                      )}
                      {filter.type === "number" && (
                        <Input
                          id={filter.key}
                          type="number"
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
                    {Object.entries(activeFilters).map(([key, value]) => {
                      if (!value || value === "") return null;
                      const filter = filters.find((f) => f.key === key || f.key === `${key.replace("_from", "").replace("_to", "")}`);
                      if (!filter && !key.includes("_from") && !key.includes("_to")) return null;

                      // Skip _to entries as they're shown with _from
                      if (key.includes("_to")) return null;

                      const displayValue = key.includes("_from") && activeFilters[key.replace("_from", "_to")]
                        ? `${value} - ${activeFilters[key.replace("_from", "_to")]}`
                        : String(value);

                      const displayLabel = filter?.label || key.replace("_from", "").replace(/_/g, " ");

                      return (
                        <Badge
                          key={key}
                          variant="outline"
                          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-normal border-dashed"
                        >
                          <span className="font-medium text-muted-foreground">{displayLabel}:</span>
                          <span>{displayValue}</span>
                          <button
                            onClick={() => {
                              const newFilters = { ...localFilters };
                              if (key.includes("_from")) {
                                delete newFilters[key];
                                delete newFilters[key.replace("_from", "_to")];
                              } else {
                                delete newFilters[key];
                              }
                              setLocalFilters(newFilters);
                              onFiltersChange(newFilters);
                            }}
                            className="ml-1 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors"
                            type="button"
                          >
                            <X className="w-3 h-3" />
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
            <div className="flex justify-between w-full items-center">
              <div className="flex gap-2">
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

