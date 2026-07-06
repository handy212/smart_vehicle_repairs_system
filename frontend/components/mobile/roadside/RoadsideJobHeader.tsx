"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import type { RoadsideAssignmentStatus } from "@/lib/api/roadside";

const WORKFLOW_STEPS = [
  { key: "offer", label: "Offer" },
  { key: "accepted", label: "Accepted" },
  { key: "en_route", label: "En route" },
  { key: "on_site", label: "On site" },
  { key: "working", label: "Working" },
] as const;

function stepIndex(
  status: string,
  assignmentStatus: RoadsideAssignmentStatus | null | undefined
): number {
  if (assignmentStatus === "pending" || assignmentStatus === "rejected") return 0;
  if (["requested", "dispatched"].includes(status)) return 1;
  if (status === "en_route") return 2;
  if (status === "on_site") return 3;
  if (status === "in_progress") return 4;
  if (["completed", "cancelled", "failed"].includes(status)) return 5;
  return 1;
}

export function RoadsideJobHeader({
  requestNumber,
  serviceLabel,
  status,
  assignmentStatus,
}: {
  requestNumber: string;
  serviceLabel: string;
  status: string;
  assignmentStatus?: RoadsideAssignmentStatus | null;
}) {
  const current = stepIndex(status, assignmentStatus);
  const terminal = ["completed", "cancelled", "failed"].includes(status);
  const awaitingResponse = assignmentStatus === "pending";

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{requestNumber}</p>
          <h1 className="text-lg font-bold text-foreground">{serviceLabel}</h1>
        </div>
        <Badge
          variant={
            awaitingResponse ? "warning" : status === "completed" ? "success" : "default"
          }
          className="shrink-0 uppercase"
        >
          {awaitingResponse ? "Needs response" : status.replace("_", " ")}
        </Badge>
      </div>

      {!terminal && assignmentStatus !== "rejected" && (
        <div className="flex items-center justify-between gap-1">
          {WORKFLOW_STEPS.map((step, i) => {
            const done = i < current;
            const active = i === current;
            return (
              <div key={step.key} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full border-2 text-[10px] font-semibold",
                    done && "border-success bg-success text-success-foreground",
                    active && !done && "border-primary bg-primary text-primary-foreground",
                    !done && !active && "border-muted-foreground/30 bg-muted text-muted-foreground"
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span
                  className={cn(
                    "text-[10px] leading-tight text-center",
                    active ? "font-medium text-foreground" : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
