"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserCheck, UserX, Shield, Settings, FileText, Database, CreditCard, Package } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

export default function AdminDashboardPage() {
  const { data: dashboardStats, isLoading } = useQuery({
    queryKey: ["admin", "dashboard-stats"],
    queryFn: () => adminApi.dashboardStats(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
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
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Administration</h1>
        <p className="text-xs text-gray-500 mt-0.5">Manage users, settings, and system configuration</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Users</CardTitle>
            <Users className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">{totalUsers}</div>
            <p className="text-[10px] text-muted-foreground mt-1">All registered users</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active</CardTitle>
            <UserCheck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-green-600">{activeUsers}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Currently active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Inactive</CardTitle>
            <UserX className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-red-600">{inactiveUsers}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Disabled accounts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Staff</CardTitle>
            <Shield className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-blue-600">{staffCount}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Internal roles</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Quick Actions - Compact */}
        <Card className="lg:col-span-2">
          <CardHeader className="py-3 px-4 border-b">
            <CardTitle className="text-sm font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Link href="/admin/users">
                <Button variant="outline" className="w-full justify-start h-auto py-2 px-3 text-left flex flex-col items-start gap-1 hover:bg-slate-50 border-slate-200">
                  <Users className="h-4 w-4 text-blue-600 mb-1" />
                  <span className="font-semibold text-xs">Users</span>
                  <span className="text-[10px] text-gray-500 font-normal">Manage accounts</span>
                </Button>
              </Link>
              <Link href="/admin/settings">
                <Button variant="outline" className="w-full justify-start h-auto py-2 px-3 text-left flex flex-col items-start gap-1 hover:bg-slate-50 border-slate-200">
                  <Settings className="h-4 w-4 text-slate-600 mb-1" />
                  <span className="font-semibold text-xs">Settings</span>
                  <span className="text-[10px] text-gray-500 font-normal">System config</span>
                </Button>
              </Link>
              <Link href="/admin/audit-log">
                <Button variant="outline" className="w-full justify-start h-auto py-2 px-3 text-left flex flex-col items-start gap-1 hover:bg-slate-50 border-slate-200">
                  <FileText className="h-4 w-4 text-orange-600 mb-1" />
                  <span className="font-semibold text-xs">Audit Log</span>
                  <span className="text-[10px] text-gray-500 font-normal">View history</span>
                </Button>
              </Link>
              <Link href="/subscriptions">
                <Button variant="outline" className="w-full justify-start h-auto py-2 px-3 text-left flex flex-col items-start gap-1 hover:bg-slate-50 border-slate-200">
                  <CreditCard className="h-4 w-4 text-green-600 mb-1" />
                  <span className="font-semibold text-xs">Subs</span>
                  <span className="text-[10px] text-gray-500 font-normal">Manage plans</span>
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Roles Distribution - Compact */}
        <Card>
          <CardHeader className="py-3 px-4 border-b">
            <CardTitle className="text-sm font-semibold">Staff Overview</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(roleCounts).slice(0, 6).map(([role, count]) => (
                <div key={role} className="flex justify-between items-center p-2 bg-gray-50 rounded border border-gray-100">
                  <span className="text-xs font-medium capitalize truncate">{role.replace("_", " ")}</span>
                  <span className="text-xs font-bold text-gray-700 bg-white px-1.5 py-0.5 rounded border border-gray-200 shadow-sm">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="py-3 px-4 border-b flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">Recent Audit Logs</CardTitle>
            <Link href="/admin/audit-log" className="text-xs text-blue-600 hover:underline">View All</Link>
          </CardHeader>
          <CardContent className="p-0">
            {dashboardStats?.recent_logs && dashboardStats.recent_logs.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {dashboardStats.recent_logs.slice(0, 5).map((log) => (
                  <div key={log.id} className="p-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center space-x-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${log.action === 'create' ? 'bg-green-500' :
                            log.action === 'update' ? 'bg-blue-500' :
                              log.action === 'delete' ? 'bg-red-500' : 'bg-gray-500'
                          }`}></span>
                        <span className="text-xs font-medium text-gray-900">{log.user_name || "System"}</span>
                      </div>
                      <span className="text-[10px] text-gray-400 font-mono">
                        {format(new Date(log.timestamp), "HH:mm")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pl-3.5">
                      <p className="text-xs text-gray-600 truncate max-w-[200px] capitalize">
                        {log.action} {log.model_name}
                      </p>
                      <span className="text-[10px] text-gray-400 truncate max-w-[100px]" title={log.object_repr}>
                        {log.object_repr}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-xs p-4 text-center italic">No recent activity</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3 px-4 border-b">
            <CardTitle className="text-sm font-semibold">Recent Backups</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {dashboardStats?.recent_backups && dashboardStats.recent_backups.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {dashboardStats.recent_backups.map((backup) => (
                  <div key={backup.id} className="p-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <div>
                      <div className="flex items-center space-x-2">
                        <Database className="w-3 h-3 text-gray-400" />
                        <span className="text-xs font-medium capitalize">{backup.backup_type} Backup</span>
                      </div>
                      <span className="text-[10px] text-gray-400 pl-5 block">
                        {format(new Date(backup.started_at), "MMM dd, HH:mm")}
                      </span>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${backup.status === 'completed' ? 'bg-green-50 text-green-700 border-green-100' :
                        backup.status === 'failed' ? 'bg-red-50 text-red-700 border-red-100' :
                          'bg-yellow-50 text-yellow-700 border-yellow-100'
                      }`}>
                      {backup.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-xs p-4 text-center italic">No recent backups found</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

