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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Administration</h1>
        <p className="text-sm text-gray-500 mt-1">Manage users, settings, and system configuration</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUsers}</div>
            <p className="text-xs text-gray-500 mt-1">All registered users</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <UserCheck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeUsers}</div>
            <p className="text-xs text-gray-500 mt-1">Currently active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactive Users</CardTitle>
            <UserX className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{inactiveUsers}</div>
            <p className="text-xs text-gray-500 mt-1">Disabled accounts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Staff Members</CardTitle>
            <Shield className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{staffCount}</div>
            <p className="text-xs text-gray-500 mt-1">Admin, Manager, Technician, etc.</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>User Management</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              Manage user accounts, roles, and permissions
            </p>
            <Link href="/admin/users">
              <Button className="w-full">Manage Users</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              Configure system-wide settings and preferences
            </p>
            <Link href="/admin/settings">
              <Button className="w-full"variant="secondary">
                <Settings className="w-4 h-4 mr-2" />
                System Settings
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Audit Log</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              View system activity and audit trail
            </p>
            <Link href="/admin/audit-log">
              <Button className="w-full"variant="secondary">
                <FileText className="w-4 h-4 mr-2" />
                View Audit Log
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subscription Management</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              Manage subscription packages and customer subscriptions
            </p>
            <div className="space-y-2">
              <Link href="/subscriptions/packages">
                <Button className="w-full" variant="secondary">
                  <Package className="w-4 h-4 mr-2" />
                  Manage Packages
                </Button>
              </Link>
              <Link href="/subscriptions">
                <Button className="w-full" variant="outline">
                  <CreditCard className="w-4 h-4 mr-2" />
                  View Subscriptions
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Users by Role */}
      <Card>
        <CardHeader>
          <CardTitle>Users by Role</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(roleCounts).map(([role, count]) => (
              <div key={role} className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900">{count}</div>
                <div className="text-sm text-gray-600 capitalize mt-1">{role.replace("_", " ")}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Audit Logs</CardTitle>
          </CardHeader>
          <CardContent>
            {dashboardStats?.recent_logs && dashboardStats.recent_logs.length > 0 ? (
              <div className="space-y-3">
                {dashboardStats.recent_logs.slice(0, 5).map((log) => (
                  <div key={log.id} className="text-sm border-b border-gray-200 pb-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{log.user_name || log.user_email || "System"}</span>
                      <span className="text-xs text-gray-500">
                        {format(new Date(log.timestamp), "MMM dd, HH:mm")}
                      </span>
                    </div>
                    <p className="text-gray-600 mt-1">
                      {log.action} - {log.model_name || "N/A"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No recent activity</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Backups</CardTitle>
          </CardHeader>
          <CardContent>
            {dashboardStats?.recent_backups && dashboardStats.recent_backups.length > 0 ? (
              <div className="space-y-3">
                {dashboardStats.recent_backups.map((backup) => (
                  <div key={backup.id} className="text-sm border-b border-gray-200 pb-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium capitalize">{backup.backup_type}</span>
                      <span className={`text-xs px-2 py-1 rounded ${
                        backup.status === 'completed' ? 'bg-green-100 text-green-800' :
                        backup.status === 'failed' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {backup.status}
                      </span>
                    </div>
                    <p className="text-gray-600 mt-1">
                      {format(new Date(backup.started_at), "MMM dd, yyyy HH:mm")}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No backups found</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

