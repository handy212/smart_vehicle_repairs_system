"use client";

import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  FileText,
  Wrench,
  Package,
  MessageSquare,
  Image,
  Search,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

const LOCK_MSG = "Complete inspection before accessing this tab";

interface WorkOrderTabsNavProps {
  tasksCount: number;
  partsCount: number;
  notesCount: number;
  tabsLocked: boolean;
  isRoutine?: boolean;
  hideDiagnosis?: boolean;
}

function TabDivider() {
  return (
    <span
      className="mx-0.5 hidden h-5 w-px shrink-0 self-center bg-border sm:inline"
      aria-hidden
    />
  );
}

function LockedTabTrigger({
  value,
  label,
  shortLabel,
  icon: Icon,
  count,
  locked,
  lockMessage,
}: {
  value: string;
  label: string;
  shortLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
  locked: boolean;
  lockMessage: string;
}) {
  const trigger = (
    <TabsTrigger
      value={value}
      disabled={locked}
      className={cn(
        "h-10 shrink-0 gap-2 px-3 text-sm font-medium",
        "data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-foreground",
        "data-[state=inactive]:text-muted-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{shortLabel ?? label}</span>
      {count !== undefined && count > 0 && (
        <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[11px] font-medium tabular-nums">
          {count}
        </Badge>
      )}
    </TabsTrigger>
  );

  if (!locked) return trigger;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0">{trigger}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {lockMessage}
      </TooltipContent>
    </Tooltip>
  );
}

export function WorkOrderTabsNav({
  tasksCount,
  partsCount,
  notesCount,
  tabsLocked,
  isRoutine = false,
  hideDiagnosis = false,
}: WorkOrderTabsNavProps) {
  const lockMessage = LOCK_MSG;
  const effectiveLocked = isRoutine ? false : tabsLocked;

  const workTabs = isRoutine
    ? (
      <>
        <LockedTabTrigger
          value="parts"
          label="Parts"
          shortLabel="Parts"
          icon={Package}
          count={partsCount}
          locked={effectiveLocked}
          lockMessage={lockMessage}
        />
        <LockedTabTrigger
          value="tasks"
          label="Service tasks"
          shortLabel="Tasks"
          icon={Wrench}
          count={tasksCount}
          locked={effectiveLocked}
          lockMessage={lockMessage}
        />
      </>
    )
    : (
      <>
        <LockedTabTrigger
          value="tasks"
          label="Tasks"
          shortLabel="Tasks"
          icon={Wrench}
          count={tasksCount}
          locked={effectiveLocked}
          lockMessage={lockMessage}
        />
        <LockedTabTrigger
          value="parts"
          label="Parts"
          shortLabel="Parts"
          icon={Package}
          count={partsCount}
          locked={effectiveLocked}
          lockMessage={lockMessage}
        />
        {!hideDiagnosis ? (
          <LockedTabTrigger
            value="diagnosis"
            label="Diagnosis"
            shortLabel="Diag."
            icon={Search}
            locked={effectiveLocked}
            lockMessage={lockMessage}
          />
        ) : null}
      </>
    );

  return (
    <TooltipProvider delayDuration={300}>
      <TabsList
        className={cn(
          "flex h-auto w-full min-h-10 justify-start gap-1 overflow-x-auto rounded-lg bg-muted/60 p-1",
          "scrollbar-thin"
        )}
      >
        <LockedTabTrigger
          value="overview"
          label="Overview"
          shortLabel="Info"
          icon={FileText}
          locked={false}
          lockMessage={lockMessage}
        />
        <TabDivider />
        {workTabs}
        <TabDivider />
        <LockedTabTrigger
          value="notes"
          label="Notes"
          shortLabel="Notes"
          icon={MessageSquare}
          count={notesCount}
          locked={effectiveLocked}
          lockMessage={lockMessage}
        />
        <LockedTabTrigger
          value="photos"
          label="Photos"
          shortLabel="Photos"
          icon={Image}
          locked={effectiveLocked}
          lockMessage={lockMessage}
        />
        <LockedTabTrigger
          value="documents"
          label="Documents"
          shortLabel="Docs"
          icon={FileText}
          locked={effectiveLocked}
          lockMessage={lockMessage}
        />
        <TabDivider />
        <LockedTabTrigger
          value="timeline"
          label="Timeline"
          shortLabel="History"
          icon={Clock}
          locked={effectiveLocked}
          lockMessage={lockMessage}
        />
      </TabsList>
    </TooltipProvider>
  );
}
