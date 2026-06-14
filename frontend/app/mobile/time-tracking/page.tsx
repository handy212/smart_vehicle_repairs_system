"use client";

import { useCallback, useEffect, useState } from "react";
import { useOfflineStore } from "@/store/offlineStore";
import { timeLogsDB } from "@/lib/offline/db";
import { queueRequest } from "@/lib/offline/queue";
import { Clock, Play, Square, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MobilePageShell } from "@/components/mobile/MobilePageShell";
import apiClient from "@/lib/api/client";
import { getUserFacingError } from "@/lib/api/apiErrors";

interface TimeLog {
  id?: number;
  work_order: number;
  work_order_number?: string;
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

  const checkActiveLog = useCallback(async () => {
    try {
      if (isOnline) {
        const response = await apiClient.get<TimeLog | null>("/workorders/time-logs/active/");
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
        const response = await apiClient.get<TimeLog[]>("/workorders/time-logs/my-recent/");
        const logs = Array.isArray(response.data) ? response.data : [];
        const completed = logs.filter((log) => log.clock_out);
        setRecentLogs(completed.slice(0, 15));
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

  const handleClockIn = async (workOrderId: number) => {
    setLoading(true);
    try {
      if (isOnline) {
        const log = await timeLogsApi.clockIn(workOrderId);
        setActiveLog(log);
      } else {
        const tempId = Date.now();
        const clockIn = new Date().toISOString();
        const logWithId: TimeLog = {
          work_order: workOrderId,
          clock_in: clockIn,
          description: "Field work",
          id: tempId,
          technician: user?.id,
        };
        await timeLogsDB.set(tempId, logWithId, false);
        await queueRequest("create", "/workorders/time-logs/clock-in/", "POST", {
          work_order: workOrderId,
          description: "Field work",
        });
        setActiveLog(logWithId);
      }
      toast.success("Clocked in");
      await loadRecentLogs();
    } catch (error) {
      toast.error(getUserFacingError(error, "Failed to clock in"));
    } finally {
      setLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!activeLog) return;
    setLoading(true);
    try {
      const clockOut = new Date().toISOString();
      if (isOnline && activeLog.id) {
        await timeLogsApi.clockOut(activeLog.id, clockOut);
      } else {
        const updated = {
          ...activeLog,
          clock_out: clockOut,
          duration_hours: calculateDuration(activeLog.clock_in, clockOut),
        };
        await timeLogsDB.set(activeLog.id || Date.now(), updated, false);
        if (activeLog.id) {
          await queueRequest("update", `/workorders/time-logs/${activeLog.id}/`, "PATCH", {
            clock_out: clockOut,
          });
        }
      }
      setActiveLog(null);
      toast.success("Clocked out");
      await loadRecentLogs();
    } catch (error) {
      toast.error(getUserFacingError(error, "Failed to clock out"));
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
    <MobilePageShell className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Time Tracking</h2>
        <Button size="sm" variant="outline" onClick={refreshAll} disabled={loading} aria-label="Refresh">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {activeLog && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5 text-primary" />
              Clocked in
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
              Clock out
            </Button>
          </CardContent>
        </Card>
      )}

      {!activeLog && assignedWorkOrders.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Clock in to a job
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
                    onClick={() => handleClockIn(wo.id)}
                    disabled={loading}
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
              No completed time entries yet. Clock in from an assigned work order above.
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
    </MobilePageShell>
  );
}
