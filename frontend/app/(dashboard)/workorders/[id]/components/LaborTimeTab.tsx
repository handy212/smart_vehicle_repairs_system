"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogIn, LogOut, RefreshCw, Timer } from "lucide-react";
import { timeLogsApi, type TimeLog } from "@/lib/api/timeLogs";
import { workOrderTasksApi, type ServiceTask } from "@/lib/api/workorder-tasks";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/lib/toast";
import { getUserFacingError } from "@/lib/api/errors";
import {
  filterSelectableLaborTasks,
  taskAssigneeId,
} from "@/lib/workorders/laborTasks";

function formatWhen(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatHours(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return `${n.toFixed(2)}h`;
}

function normalizeList(data: Awaited<ReturnType<typeof timeLogsApi.list>>): TimeLog[] {
  if (Array.isArray(data)) return data;
  return data.results ?? [];
}

function taskTypeLabel(task: ServiceTask) {
  if (task.is_workflow_task && task.workflow_phase === "diagnosis") {
    return "Diagnosis";
  }
  return task.task_type
    ? task.task_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Task";
}

export default function LaborTimeTab({ workOrderId }: { workOrderId: number }) {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const { hasAnyPermission, hasPermission } = usePermissions();
  const canClock = hasAnyPermission([
    "clock_work_time",
    "edit_workorders",
    "update_workorder_status",
  ]);
  const canPickAnyTask = hasPermission("edit_workorders");
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState("");

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ["workorder-labor-time", workOrderId],
    queryFn: async () => normalizeList(await timeLogsApi.list({ work_order: workOrderId })),
    enabled: !!workOrderId,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["workorder-tasks", workOrderId],
    queryFn: () => workOrderTasksApi.list({ work_order: workOrderId }),
    enabled: !!workOrderId && canClock,
  });

  const { data: activeLog } = useQuery({
    queryKey: ["workorder-labor-active"],
    queryFn: () => timeLogsApi.getActive(),
    enabled: canClock,
  });

  const selectableTasks = useMemo(
    () =>
      filterSelectableLaborTasks(tasks, {
        userId: user?.id,
        canPickAny: canPickAnyTask,
      }),
    [tasks, user?.id, canPickAnyTask],
  );

  const assignedToMe = selectableTasks.filter(
    (t) => user?.id != null && taskAssigneeId(t) === user.id,
  );

  const activeOnThisWo = activeLog?.work_order === workOrderId ? activeLog : null;
  const activeElsewhere =
    activeLog && activeLog.work_order !== workOrderId ? activeLog : null;

  const totalHours = logs.reduce((sum, log) => {
    const n = typeof log.duration_hours === "string"
      ? Number(log.duration_hours)
      : (log.duration_hours ?? 0);
    return sum + (Number.isNaN(n) ? 0 : n);
  }, 0);

  const clockInMutation = useMutation({
    mutationFn: (taskId: number) => {
      const task = tasks.find((t) => t.id === taskId);
      return timeLogsApi.clockIn(workOrderId, {
        task: taskId,
        description: task?.description,
      });
    },
    onSuccess: () => {
      toast.success("Labor timer started");
      setShowStartDialog(false);
      setSelectedTaskId("");
      queryClient.invalidateQueries({ queryKey: ["workorder-labor-time", workOrderId] });
      queryClient.invalidateQueries({ queryKey: ["workorder-labor-active"] });
      queryClient.invalidateQueries({ queryKey: ["workorder-timeline-labor", workOrderId] });
    },
    onError: (error) => toast.error(getUserFacingError(error, "Failed to start labor timer")),
  });

  const clockOutMutation = useMutation({
    mutationFn: (id: number) => timeLogsApi.clockOut(id),
    onSuccess: () => {
      toast.success("Labor timer stopped");
      queryClient.invalidateQueries({ queryKey: ["workorder-labor-time", workOrderId] });
      queryClient.invalidateQueries({ queryKey: ["workorder-labor-active"] });
      queryClient.invalidateQueries({ queryKey: ["workorder-timeline-labor", workOrderId] });
    },
    onError: (error) => toast.error(getUserFacingError(error, "Failed to stop labor timer")),
  });

  const busy = clockInMutation.isPending || clockOutMutation.isPending;

  const openStartDialog = () => {
    const preferred = assignedToMe[0] ?? selectableTasks[0];
    setSelectedTaskId(preferred ? String(preferred.id) : "");
    setShowStartDialog(true);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Timer className="h-5 w-5 text-primary" />
            Labor Time
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isLoading}
            aria-label="Refresh labor logs"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary">Total logged: {totalHours.toFixed(2)}h</Badge>
            {activeOnThisWo && (
              <Badge variant="default">
                Running
                {activeOnThisWo.task_description
                  ? `: ${activeOnThisWo.task_description}`
                  : ""}
              </Badge>
            )}
            {activeElsewhere && (
              <Badge variant="outline">
                Timer active on {activeElsewhere.work_order_number || `WO #${activeElsewhere.work_order}`}
              </Badge>
            )}
          </div>

          {canClock ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={openStartDialog} disabled={busy || !!activeLog}>
                <LogIn className="mr-2 h-4 w-4" />
                Start
              </Button>
              <Button
                variant="outline"
                onClick={() => activeOnThisWo && clockOutMutation.mutate(activeOnThisWo.id)}
                disabled={busy || !activeOnThisWo}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Stop
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Viewing only — starting timers requires work-order time permission.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entries</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Technician</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Ended</TableHead>
                <TableHead className="text-right">Hours</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <div className="h-10 animate-pulse rounded bg-muted" />
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No labor time logged yet. Start against an assigned task.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium max-w-[220px]">
                      {log.task_description || log.description || "—"}
                    </TableCell>
                    <TableCell>
                      {log.task_type_display || log.task_type ? (
                        <Badge variant="outline" className="capitalize">
                          {log.task_type_display || log.task_type}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{log.technician_name || `User #${log.technician}`}</TableCell>
                    <TableCell>{formatWhen(log.clock_in)}</TableCell>
                    <TableCell>
                      {log.clock_out ? formatWhen(log.clock_out) : (
                        <Badge variant="secondary">Running</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatHours(log.duration_hours)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start labor timer</DialogTitle>
            <DialogDescription>
              Choose the task you are working on. Prefer tasks assigned to you.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Task</Label>
              <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a task" />
                </SelectTrigger>
                <SelectContent>
                  {selectableTasks.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      No open tasks available
                    </SelectItem>
                  ) : (
                    selectableTasks.map((task) => {
                      const mine = user?.id != null && taskAssigneeId(task) === user.id;
                      return (
                        <SelectItem key={task.id} value={String(task.id)}>
                          {task.description}
                          {" · "}
                          {taskTypeLabel(task)}
                          {mine ? " · Assigned to you" : taskAssigneeId(task) == null ? " · Unassigned" : ""}
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>
            </div>
            {assignedToMe.length === 0 && selectableTasks.length > 0 && (
              <p className="text-xs text-muted-foreground">
                None of the open tasks are assigned to you. Pick an unassigned task or ask a coordinator to assign one.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStartDialog(false)}>Cancel</Button>
            <Button
              onClick={() => clockInMutation.mutate(Number(selectedTaskId))}
              disabled={
                !selectedTaskId ||
                selectedTaskId === "__none" ||
                clockInMutation.isPending ||
                selectableTasks.length === 0
              }
            >
              Start timer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
