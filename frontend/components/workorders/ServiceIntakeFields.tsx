"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, HeartPulse, Package, PlusCircle } from "lucide-react";
import { JobTypeSelect } from "@/components/workorders/JobTypeSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { inventoryApi, type ServiceBundle } from "@/lib/api/inventory";
import {
  isFastTrackJobType,
  jobTypeRequiresBundle,
  type JobType,
} from "@/lib/api/job-types";
import {
  SERVICE_PACKAGE_LABEL,
  SERVICE_PACKAGE_PLACEHOLDER,
} from "@/lib/workorders/job-type-labels";
import { getCommonConcernsForCategories } from "@/lib/constants/common-concerns";
import { cn } from "@/lib/utils";

export type SmartSuggestion = {
  id: number;
  service_type_id: number;
  service_type_name: string;
  is_due: boolean;
  is_due_soon: boolean;
  estimated_due_date: string | null;
  days_until_due: number | null;
};

export type SuggestedServiceInfo = {
  suggested_service_id: number;
  suggested_service_name: string;
  suggested_bundle_id?: number | null;
  last_service_id?: number;
  last_service_name?: string | null;
  last_service_date?: string | null;
  smart_suggestions?: SmartSuggestion[];
};

export type ServiceIntakePriority = "low" | "normal" | "high" | "urgent";

export interface ServiceIntakeFieldsProps {
  idPrefix?: string;
  jobTypeCode: string;
  jobTypeCodes: string[];
  onJobTypeChange: (code: string, jobType: JobType | null) => void;
  onJobTypesChange: (codes: string[], types: JobType[]) => void;
  primaryJobType: JobType | null;
  selectedJobTypes: JobType[];
  bundles: ServiceBundle[];
  serviceBundleId?: number | null;
  onServiceBundleChange: (bundleId: number, bundle: ServiceBundle) => void;
  suggestedService?: SuggestedServiceInfo | null;
  progressionWarning?: string | null;
  bundleError?: string;
  selectedConcerns: string[];
  onToggleConcern: (concern: string) => void;
  customConcerns: string;
  onCustomConcernsChange: (value: string) => void;
  /** Merged concerns preview (selected + custom). */
  concernsPreview?: string;
  concernsError?: string;
  concernsFooter?: React.ReactNode;
  odometer: string;
  onOdometerChange: (value: string) => void;
  odometerError?: string;
  showOdometer?: boolean;
  priority: ServiceIntakePriority;
  onPriorityChange: (value: ServiceIntakePriority) => void;
  className?: string;
}

