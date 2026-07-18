"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Clock, Timer } from "lucide-react";
import { timeLogsApi, type TimeLog } from "@/lib/api/timeLogs";
import { hrApi, type AttendanceRecord } from "@/lib/api/hr";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PermissionGuard } from "@/components/auth/PermissionGuard";

function normalizeLogs(data: Awaited<ReturnType<typeof timeLogsApi.list>>): TimeLog[] {
  if (Array.isArray(data)) return data;
  return data.results ?? [];
}

function formatHours(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return `${n.toFixed(2)}h`;
}

function formatTime(value?: string | null) {
  if (!value) return "—";
  return format(new Date(value), "HH:mm");
}

export function TechnicianTimeOverview({
  userId,
  staffId,
}: {
  userId: number;
  staffId?: number | null;
}) {
  const { data: laborLogs = [], isLoading: laborLoading } = useQuery({
    queryKey: ["technician-labor-logs", userId],
    queryFn: async () => normalizeLogs(await timeLogsApi.list({ technician: userId })),
    enabled: !!userId,
  });

  const { data: attendance = [], isLoading: attendanceLoading } = useQuery({
    queryKey: ["technician-hr-attendance", staffId],
    queryFn: async () => {
      const res = await hrApi.attendance.list({ staff: staffId!, ordering: "-date" });
      return res.data.results ?? [];
    },
    enabled: !!staffId,
  });

  const recentLabor = laborLogs.slice(0, 8);
  const recentAttendance = (attendance as AttendanceRecord[]).slice(0, 8);
  const openLabor = laborLogs.find((l) => l.clock_in && !l.clock_out);
  const weekLaborHours = laborLogs.reduce((sum, log) => {
    const n =
      typeof log.duration_hours === "string"
        ? Number(log.duration_hours)
        : (log.duration_hours ?? 0);
    return sum + (Number.isNaN(n) ? 0 : n);
  }, 0);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Card>
        <CardHeader className="px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Timer className="h-4 w-4" />
                Labor Time
              </CardTitle>
              <CardDescription className="text-xs">
                Per work-order / task timers (diagnosis &amp; repair)
              </CardDescription>
            </div>
            {openLabor ? (
              <Badge variant="default">On job</Badge>
            ) : (
              <Badge variant="secondary">Idle</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4">
          <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Logged (recent list): </span>
            <span className="font-medium">{formatHours(weekLaborHours)}</span>
          </div>
          {laborLoading ? (
            <p className="text-xs text-muted-foreground">Loading labor…</p>
          ) : recentLabor.length === 0 ? (
            <p className="text-xs text-muted-foreground">No labor logs yet.</p>
          ) : (
            <ul className="space-y-2">
              {recentLabor.map((log) => (
                <li
                  key={log.id}
                  className="flex items-start justify-between gap-2 border-b border-border/60 pb-2 text-xs last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {log.work_order_number
                        ? `WO #${log.work_order_number}`
                        : `WO ${log.work_order}`}
                      {log.task_description ? ` · ${log.task_description}` : ""}
                    </p>
                    <p className="text-muted-foreground">
                      {format(new Date(log.clock_in), "MMM d")} · {formatTime(log.clock_in)}
                      {" – "}
                      {log.clock_out ? formatTime(log.clock_out) : "active"}
                    </p>
                  </div>
                  <span className="shrink-0 font-medium">
                    {log.clock_out ? formatHours(log.duration_hours) : "…"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <PermissionGuard permissions={["view_hr", "manage_hr"]} fallback={null}>
        <Card>
          <CardHeader className="px-4 py-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Clock className="h-4 w-4" />
              HR Attendance
            </CardTitle>
            <CardDescription className="text-xs">
              Daily shift clock (payroll) — separate from job labor
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4">
            {!staffId ? (
              <p className="text-xs text-muted-foreground">
                No linked staff profile — HR attendance unavailable.
              </p>
            ) : attendanceLoading ? (
              <p className="text-xs text-muted-foreground">Loading attendance…</p>
            ) : recentAttendance.length === 0 ? (
              <p className="text-xs text-muted-foreground">No attendance records yet.</p>
            ) : (
              <ul className="space-y-2">
                {recentAttendance.map((rec) => (
                  <li
                    key={rec.id}
                    className="flex items-center justify-between gap-2 border-b border-border/60 pb-2 text-xs last:border-0 last:pb-0"
                  >
                    <div>
                      <p className="font-medium">
                        {format(new Date(rec.date), "MMM d, yyyy")}
                      </p>
                      <p className="text-muted-foreground">
                        {formatTime(rec.clock_in)} – {formatTime(rec.clock_out)}
                      </p>
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {rec.status || "—"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </PermissionGuard>
    </div>
  );
}
