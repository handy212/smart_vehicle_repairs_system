"use client";

import { useEffect, useState } from "react";
import { useOfflineStore } from "@/store/offlineStore";
import { timeLogsDB } from "@/lib/offline/db";
// Force HMR rebuild
import { queueRequest } from "@/lib/offline/queue";
import { Clock, Play, Square, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import apiClient from "@/lib/api/client";
import { useAuthStore } from "@/store/authStore";
import { workordersApi, WorkOrder as WorkOrderType } from "@/lib/api/workorders";
import { toast } from "sonner"; // Using toast for better feedback

interface TimeLog {
  id?: number;
  work_order: number;
  work_order_number?: string;
  clock_in: string;
  clock_out?: string;
  duration_hours?: number;
  description?: string;
  synced?: boolean;
}

export default function TimeTrackingPage() {
  const { isOnline } = useOfflineStore();
  const { user } = useAuthStore();
  const [activeLog, setActiveLog] = useState<TimeLog | null>(null);
  const [recentLogs, setRecentLogs] = useState<TimeLog[]>([]);
  const [assignedWorkOrders, setAssignedWorkOrders] = useState<WorkOrderType[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadRecentLogs();
    checkActiveLog();
    if (user && isOnline) {
      loadAssignedWorkOrders();
    }
  }, [user, isOnline]);

  const checkActiveLog = async () => {
    try {
      if (isOnline) {
        // Check for active time log from API
        const response = await apiClient.get("/workorders/time-logs/active/");
        if (response.data) {
          setActiveLog(response.data);
        }
      } else {
        // Check cache for active log
        const logs = await timeLogsDB.getAll();
        const active = logs.find((log) => log.clock_in && !log.clock_out);
        if (active) {
          setActiveLog(active);
        }
      }
    } catch (error: any) {
      // 404 is expected when no active time log exists - silently ignore
      if (error?.response?.status !== 404) {
        console.error("Failed to check active log:", error);
      }
      setActiveLog(null);
    }
  };

  const loadRecentLogs = async () => {
    try {
      if (isOnline) {
        const response = await apiClient.get("/workorders/time-logs/", {
          params: { 
            limit: 10, 
            ordering: "-clock_in", 
            ...(user?.id ? { technician: user.id } : {})
          },
        });
        const logs = response.data.results || response.data || [];
        setRecentLogs(Array.isArray(logs) ? logs : []);

        // Cache logs
        for (const log of Array.isArray(logs) ? logs : []) {
          await timeLogsDB.set(log.id, log, true);
        }
      } else {
        const cached = await timeLogsDB.getAll();
        setRecentLogs(cached.filter(log => log.technician === user?.id).slice(0, 10));
      }
    } catch (error) {
      console.error("Failed to load time logs:", error);
    }
  };

  const loadAssignedWorkOrders = async () => {
    if (!user) return;
    try {
      const response = await workordersApi.list({
        primary_technician: user.id,
        status: 'assigned,in_progress' // Note: This might need backend support for comma-separated status
      });
      // Filter for active ones as fallback if backend doesn't support comma
      const results = response.results || [];
      const active = results.filter(wo => wo.status === 'assigned' || wo.status === 'in_progress');
      setAssignedWorkOrders(active);
    } catch (error) {
      console.error("Failed to load assigned work orders:", error);
    }
  };

  const handleClockIn = async (workOrderId: number) => {
    setLoading(true);
    try {
      const timeLog = {
        work_order: workOrderId,
        clock_in: new Date().toISOString(),
        description: "Started work",
      };

      if (isOnline) {
        const response = await apiClient.post("/workorders/time-logs/", timeLog);
        setActiveLog(response.data);
      } else {
        const tempId = Date.now();
        const logWithId = { ...timeLog, id: tempId };
        await timeLogsDB.set(tempId, logWithId, false);
        await queueRequest("create", "/workorders/time-logs/", "POST", timeLog);
        setActiveLog(logWithId);
      }

      toast.success("Clocked in successfully");
      await loadRecentLogs();
    } catch (error) {
      console.error("Failed to clock in:", error);
      toast.error("Failed to clock in");
    } finally {
      setLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!activeLog) return;

    setLoading(true);
    try {
      const clockOut = new Date().toISOString();
      const duration = calculateDuration(activeLog.clock_in, clockOut);

      if (isOnline && activeLog.id) {
        await apiClient.post(`/workorders/time-logs/${activeLog.id}/clock_out/`, {
          clock_out: clockOut,
        });
      } else {
        const updated = {
          ...activeLog,
          clock_out: clockOut,
          duration_hours: duration,
        };
        await timeLogsDB.set(activeLog.id || Date.now(), updated, false);
        if (activeLog.id) {
          await queueRequest("update", `/workorders/time-logs/${activeLog.id}/`, "PATCH", {
            clock_out: clockOut,
            duration_hours: duration,
          });
        }
      }

      setActiveLog(null);
      toast.success("Clocked out successfully");
      await loadRecentLogs();
    } catch (error) {
      console.error("Failed to clock out:", error);
      toast.error("Failed to clock out");
    } finally {
      setLoading(false);
    }
  };

  const calculateDuration = (clockIn: string, clockOut: string): number => {
    const start = new Date(clockIn);
    const end = new Date(clockOut);
    const diffMs = end.getTime() - start.getTime();
    return diffMs / (1000 * 60 * 60); // Convert to hours
  };

  const formatDuration = (hours?: number): string => {
    if (!hours) return "0h 0m";
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Time Tracking
        </h2>
        <Button size="sm" variant="outline" onClick={loadRecentLogs} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Active Time Log */}
      {activeLog && (
        <Card className="border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 animate-pulse-border ring-1 ring-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.3)]">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-orange-700 dark:text-orange-400">
              <Clock className="h-5 w-5 animate-pulse" />
              Currently Clocked In
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500 uppercase font-semibold mb-1">
                  Work Order
                </div>
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  {activeLog.work_order_number || `WO #${activeLog.work_order}`}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase font-semibold mb-1">
                  Started At
                </div>
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  {new Date(activeLog.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 p-4 rounded-lg flex flex-col items-center justify-center border border-orange-100 dark:border-orange-900/50">
              <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider">Elapsed Time</div>
              <div className="font-mono text-3xl font-bold text-orange-600 dark:text-orange-400">
                {formatDuration(
                  activeLog.duration_hours ||
                  calculateDuration(activeLog.clock_in, new Date().toISOString())
                )}
              </div>
            </div>

            <Button
              onClick={handleClockOut}
              disabled={loading}
              className="w-full bg-red-600 hover:bg-red-700 text-white"
              size="lg"
            >
              <Square className="h-4 w-4 mr-2fill-current" />
              Clock Out
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Assigned Work Orders (Only show if not clocked in) */}
      {!activeLog && assignedWorkOrders.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider ml-1">
            Ready for Work
          </h3>
          <div className="space-y-3">
            {assignedWorkOrders.map((wo) => (
              <Card key={wo.id} className="overflow-hidden hover:border-primary/50 transition-colors">
                <div className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-lg text-gray-900 dark:text-white">
                      {wo.work_order_number || `WO #${wo.id}`}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                      <span>{wo.vehicle_info || "Vehicle"}</span>
                      {wo.status && (
                        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs uppercase font-semibold">
                          {wo.status.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    onClick={() => handleClockIn(wo.id)}
                    disabled={loading}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Play className="h-4 w-4 mr-1 fill-current" />
                    Start
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Recent Time Logs */}
      <div className="space-y-2 pt-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider ml-1">
          Recent Activity
        </h3>
        <Card className="bg-transparent border-none shadow-none">
          <CardContent className="p-0">
            {recentLogs.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4 italic">
                No recent time logs
              </p>
            ) : (
              <div className="space-y-2">
                {recentLogs.map((log) => (
                  <div
                    key={log.id || Math.random()}
                    className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 dark:text-white text-sm">
                          {log.work_order_number || `WO #${log.work_order}`}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {new Date(log.clock_in).toLocaleDateString()} • {new Date(log.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-semibold text-gray-900 dark:text-gray-200">
                          {formatDuration(log.duration_hours)}
                        </div>
                        {!log.synced && (
                          <div className="text-[10px] text-orange-600 dark:text-orange-400 font-medium">
                            Pending Sync
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