function SectionLabel({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {children}
      </p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function ServiceIntakeFields({
  idPrefix = "service-intake",
  jobTypeCode,
  jobTypeCodes,
  onJobTypeChange,
  onJobTypesChange,
  primaryJobType,
  selectedJobTypes,
  bundles,
  serviceBundleId,
  onServiceBundleChange,
  suggestedService = null,
  progressionWarning = null,
  bundleError,
  selectedConcerns,
  onToggleConcern,
  customConcerns,
  onCustomConcernsChange,
  concernsPreview,
  concernsError,
  concernsFooter,
  odometer,
  onOdometerChange,
  odometerError,
  showOdometer = true,
  priority,
  onPriorityChange,
  className,
}: ServiceIntakeFieldsProps) {
  const isFastTrack = isFastTrackJobType(primaryJobType);
  const bundleRequired = jobTypeRequiresBundle(primaryJobType);

  const filteredCommonConcerns = useMemo(
    () =>
      getCommonConcernsForCategories(
        selectedJobTypes.length > 0
          ? selectedJobTypes.map((jt) => jt.category)
          : primaryJobType
            ? [primaryJobType.category]
            : []
      ),
    [selectedJobTypes, primaryJobType]
  );

  const selectedBundle = useMemo(
    () => bundles.find((b) => b.id === serviceBundleId) ?? null,
    [bundles, serviceBundleId]
  );

  const { data: bundleDetail } = useQuery({
    queryKey: ["inventory", "bundle", serviceBundleId],
    queryFn: () => inventoryApi.getBundle(serviceBundleId!),
    enabled: bundleRequired && !!serviceBundleId,
  });

  const bundleItems = bundleDetail?.items ?? selectedBundle?.items ?? [];
  const smartSuggestions = suggestedService?.smart_suggestions ?? [];
  const previewLines = (concernsPreview || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className={cn("space-y-6", className)}>
      {smartSuggestions.length > 0 && (
        <section
          aria-label="Preventive suggestions"
          className="rounded-xl border border-warning/20 bg-warning/10 p-4 dark:border-warning/30 dark:bg-warning/15"
        >
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning dark:bg-warning/20 dark:text-warning">
              <HeartPulse className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="text-sm font-semibold text-warning dark:text-warning">
                  Due on this vehicle
                </p>
                <p className="text-xs text-warning/80 dark:text-warning/80">
                  Suggested from service history — add any that apply to this visit.
                </p>
              </div>
              <ul className="space-y-2">
                {smartSuggestions.map((service) => {
                  const concernText = `Perform ${service.service_type_name}`;
                  const alreadyAdded = selectedConcerns.includes(concernText);
                  return (
                    <li
                      key={service.id}
                      className="flex flex-col gap-2 rounded-lg border border-warning/20 bg-background/80 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-warning/30"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{service.service_type_name}</span>
                          {service.is_due ? (
                            <Badge variant="danger" className="h-4 px-1.5 text-[10px] leading-none">
                              Overdue
                            </Badge>
                          ) : service.is_due_soon ? (
                            <Badge variant="warning" className="h-4 px-1.5 text-[10px] leading-none">
                              Due soon
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {service.estimated_due_date
                            ? `Est. ${format(new Date(service.estimated_due_date), "MMM d, yyyy")}`
                            : typeof service.days_until_due === "number"
                              ? `In ${service.days_until_due} days`
                              : null}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant={alreadyAdded ? "secondary" : "outline"}
                        className="shrink-0"
                        onClick={() => onToggleConcern(concernText)}
                      >
                        <PlusCircle className="mr-1 h-3.5 w-3.5" />
                        {alreadyAdded ? "Added" : "Add to request"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>
      )}

      <section className="space-y-3" aria-labelledby={`${idPrefix}-job-heading`}>
        <SectionLabel hint="First selection is primary for billing and package rules.">
          <span id={`${idPrefix}-job-heading`}>Job type</span>
        </SectionLabel>
        <JobTypeSelect
          id={`${idPrefix}-job-type`}
          multiple
          value={jobTypeCode}
          values={jobTypeCodes}
          onChange={onJobTypeChange}
          onChangeMultiple={onJobTypesChange}
        />
      </section>

      {bundleRequired && (
        <section className="space-y-3" aria-labelledby={`${idPrefix}-package-heading`}>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <SectionLabel hint="Parts and labor from this package are added automatically.">
              <span id={`${idPrefix}-package-heading`}>{SERVICE_PACKAGE_LABEL}</span>
            </SectionLabel>
            {suggestedService?.suggested_service_name ? (
              <Badge variant="outline" className="text-[10px] font-normal">
                Suggested: {suggestedService.suggested_service_name}
              </Badge>
            ) : null}
          </div>

          <Select
            value={serviceBundleId?.toString() ?? ""}
            onValueChange={(val) => {
              const bundleId = parseInt(val, 10);
              const bundle = bundles.find((b) => b.id === bundleId);
              if (bundle) onServiceBundleChange(bundleId, bundle);
            }}
          >
            <SelectTrigger id={`${idPrefix}-service-bundle`} aria-invalid={!!bundleError}>
              <SelectValue placeholder={SERVICE_PACKAGE_PLACEHOLDER} />
            </SelectTrigger>
            <SelectContent>
              {bundles.map((bundle) => (
                <SelectItem key={bundle.id} value={bundle.id.toString()}>
                  {bundle.name}
                  {bundle.service_type_name ? ` · ${bundle.service_type_name}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {bundleError ? (
            <p className="text-sm text-destructive">{bundleError}</p>
          ) : null}

          {progressionWarning ? (
            <p className="flex items-start gap-1.5 text-xs font-medium text-primary">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{progressionWarning}</span>
            </p>
          ) : null}

          {bundleItems.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-border bg-muted/20">
              <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Included ({bundleItems.length})
                </p>
              </div>
              <ul className="max-h-44 divide-y divide-border overflow-y-auto">
                {bundleItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span className="truncate font-medium">{item.part_name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      ×{item.quantity}
                      {item.unit ? ` ${item.unit}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      )}

      <section className="space-y-3" aria-labelledby={`${idPrefix}-request-heading`}>
        <SectionLabel
          hint={
            isFastTrack
              ? "Optional notes for this package."
              : primaryJobType
                ? `Filtered for ${selectedJobTypes.map((jt) => jt.name).join(", ") || primaryJobType.name}.`
                : "Pick common items, then add any extra detail."
          }
        >
          <span id={`${idPrefix}-request-heading`}>
            {isFastTrack ? "Service notes" : "Customer request"}
          </span>
        </SectionLabel>

        {!isFastTrack && (
          <div className="space-y-2.5">
            <div className="grid max-h-52 grid-cols-1 gap-1 overflow-y-auto rounded-xl border border-border bg-muted/15 p-2 sm:grid-cols-2">
              {filteredCommonConcerns.map((item) => {
                const checked = selectedConcerns.includes(item);
                return (
                  <label
                    key={item}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 text-xs transition-colors",
                      checked
                        ? "border-primary/40 bg-primary/5 text-foreground"
                        : "border-transparent hover:border-border hover:bg-background"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleConcern(item)}
                      className="size-4 shrink-0 accent-primary"
                    />
                    <span className="min-w-0 leading-snug">{item}</span>
                  </label>
                );
              })}
            </div>

            {selectedConcerns.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedConcerns.map((item) => (
                  <Badge
                    key={item}
                    variant="secondary"
                    className="max-w-full cursor-pointer truncate text-[11px] font-normal"
                    onClick={() => onToggleConcern(item)}
                    title="Click to remove"
                  >
                    {item}
                    <span className="ml-1 opacity-60">×</span>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <Label htmlFor={`${idPrefix}-concerns`} className="sr-only">
            {isFastTrack ? "Service notes" : "Additional details"}
          </Label>
          <Textarea
            id={`${idPrefix}-concerns`}
            value={customConcerns}
            onChange={(e) => onCustomConcernsChange(e.target.value)}
            rows={isFastTrack ? 3 : 4}
            aria-invalid={!!concernsError}
            placeholder={
              isFastTrack
                ? "Optional notes for this service…"
                : selectedConcerns.length > 0
                  ? "Any extra details not covered above…"
                  : "Describe the issue or service requested…"
            }
            className={concernsError ? "border-destructive" : undefined}
          />
          {!isFastTrack && !selectedConcerns.length && !customConcerns.trim() ? (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Select concerns above or describe the request — required to continue.
            </p>
          ) : null}
          {concernsError ? (
            <p className="mt-1.5 text-sm text-destructive">{concernsError}</p>
          ) : null}
        </div>

        {!isFastTrack && previewLines.length > 0 && (
          <div className="rounded-xl border border-border bg-muted/25 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Request summary
            </p>
            <ul className="space-y-1 text-sm">
              {previewLines.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="text-primary">•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {concernsFooter}
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {showOdometer && (
          <div>
            <Label htmlFor={`${idPrefix}-odometer`}>Odometer in *</Label>
            <Input
              id={`${idPrefix}-odometer`}
              type="number"
              min={0}
              value={odometer}
              onChange={(e) => onOdometerChange(e.target.value)}
              placeholder="Current mileage"
              className="mt-1.5"
              aria-invalid={!!odometerError}
            />
            {odometerError ? (
              <p className="mt-1 text-sm text-destructive">{odometerError}</p>
            ) : null}
          </div>
        )}
        <div className={showOdometer ? undefined : "sm:col-span-2 sm:max-w-xs"}>
          <Label htmlFor={`${idPrefix}-priority`}>Priority</Label>
          <Select
            value={priority}
            onValueChange={(v) => onPriorityChange(v as ServiceIntakePriority)}
          >
            <SelectTrigger id={`${idPrefix}-priority`} className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>
    </div>
  );
}
