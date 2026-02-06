"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, UserCheck, UserX, Shield, Settings, FileText, Database, CreditCard, Package } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function AdminDashboardPage() {
  const { data: dashboardStats, isLoading } = useQuery({
    queryKey: ["admin", "dashboard-stats"],
    queryFn: () => adminApi.dashboardStats(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const totalUsers = dashboardStats?.total_users || 0;
  const activeUsers = dashboardStats?.active_users || 0;
  const inactiveUsers = totalUsers - activeUsers;
  const staffCount = dashboardStats?.user_by_role?.reduce((sum, item) => {
    if (['admin', 'manager', 'technician', 'receptionist', 'parts_manager'].includes(item.role)) {
      return sum + item.count;
    }
    return sum;
  }, 0) || 0;

  const roleCounts = dashboardStats?.user_by_role?.reduce((acc, item) => {
    acc[item.role] = item.count;
    return acc;
  }, {} as Record<string, number>) || {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-foreground tracking-tight">Administration</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage users, settings, and system configuration</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-sm border bg-card">
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Users</span>
            <span className="text-lg font-bold text-foreground">{totalUsers}</span>
          </CardContent>
        </Card>

        <Card className="shadow-sm border bg-card">
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active</span>
            <span className="text-lg font-bold text-success">{activeUsers}</span>
          </CardContent>
        </Card>

        <Card className="shadow-sm border bg-card">
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Inactive</span>
            <span className="text-lg font-bold text-red-600 dark:text-red-400">{inactiveUsers}</span>
          </CardContent>
        </Card>

        <Card className="shadow-sm border bg-card">
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Staff</span>
            <span className="text-lg font-bold text-primary dark:text-primary">{staffCount}</span>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions - Compact */}
        <Card className="lg:col-span-2 border-border shadow-sm">
          <CardHeader className="py-4 px-6 border-b border-border">
            <CardTitle className="text-base font-bold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Link href="/admin/users">
                <Button variant="outline" className="w-full h-auto py-4 px-4 flex flex-col items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:scale-[1.02]">
                  <div className="w-8 h-8 rounded-full bg-primary/10 dark:bg-orange-900/20 flex items-center justify-center mb-1">
                    <Users className="h-4 w-4 text-primary dark:text-primary" />
                  </div>
                  <div className="text-center">
                    <span className="font-semibold text-sm block">Users</span>
                    <span className="text-[10px] text-muted-foreground font-normal">Manage accounts</span>
                  </div>
                </Button>
              </Link>
              <Link href="/admin/settings">
                <Button variant="outline" className="w-full h-auto py-4 px-4 flex flex-col items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:scale-[1.02]">
                  <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center mb-1">
                    <Settings className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                  </div>
                  <div className="text-center">
                    <span className="font-semibold text-sm block">Settings</span>
                    <span className="text-[10px] text-muted-foreground font-normal">System config</span>
                  </div>
                </Button>
              </Link>
              <Link href="/admin/audit-log">
                <Button variant="outline" className="w-full h-auto py-4 px-4 flex flex-col items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:scale-[1.02]">
                  <div className="w-8 h-8 rounded-full bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center mb-1">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div className="text-center">
                    <span className="font-semibold text-sm block">Audit Log</span>
                    <span className="text-[10px] text-muted-foreground font-normal">View history</span>
                  </div>
                </Button>
              </Link>
              <Link href="/subscriptions">
                <Button variant="outline" className="w-full h-auto py-4 px-4 flex flex-col items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:scale-[1.02]">
                  <div className="w-8 h-8 rounded-full bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center mb-1">
                    <CreditCard className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="text-center">
                    <span className="font-semibold text-sm block">Subscriptions</span>
                    <span className="text-[10px] text-muted-foreground font-normal">Manage plans</span>
                  </div>
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Roles Distribution - Compact */}
        <Card className="border-border shadow-sm">
          <CardHeader className="py-4 px-6 border-b border-border">
            <CardTitle className="text-base font-bold">Staff Overview</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 gap-3">
              {Object.entries(roleCounts).slice(0, 6).map(([role, count]) => (
                <div key={role} className="flex justify-between items-center p-3 bg-muted rounded-lg border border-border">
                  <div className="flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-sm font-medium capitalize text-card-foreground">{role.replace("_", " ")}</span>
                  </div>
                  <Badge variant="secondary" className="font-bold">{count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border shadow-sm">
          <CardHeader className="py-4 px-6 border-b border-border flex flex-row items-center justify-between">
            <CardTitle className="text-base font-bold">Recent Audit Logs</CardTitle>
            <Link href="/admin/audit-log">
              <Button variant="ghost" size="sm" className="h-8 text-xs">View All</Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {dashboardStats?.recent_logs && dashboardStats.recent_logs.length > 0 ? (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {dashboardStats.recent_logs.slice(0, 5).map((log) => (
                  <div key={log.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center space-x-2">
                        <span className={cn("w-2 h-2 rounded-full",
                          log.action === 'create' ? 'bg-success/100' :
                            log.action === 'update' ? 'bg-primary' :
                              log.action === 'delete' ? 'bg-red-500' : 'bg-gray-500'
                        )}></span>
                        <span className="text-xs font-bold text-foreground">{log.user_name || "System"}</span>
                      </div>
                      <span className="text-[10px] text-gray-400 font-mono">
                        {format(new Date(log.timestamp), "HH:mm")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pl-4">
                      <p className="text-xs text-muted-foreground truncate max-w-[200px] capitalize font-medium">
                        {log.action} {log.model_name}
                      </p>
                      <Badge variant="outline" className="text-[10px] max-w-[120px] truncate font-mono">
                        {log.object_repr}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm p-8 text-center italic">No recent activity</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="py-4 px-6 border-b border-border">
            <CardTitle className="text-base font-bold">Recent Backups</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {dashboardStats?.recent_backups && dashboardStats.recent_backups.length > 0 ? (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {dashboardStats.recent_backups.map((backup) => (
                  <div key={backup.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                    <div>
                      <div className="flex items-center space-x-2">
                        <Database className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-sm font-semibold capitalize text-foreground">{backup.backup_type} Backup</span>
                      </div>
                      <span className="text-[10px] text-gray-500 pl-5 block mt-0.5">
                        {format(new Date(backup.started_at), "MMM dd, yyyy • HH:mm")}
                      </span>
                    </div>
                    <Badge variant={
                      backup.status === 'completed' ? 'success' :
                        backup.status === 'failed' ? 'danger' : 'warning'
                    }>
                      {backup.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm p-8 text-center italic">No recent backups found</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

