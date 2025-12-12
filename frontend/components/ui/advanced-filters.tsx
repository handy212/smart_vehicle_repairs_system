"use client";

import React, { useState, useEffect } from "react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./dialog";
import { Input } from "./input";
import { Label } from "./label";
import { Select } from "./select";
import { DateRangePicker } from "./date-range-picker";
import { X, Filter, Calendar, CheckCircle } from "lucide-react";
import { Badge } from "./badge";

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
       variant="secondary"
        onClick={() => setIsOpen(true)}
        className="relative"
      >
        <Filter className="w-4 h-4 mr-2" />
        Filters
        {activeFilterCount > 0 && (
          <Badge
            variant="secondary"
            className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
          >
            {activeFilterCount}
          </Badge>
        )}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="border-b pb-4">
            <div className="flex items-center justify-between">
              <DialogTitle>{title}</DialogTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="h-6 w-6"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-6">
              {/* Quick Filters */}
              {quickFilters.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Quick Filters</Label>
                  <div className="flex flex-wrap gap-2">
                    {quickFilters.map((quickFilter) => (
                      <Button
                        key={quickFilter.value}
                       variant="secondary"
                        size="sm"
                        onClick={() => handleQuickFilter(quickFilter)}
                        className="text-xs h-8"
                      >
                        <Calendar className="w-3 h-3 mr-1.5" />
                        {quickFilter.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Filter Fields */}
              <div className="space-y-4">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Filter Options</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filters.map((filter) => (
                    <div key={filter.key} className="space-y-2">
                      <Label htmlFor={filter.key} className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {filter.label}
                      </Label>
                      {filter.type === "text" && (
                        <Input
                          id={filter.key}
                          type="text"
                          placeholder={filter.placeholder || `Enter ${filter.label.toLowerCase()}`}
                          value={localFilters[filter.key] || ""}
                          onChange={(e) => handleFilterChange(filter.key, e.target.value)}
                          className="w-full"
                        />
                      )}
                      {filter.type === "select" && (
                        <Select
                          id={filter.key}
                          value={localFilters[filter.key] || ""}
                          onChange={(e) => handleFilterChange(filter.key, e.target.value)}
                          className="w-full"
                        >
                          <option value="">All {filter.label}</option>
                          {filter.options?.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      )}
                      {filter.type === "date" && (
                        <Input
                          id={filter.key}
                          type="date"
                          value={localFilters[filter.key] || ""}
                          onChange={(e) => handleFilterChange(filter.key, e.target.value)}
                          className="w-full"
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
                          className="w-full"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Active Filters Display */}
              {activeFilterCount > 0 && (
                <div className="space-y-3 pt-2 border-t">
                  <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Active Filters</Label>
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
                          variant="secondary"
                          className="flex items-center gap-1.5 px-2.5 py-1"
                        >
                          <span className="text-xs">{displayLabel}: {displayValue}</span>
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
                            className="ml-1 hover:text-red-600 dark:hover:text-red-400 transition-colors"
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

          <DialogFooter className="border-t pt-4 mt-4">
            <div className="flex justify-between w-full">
              <div className="flex gap-2">
                <Buttonvariant="secondary" onClick={handleReset} type="button">
                  Reset
                </Button>
                <Buttonvariant="secondary" onClick={handleClear} type="button">
                  Clear All
                </Button>
              </div>
              <Button onClick={handleApply} type="button">
                <CheckCircle className="w-4 h-4 mr-2" />
                Apply Filters
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

