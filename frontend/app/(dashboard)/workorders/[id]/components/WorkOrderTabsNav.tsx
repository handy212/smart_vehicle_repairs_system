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
}

function TabSeparator({ label }: { label: string }) {
  return (
    <span
      className="mx-1 hidden shrink-0 self-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:inline"
      aria-hidden
    >
      {label}
    </span>
  );
}

function LockedTabTrigger({
  value,
  label,
  icon: Icon,
  count,
  locked,
  lockMessage,
}: {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
  locked: boolean;
  lockMessage: string;
}) {
  const trigger = (
    <TabsTrigger
      value={value}
      disabled={locked}
      className="h-9 shrink-0 gap-1.5 px-2.5 text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm"
    >
      <Icon className="hidden h-3.5 w-3.5 sm:block" />
      {label}
      {count !== undefined && count > 0 && (
        <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px] font-normal">
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
}: WorkOrderTabsNavProps) {
  const lockMessage = LOCK_MSG;
  const effectiveLocked = isRoutine ? false : tabsLocked;
  return (
    <TooltipProvider delayDuration={300}>
      <TabsList
        className={cn(
          "flex h-auto w-full min-h-9 justify-start gap-0.5 overflow-x-auto bg-muted/50 p-1",
          "scrollbar-thin"
        )}
      >
        <LockedTabTrigger value="overview" label="Overview" icon={FileText} locked={false} lockMessage={lockMessage} />
        <TabSeparator label="Work" />
        <LockedTabTrigger
          value="tasks"
          label="Tasks"
          icon={Wrench}
          count={tasksCount}
          locked={effectiveLocked}
          lockMessage={lockMessage}
        />
        <LockedTabTrigger
          value="parts"
          label="Parts"
          icon={Package}
          count={partsCount}
          locked={effectiveLocked}
          lockMessage={lockMessage}
        />
        {!isRoutine && (
          <LockedTabTrigger value="diagnosis" label="Diagnosis" icon={Search} locked={effectiveLocked} lockMessage={lockMessage} />
        )}
        <TabSeparator label="Records" />
        <LockedTabTrigger
          value="notes"
          label="Notes"
          icon={MessageSquare}
          count={notesCount}
          locked={effectiveLocked}
          lockMessage={lockMessage}
        />
        <LockedTabTrigger value="photos" label="Photos" icon={Image} locked={effectiveLocked} lockMessage={lockMessage} />
        <LockedTabTrigger value="documents" label="Documents" icon={FileText} locked={effectiveLocked} lockMessage={lockMessage} />
        <TabSeparator label="History" />
        <LockedTabTrigger value="timeline" label="Timeline" icon={Clock} locked={effectiveLocked} lockMessage={lockMessage} />
      </TabsList>
    </TooltipProvider>
  );
}
