"use client";

import { useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { getStatusLabel } from "@/lib/utils/workorder-status";
import {
  WORKFLOW_STEPS,
  getWorkflowStepIndex,
} from "@/lib/utils/workorder-workflow-steps";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils/cn";

interface WorkOrderProgressProps {
  status: string;
  labelOverride?: string;
  diagnosisStatus?: string | null;
  className?: string;
}

export function WorkOrderProgress({
  status,
  labelOverride,
  diagnosisStatus,
  className,
}: WorkOrderProgressProps) {
  const [stepsOpen, setStepsOpen] = useState(false);
  const currentIndex = getWorkflowStepIndex(status, { diagnosisStatus });
  const currentStep = WORKFLOW_STEPS[currentIndex] ?? WORKFLOW_STEPS[0];
  const progressPct = Math.round(((currentIndex + 1) / WORKFLOW_STEPS.length) * 100);
  const CurrentIcon = currentStep.icon;
  const currentLabel = labelOverride || getStatusLabel(status);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <CurrentIcon className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {currentLabel}
            </p>
            <p className="text-xs text-muted-foreground">
              Step {currentIndex + 1} of {WORKFLOW_STEPS.length}
              <span className="hidden sm:inline"> · {labelOverride || currentStep.label}</span>
            </p>
          </div>
        </div>
        <Popover open={stepsOpen} onOpenChange={setStepsOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 shrink-0 px-2 text-xs text-muted-foreground">
              All steps
              <ChevronDown className="ml-1 h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2" align="end">
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {WORKFLOW_STEPS.map((step, index) => {
                const done = index < currentIndex;
                const current = index === currentIndex;
                const Icon = step.icon;
                return (
                  <li
                    key={step.key}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs",
                      current && "bg-primary/10 text-primary font-medium",
                      done && !current && "text-muted-foreground",
                      !done && !current && "text-muted-foreground/70"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                        done && "border-success bg-success text-success-foreground",
                        current && "border-primary bg-primary text-primary-foreground",
                        !done && !current && "border-border bg-muted"
                      )}
                    >
                      {done ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Icon className="h-3 w-3" />
                      )}
                    </span>
                    <span className="truncate">
                      {current && labelOverride ? labelOverride : step.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </PopoverContent>
        </Popover>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>
  );
}
