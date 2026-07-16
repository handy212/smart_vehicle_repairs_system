"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { workordersApi, type WorkOrder } from "@/lib/api/workorders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";
import { ClipboardList, Pencil, Save, X } from "lucide-react";

export const FUEL_LEVEL_OPTIONS = [
  { value: "empty", label: "Empty" },
  { value: "1/8", label: "1/8" },
  { value: "1/4", label: "1/4" },
  { value: "3/8", label: "3/8" },
  { value: "1/2", label: "1/2" },
  { value: "5/8", label: "5/8" },
  { value: "3/4", label: "3/4" },
  { value: "7/8", label: "7/8" },
  { value: "full", label: "Full" },
  { value: "unknown", label: "Unknown" },
] as const;

export const BATTERY_CONDITION_OPTIONS = [
  { value: "good", label: "Good" },
  { value: "weak", label: "Weak" },
  { value: "dead", label: "Dead / Needs Jump" },
  { value: "replaced", label: "Replaced" },
  { value: "unknown", label: "Unknown" },
] as const;

function labelFor(
  options: readonly { value: string; label: string }[],
  value?: string | null
): string {
  if (!value) return "—";
  return options.find((o) => o.value === value)?.label || value;
}

export type IntakeConditionValues = {
  fuel_level?: string;
  battery_condition?: string;
  valuables_notes?: string;
  warning_lights_notes?: string;
};

interface IntakeConditionCardProps {
  workOrderId: number;
  workOrder: Pick<
    WorkOrder,
    | "fuel_level"
    | "battery_condition"
    | "valuables_notes"
    | "warning_lights_notes"
    | "status"
  >;
  /** Compact variant for DVI perform header */
  compact?: boolean;
  /** Open in edit mode (e.g. during active DVI when still empty). */
  defaultEditing?: boolean;
  title?: string;
  description?: string;
  queryKey?: unknown[];
  canEdit?: boolean;
}

export function IntakeConditionCard({
  workOrderId,
  workOrder,
  compact = false,
  defaultEditing = false,
  title = "Intake condition",
  description,
  queryKey,
  canEdit = true,
}: IntakeConditionCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(defaultEditing && canEdit);
  const [fuel, setFuel] = useState(workOrder.fuel_level || "");
  const [battery, setBattery] = useState(workOrder.battery_condition || "");
  const [valuables, setValuables] = useState(workOrder.valuables_notes || "");
  const [lights, setLights] = useState(workOrder.warning_lights_notes || "");

  useEffect(() => {
    if (!editing) {
      setFuel(workOrder.fuel_level || "");
      setBattery(workOrder.battery_condition || "");
      setValuables(workOrder.valuables_notes || "");
      setLights(workOrder.warning_lights_notes || "");
    }
  }, [
    workOrder.fuel_level,
    workOrder.battery_condition,
    workOrder.valuables_notes,
    workOrder.warning_lights_notes,
    editing,
  ]);

  const saveMutation = useMutation({
    mutationFn: (payload: IntakeConditionValues) =>
      workordersApi.update(workOrderId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workorder", workOrderId] });
      if (queryKey) {
        queryClient.invalidateQueries({ queryKey });
      }
      setEditing(false);
      toast({
        title: "Intake condition saved",
        description: "Job Card will use these values when printed.",
        variant: "success",
      });
    },
    onError: (error: unknown) => {
      toast({
        title: "Could not save intake condition",
        description: getUserFacingError(error, "Please try again."),
        variant: "destructive",
      });
    },
  });

  const handleCancel = () => {
    setFuel(workOrder.fuel_level || "");
    setBattery(workOrder.battery_condition || "");
    setValuables(workOrder.valuables_notes || "");
    setLights(workOrder.warning_lights_notes || "");
    setEditing(false);
  };

  const handleSave = () => {
    saveMutation.mutate({
      fuel_level: fuel || "",
      battery_condition: battery || "",
      valuables_notes: valuables.trim(),
      warning_lights_notes: lights.trim(),
    });
  };

  return (
    <Card className={compact ? "border-dashed" : undefined}>
      <CardHeader className={compact ? "px-3 py-2" : "px-4 py-3"}>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-1.5 text-sm font-semibold">
            <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
            {title}
          </CardTitle>
          {canEdit && !editing && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setEditing(true)}
            >
              <Pencil className="mr-1 h-3 w-3" />
              Edit
            </Button>
          )}
        </div>
        {description ? (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </CardHeader>
      <CardContent className={compact ? "space-y-2 px-3 pb-3 pt-0" : "space-y-3 px-4 pb-4 pt-0"}>
        {!editing ? (
          <div className={compact ? "grid grid-cols-2 gap-2 text-xs sm:grid-cols-4" : "grid grid-cols-1 gap-2 text-sm sm:grid-cols-2"}>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Fuel</div>
              <div className="font-medium">{labelFor(FUEL_LEVEL_OPTIONS, workOrder.fuel_level)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Battery</div>
              <div className="font-medium">
                {labelFor(BATTERY_CONDITION_OPTIONS, workOrder.battery_condition)}
              </div>
            </div>
            <div className={compact ? "col-span-2 sm:col-span-1" : undefined}>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Valuables</div>
              <div className="font-medium">{workOrder.valuables_notes?.trim() || "—"}</div>
            </div>
            <div className={compact ? "col-span-2" : "sm:col-span-2"}>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Warning lights
              </div>
              <div className="whitespace-pre-wrap font-medium">
                {workOrder.warning_lights_notes?.trim() || "—"}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`intake-fuel-${workOrderId}`}>Fuel level</Label>
                <Select value={fuel || "__none__"} onValueChange={(v) => setFuel(v === "__none__" ? "" : v)}>
                  <SelectTrigger id={`intake-fuel-${workOrderId}`}>
                    <SelectValue placeholder="Select fuel level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Not set</SelectItem>
                    {FUEL_LEVEL_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`intake-battery-${workOrderId}`}>Battery</Label>
                <Select
                  value={battery || "__none__"}
                  onValueChange={(v) => setBattery(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger id={`intake-battery-${workOrderId}`}>
                    <SelectValue placeholder="Select battery condition" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Not set</SelectItem>
                    {BATTERY_CONDITION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`intake-valuables-${workOrderId}`}>Valuables</Label>
              <Input
                id={`intake-valuables-${workOrderId}`}
                value={valuables}
                onChange={(e) => setValuables(e.target.value)}
                placeholder="e.g. laptop bag, tools, child seat"
                maxLength={255}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`intake-lights-${workOrderId}`}>Warning lights</Label>
              <Textarea
                id={`intake-lights-${workOrderId}`}
                value={lights}
                onChange={(e) => setLights(e.target.value)}
                placeholder="e.g. Check engine, ABS, TPMS"
                rows={compact ? 2 : 3}
              />
              <p className="text-[11px] text-muted-foreground">
                Saves to the linked work order Job Card. Completing DVI can also prefill battery and warning lights from checklist items.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={handleCancel} disabled={saveMutation.isPending}>
                <X className="mr-1 h-3.5 w-3.5" />
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
                <Save className="mr-1 h-3.5 w-3.5" />
                {saveMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
