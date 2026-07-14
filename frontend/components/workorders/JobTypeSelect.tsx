"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import {
  jobTypesApi,
  isFastTrackJobType,
  jobTypeRequiresBundle,
  type JobType,
} from "@/lib/api/job-types";
import { JOB_TYPE_FIELD_LABEL } from "@/lib/workorders/job-type-labels";
import { cn } from "@/lib/utils/cn";

export interface JobTypeSelectProps {
  /** Primary job type code (drives workflow when single; first/primary when multi). */
  value: string;
  onChange: (code: string, jobType: JobType | null) => void;
  /** When set, enables multi-select of job types. */
  values?: string[];
  onChangeMultiple?: (codes: string[], jobTypes: JobType[]) => void;
  id?: string;
  disabled?: boolean;
  showDescription?: boolean;
  multiple?: boolean;
}

export function JobTypeSelect({
  value,
  onChange,
  values,
  onChangeMultiple,
  id = "job-type-select",
  disabled = false,
  showDescription = true,
  multiple = false,
}: JobTypeSelectProps) {
  const { data: jobTypesData, isLoading } = useQuery({
    queryKey: ["workorders", "job-types"],
    queryFn: () => jobTypesApi.list({ active_only: true }),
  });

  const jobTypes = useMemo(() => jobTypesData?.results ?? [], [jobTypesData]);

  const selectedCodes = useMemo(() => {
    if (multiple && values && values.length > 0) return values;
    return value ? [value] : [];
  }, [multiple, values, value]);

  const selectedJobTypes = useMemo(
    () => jobTypes.filter((jt) => selectedCodes.includes(jt.code)),
    [jobTypes, selectedCodes]
  );

  const primaryJobType = useMemo(
    () => jobTypes.find((jt) => jt.code === (selectedCodes[0] || value)) ?? null,
    [jobTypes, selectedCodes, value]
  );

  const jobTypesByCategory = useMemo(() => {
    const groups = new Map<string, JobType[]>();
    for (const jt of jobTypes) {
      const key = jt.category_display || jt.category;
      const list = groups.get(key) ?? [];
      list.push(jt);
      groups.set(key, list);
    }
    return Array.from(groups.entries());
  }, [jobTypes]);

  const emitMultiple = (codes: string[]) => {
    const unique = Array.from(new Set(codes.filter(Boolean)));
    const types = unique
      .map((code) => jobTypes.find((jt) => jt.code === code))
      .filter(Boolean) as JobType[];
    onChangeMultiple?.(unique, types);
    const primary = unique[0] || "";
    onChange(primary, types[0] ?? null);
  };

  const toggleCode = (code: string) => {
    if (!multiple) {
      onChange(code, jobTypes.find((jt) => jt.code === code) ?? null);
      return;
    }
    if (selectedCodes.includes(code)) {
      if (selectedCodes.length <= 1) return; // keep at least one
      emitMultiple(selectedCodes.filter((c) => c !== code));
    } else {
      emitMultiple([...selectedCodes, code]);
    }
  };

  const removeCode = (code: string) => {
    if (!multiple || selectedCodes.length <= 1) return;
    emitMultiple(selectedCodes.filter((c) => c !== code));
  };

  if (multiple) {
    return (
      <div>
        <Label htmlFor={id} className="sr-only">
          {JOB_TYPE_FIELD_LABEL}s
        </Label>
        {selectedJobTypes.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {selectedJobTypes.map((jt, idx) => (
              <Badge
                key={jt.code}
                variant={idx === 0 ? "default" : "secondary"}
                className="gap-1 pr-1"
              >
                {jt.name}
                {idx === 0 ? (
                  <span className="text-[10px] opacity-80">primary</span>
                ) : null}
                {selectedCodes.length > 1 ? (
                  <button
                    type="button"
                    className="rounded-sm p-0.5 hover:bg-background/20"
                    onClick={() => removeCode(jt.code)}
                    aria-label={`Remove ${jt.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </Badge>
            ))}
          </div>
        )}
        <div
          id={id}
          className={cn(
            "max-h-44 overflow-y-auto rounded-xl border border-border bg-muted/10 p-1.5",
            disabled || isLoading ? "pointer-events-none opacity-60" : ""
          )}
        >
          {jobTypesByCategory.map(([category, types]) => (
            <div key={category} className="mb-1 last:mb-0">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {category}
              </div>
              <div className="flex flex-col gap-0.5">
                {types.map((jt) => {
                  const checked = selectedCodes.includes(jt.code);
                  return (
                    <label
                      key={jt.code}
                      className={cn(
                        "flex w-full cursor-pointer items-start gap-2.5 rounded-lg border px-2 py-2 text-sm transition-colors hover:bg-muted/60",
                        checked
                          ? "border-primary/40 bg-primary/5"
                          : "border-transparent"
                      )}
                    >
                      <span className="flex h-5 shrink-0 items-center">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={checked}
                          disabled={disabled || isLoading}
                          onChange={() => toggleCode(jt.code)}
                        />
                      </span>
                      <span className="min-w-0 text-sm leading-5">
                        <span className="font-medium">{jt.name}</span>
                        {showDescription && jt.description ? (
                          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                            {jt.description}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Label htmlFor={id}>{JOB_TYPE_FIELD_LABEL}</Label>
      <Select
        value={value}
        onValueChange={(code) => onChange(code, jobTypes.find((jt) => jt.code === code) ?? null)}
        disabled={disabled || isLoading}
      >
        <SelectTrigger id={id} className="mt-2">
          <SelectValue placeholder={isLoading ? "Loading job types..." : "Select job type"} />
        </SelectTrigger>
        <SelectContent>
          {jobTypesByCategory.map(([category, types]) => (
            <div key={category}>
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{category}</div>
              {types.map((jt) => (
                <SelectItem key={jt.code} value={jt.code}>
                  {jt.name}
                </SelectItem>
              ))}
            </div>
          ))}
        </SelectContent>
      </Select>
      {showDescription && primaryJobType?.description ? (
        <p className="mt-2 text-xs text-muted-foreground">{primaryJobType.description}</p>
      ) : null}
    </div>
  );
}

export { isFastTrackJobType, jobTypeRequiresBundle };
