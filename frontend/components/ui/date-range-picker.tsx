"use client";

import { useId, useState } from "react";
import { Input } from "./input";
import { Label } from "./label";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  label?: string;
  className?: string;
  idPrefix?: string;
}

export function DateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  label = "Date Range",
  className = "",
  idPrefix,
}: DateRangePickerProps) {
  const generatedId = useId().replace(/:/g, "");
  const baseId = idPrefix || `date-range-${generatedId}`;
  const startId = `${baseId}-start`;
  const endId = `${baseId}-end`;
  const errorId = `${baseId}-error`;
  const [validationIssue, setValidationIssue] = useState<{
    message: string;
    startDate: string;
    endDate: string;
  } | null>(null);
  const validationError =
    validationIssue?.startDate === startDate && validationIssue.endDate === endDate
      ? validationIssue.message
      : "";

  const handleStartDateChange = (date: string) => {
    if (date && endDate && date > endDate) {
      setValidationIssue({
        message: "Start date must be on or before end date.",
        startDate,
        endDate,
      });
      return;
    }

    setValidationIssue(null);
    onStartDateChange(date);
  };

  const handleEndDateChange = (date: string) => {
    if (startDate && date && startDate > date) {
      setValidationIssue({
        message: "End date must be on or after start date.",
        startDate,
        endDate,
      });
      return;
    }

    setValidationIssue(null);
    onEndDateChange(date);
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {label && <div className="text-sm font-medium text-foreground">{label}</div>}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor={startId} className={cn(!label && "sr-only")}>
            Start date
          </Label>
          <div className="relative">
            <Calendar
              aria-hidden="true"
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4"
            />
            <Input
              id={startId}
              type="date"
              value={startDate}
              max={endDate || undefined}
              aria-invalid={Boolean(validationError)}
              aria-describedby={validationError ? errorId : undefined}
              onChange={(e) => handleStartDateChange(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <span className="self-center text-muted-foreground" aria-hidden="true">
          to
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor={endId} className={cn(!label && "sr-only")}>
            End date
          </Label>
          <div className="relative">
            <Calendar
              aria-hidden="true"
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4"
            />
            <Input
              id={endId}
              type="date"
              value={endDate}
              min={startDate || undefined}
              aria-invalid={Boolean(validationError)}
              aria-describedby={validationError ? errorId : undefined}
              onChange={(e) => handleEndDateChange(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </div>
      {validationError && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {validationError}
        </p>
      )}
    </div>
  );
}

