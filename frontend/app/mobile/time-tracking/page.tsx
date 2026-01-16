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
  const [activeLog, setActiveLog] = useState<TimeLog | null>(null);
  const [recentLogs, setRecentLogs] = useState<TimeLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadRecentLogs();
    checkActiveLog();
  }, []);

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
          params: { limit: 10, ordering: "-clock_in" },
        });
        const logs = response.data.results || response.data || [];
        setRecentLogs(Array.isArray(logs) ? logs : []);

        // Cache logs
        for (const log of Array.isArray(logs) ? logs : []) {
          await timeLogsDB.set(log.id, log, true);
        }
      } else {
        const cached = await timeLogsDB.getAll();
        setRecentLogs(cached.slice(0, 10));
      }
    } catch (error) {
      console.error("Failed to load time logs:", error);
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
      await loadRecentLogs();
    } catch (error) {
      console.error("Failed to clock in:", error);
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
        await apiClient.patch(`/workorders/time-logs/${activeLog.id}/`, {
          clock_out: clockOut,
          duration_hours: duration,
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
      await loadRecentLogs();
    } catch (error) {
      console.error("Failed to clock out:", error);
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
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Time Tracking
        </h2>
        <Button size="sm" variant="outline" onClick={loadRecentLogs} disabled={loading}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Active Time Log */}
      {activeLog && (
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Currently Clocked In
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Work Order
              </div>
              <div className="font-medium text-gray-900 dark:text-white">
                {activeLog.work_order_number || `WO #${activeLog.work_order}`}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Started At
              </div>
              <div className="font-medium text-gray-900 dark:text-white">
                {new Date(activeLog.clock_in).toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Duration
              </div>
              <div className="font-semibold text-lg text-blue-600 dark:text-blue-400">
                {formatDuration(
                  activeLog.duration_hours ||
                  calculateDuration(activeLog.clock_in, new Date().toISOString())
                )}
              </div>
            </div>
            <Button
              onClick={handleClockOut}
              disabled={loading}
              className="w-full"
              variant="destructive"
            >
              <Square className="h-4 w-4 mr-2" />
              Clock Out
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Recent Time Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Time Logs</CardTitle>
        </CardHeader>
        <CardContent>
          {recentLogs.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
              No time logs found
            </p>
          ) : (
            <div className="space-y-2">
              {recentLogs.map((log) => (
                <div
                  key={log.id || Math.random()}
                  className="p-3 rounded-lg border border-gray-200 dark:border-gray-800"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {log.work_order_number || `WO #${log.work_order}`}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {new Date(log.clock_in).toLocaleString()}
                        {log.clock_out && ` - ${new Date(log.clock_out).toLocaleString()}`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-gray-900 dark:text-white">
                        {formatDuration(log.duration_hours)}
                      </div>
                      {!log.synced && (
                        <div className="text-xs text-orange-600 dark:text-orange-400">
                          Pending sync
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
  );
}
