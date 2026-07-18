"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { useAuthStore } from "@/store/authStore";
import { useOfflineStore } from "@/store/offlineStore";
import { workordersApi, type WorkOrder } from "@/lib/api/workorders";
import { workOrderTasksApi, type ServiceTask } from "@/lib/api/workorder-tasks";
import { timeLogsDB } from "@/lib/offline/db";
import { Clock, Play, Square, RefreshCw } from "lucide-react";
import { filterSelectableLaborTasks } from "@/lib/workorders/laborTasks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MobilePageShell } from "@/components/mobile/MobilePageShell";
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
import apiClient from "@/lib/api/client";
import { timeLogsApi, type TimeLog as ApiTimeLog } from "@/lib/api/timeLogs";
import { getUserFacingError } from "@/lib/api/apiErrors";

interface TimeLog {
  id?: number;
  tempId?: number;
  work_order: number;
  work_order_number?: string;
  task?: number | null;
  task_description?: string | null;
  clock_in: string;
  clock_out?: string | null;
  duration_hours?: number;
  description?: string;
  synced?: boolean;
  technician?: number;
}

export default function TimeTrackingPage() {
  const { isOnline } = useOfflineStore();
  const { user } = useAuthStore();
  const [activeLog, setActiveLog] = useState<TimeLog | null>(null);
  const [recentLogs, setRecentLogs] = useState<TimeLog[]>([]);
  const [assignedWorkOrders, setAssignedWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingWoId, setPendingWoId] = useState<number | null>(null);
  const [taskOptions, setTaskOptions] = useState<ServiceTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [loadingTasks, setLoadingTasks] = useState(false);

  const checkActiveLog = useCallback(async () => {
    try {
      if (isOnline) {
        const response = await apiClient.get<ApiTimeLog | null>("/workorders/time-logs/active/");
        setActiveLog(response.data || null);
      } else {
        const logs = await timeLogsDB.getAll();
        const active = logs.find((log) => log.clock_in && !log.clock_out);
        setActiveLog(active || null);
      }
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status !== 404) console.error("Failed to check active log:", error);
      setActiveLog(null);
    }
  }, [isOnline]);

  const loadRecentLogs = useCallback(async () => {
    if (!user?.id) return;
    try {
      if (isOnline) {
        const logs = await timeLogsApi.myRecent();
        const completed = logs.filter((log) => log.clock_out);
        setRecentLogs(completed.slice(0, 15) as TimeLog[]);
        for (const log of logs) {
          if (log.id) await timeLogsDB.set(log.id, log, true);
        }
      } else {
        const cached = await timeLogsDB.getAll();
        setRecentLogs(
          cached
            .filter((log) => log.technician === user.id && log.clock_out)
            .slice(0, 15)
        );
      }
    } catch (error) {
      console.error("Failed to load time logs:", error);
      const cached = await timeLogsDB.getAll();
      setRecentLogs(
        cached.filter((log) => log.technician === user.id && log.clock_out).slice(0, 15)
      );
    }
  }, [isOnline, user?.id]);

  const loadAssignedWorkOrders = useCallback(async () => {
    if (!user?.id || !isOnline) return;
    try {
      const response = await workordersApi.list({
        primary_technician: user.id,
      });
      const results = response.results || [];
      const active = results.filter(
        (wo) => wo.status === "assigned" || wo.status === "in_progress"
      );
      setAssignedWorkOrders(active);
    } catch (error) {
      console.error("Failed to load assigned work orders:", error);
    }
  }, [user?.id, isOnline]);

  useEffect(() => {
    checkActiveLog();
    loadRecentLogs();
    loadAssignedWorkOrders();
  }, [checkActiveLog, loadRecentLogs, loadAssignedWorkOrders]);

  const openTaskPicker = async (workOrderId: number) => {
    setPendingWoId(workOrderId);
    setLoadingTasks(true);
    try {
      if (!isOnline) {
        toast.error("Go online briefly to load tasks, then you can start labor offline.");
        setPendingWoId(null);
        return;
      }
      const tasks = await workOrderTasksApi.list({ work_order: workOrderId });
      const openTasks = filterSelectableLaborTasks(tasks, {
        userId: user?.id,
        canPickAny: true,
      });
      setTaskOptions(openTasks);
      setSelectedTaskId(openTasks[0] ? String(openTasks[0].id) : "");
    } catch (error) {
      toast.error(getUserFacingError(error, "Failed to load tasks"));
      setPendingWoId(null);
    } finally {
      setLoadingTasks(false);
    }
  };

  const handleClockIn = async () => {
    if (!pendingWoId || !selectedTaskId || !user?.id) return;
    const taskId = Number(selectedTaskId);
    const task = taskOptions.find((t) => t.id === taskId);
    const wo = assignedWorkOrders.find((w) => w.id === pendingWoId);
    setLoading(true);
    try {
      if (isOnline) {
        const log = await timeLogsApi.clockIn(pendingWoId, {
          task: taskId,
          description: task?.description,
        });
        setActiveLog(log);
        if (log.id) await timeLogsDB.set(log.id, log, true);
      } else {
        const tempId = -Date.now();
        const clockIn = new Date().toISOString();
        const localLog: TimeLog = {
          id: tempId,
          tempId,
          work_order: pendingWoId,
          work_order_number: wo?.work_order_number,
          task: taskId,
          task_description: task?.description,
          clock_in: clockIn,
          technician: user.id,
          description: task?.description,
        };
        await timeLogsDB.set(tempId, localLog, false);
        setActiveLog(localLog);
      }
      setPendingWoId(null);
      toast.success(isOnline ? "Labor timer started" : "Labor timer queued offline");
      await loadRecentLogs();
    } catch (error) {
      toast.error(getUserFacingError(error, "Failed to start labor timer"));
    } finally {
      setLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!activeLog) return;
    setLoading(true);
    try {
      const clockOut = new Date().toISOString();
      const localId = activeLog.id || activeLog.tempId || Date.now();
      if (isOnline && activeLog.id && activeLog.id > 0) {
        await timeLogsApi.clockOut(activeLog.id, clockOut);
        await timeLogsDB.set(
          activeLog.id,
          { ...activeLog, clock_out: clockOut },
          true,
        );
      } else {
        const updated = {
          ...activeLog,
          id: localId,
          clock_out: clockOut,
          duration_hours: calculateDuration(activeLog.clock_in, clockOut),
        };
        await timeLogsDB.set(localId, updated, false);
      }
      setActiveLog(null);
      toast.success(isOnline ? "Labor timer stopped" : "Stop queued — will sync when online");
      await loadRecentLogs();
    } catch (error) {
      toast.error(getUserFacingError(error, "Failed to stop labor timer"));
    } finally {
      setLoading(false);
    }
  };

  const calculateDuration = (clockIn: string, clockOut: string): number => {
    const diffMs = new Date(clockOut).getTime() - new Date(clockIn).getTime();
    return diffMs / (1000 * 60 * 60);
  };

  const formatDuration = (hours?: number): string => {
    if (!hours) return "0h 0m";
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  const refreshAll = async () => {
    setLoading(true);
    await Promise.all([checkActiveLog(), loadRecentLogs(), loadAssignedWorkOrders()]);
    setLoading(false);
  };

  return (
    <MobilePageShell title="Labor Time" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Labor Time</h2>
          <p className="text-sm text-muted-foreground">
            Track time against a task on your work order.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={refreshAll} disabled={loading} aria-label="Refresh">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {activeLog && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5 text-primary" />
              Timer running
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Work order</p>
                <Link
                  href={`/mobile/workorders/${activeLog.work_order}`}
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  {activeLog.work_order_number || `WO #${activeLog.work_order}`}
                </Link>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Started</p>
                <p className="font-medium">
                  {new Date(activeLog.clock_in).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
            {(activeLog.task_description || activeLog.description) && (
              <p className="text-sm text-muted-foreground">
                {activeLog.task_description || activeLog.description}
              </p>
            )}
            <p className="text-center font-mono text-2xl font-bold text-primary">
              {formatDuration(
                calculateDuration(activeLog.clock_in, new Date().toISOString())
              )}
            </p>
            <Button
              onClick={handleClockOut}
              disabled={loading}
              className="h-11 w-full bg-destructive hover:bg-destructive/90"
            >
              <Square className="mr-2 h-4 w-4" />
              Stop
            </Button>
          </CardContent>
        </Card>
      )}

      {!activeLog && assignedWorkOrders.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Start on a work order
          </h3>
          <div className="space-y-2">
            {assignedWorkOrders.map((wo) => (
              <Card key={wo.id}>
                <CardContent className="flex items-center justify-between gap-2 p-4">
                  <div className="min-w-0">
                    <p className="font-semibold">{wo.work_order_number || `WO #${wo.id}`}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {wo.vehicle_info || "Vehicle"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => openTaskPicker(wo.id)}
                    disabled={loading || loadingTasks}
                    className="shrink-0"
                  >
                    <Play className="mr-1 h-4 w-4" />
                    Start
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Recent activity
        </h3>
        {recentLogs.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No completed labor entries yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {recentLogs.map((log) => (
              <Card key={log.id}>
                <CardContent className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {log.work_order_number || `WO #${log.work_order}`}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {log.task_description || log.description || "Labor"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(log.clock_in).toLocaleDateString()} ·{" "}
                      {new Date(log.clock_in).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {log.clock_out &&
                        ` – ${new Date(log.clock_out).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`}
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-sm font-semibold">
                    {formatDuration(
                      log.duration_hours ??
                        (log.clock_out
                          ? calculateDuration(log.clock_in, log.clock_out)
                          : undefined)
                    )}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={pendingWoId != null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingWoId(null);
            setTaskOptions([]);
            setSelectedTaskId("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select task</DialogTitle>
            <DialogDescription>
              Labor time is tracked against a specific task on the work order.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Task</Label>
            <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
              <SelectTrigger>
                <SelectValue placeholder={loadingTasks ? "Loading…" : "Select a task"} />
              </SelectTrigger>
              <SelectContent>
                {taskOptions.length === 0 ? (
                  <SelectItem value="__none" disabled>
                    {loadingTasks ? "Loading tasks…" : "No open tasks"}
                  </SelectItem>
                ) : (
                  taskOptions.map((task) => (
                    <SelectItem key={task.id} value={String(task.id)}>
                      {task.description}
                      {task.task_type ? ` · ${task.task_type}` : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingWoId(null)}>Cancel</Button>
            <Button
              onClick={handleClockIn}
              disabled={
                loading ||
                loadingTasks ||
                !selectedTaskId ||
                selectedTaskId === "__none" ||
                taskOptions.length === 0
              }
            >
              Start timer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MobilePageShell>
  );
}
