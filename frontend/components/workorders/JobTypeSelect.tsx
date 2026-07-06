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
import {
  jobTypesApi,
  isFastTrackJobType,
  jobTypeRequiresBundle,
  type JobType,
} from "@/lib/api/job-types";
import { JOB_TYPE_FIELD_LABEL } from "@/lib/workorders/job-type-labels";

export interface JobTypeSelectProps {
  value: string;
  onChange: (code: string, jobType: JobType | null) => void;
  id?: string;
  disabled?: boolean;
  showDescription?: boolean;
}

export function JobTypeSelect({
  value,
  onChange,
  id = "job-type-select",
  disabled = false,
  showDescription = true,
}: JobTypeSelectProps) {
  const { data: jobTypesData, isLoading } = useQuery({
    queryKey: ["workorders", "job-types"],
    queryFn: () => jobTypesApi.list({ active_only: true }),
  });

  const jobTypes = useMemo(() => jobTypesData?.results ?? [], [jobTypesData]);

  const selectedJobType = useMemo(
    () => jobTypes.find((jt) => jt.code === value) ?? null,
    [jobTypes, value]
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
      {showDescription && selectedJobType?.description ? (
        <p className="mt-2 text-xs text-muted-foreground">{selectedJobType.description}</p>
      ) : null}
    </div>
  );
}

export { isFastTrackJobType, jobTypeRequiresBundle };
