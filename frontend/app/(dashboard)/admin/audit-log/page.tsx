"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi, AuditLog } from "@/lib/api/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Search, Filter, Download } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

const ACTION_CHOICES = [
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
  { value: "login", label: "Login" },
  { value: "logout", label: "Logout" },
  { value: "view", label: "View" },
  { value: "export", label: "Export" },
  { value: "import", label: "Import" },
  { value: "settings_change", label: "Settings Change" },
  { value: "role_change", label: "Role Change" },
  { value: "permission_change", label: "Permission Change" },
];

export default function AuditLogPage() {
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const { data: logsData, isLoading } = useQuery({
    queryKey: ["admin", "audit-logs", actionFilter, searchTerm, dateFrom, dateTo, page],
    queryFn: () =>
      adminApi.auditLogs.list({
        page,
        action: actionFilter !== "all" ? actionFilter : undefined,
        search: searchTerm || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
  });

  const { data: statsData } = useQuery({
    queryKey: ["admin", "audit-logs", "stats", dateFrom, dateTo],
    queryFn: () =>
      adminApi.auditLogs.stats({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
  });

  const getActionVariant = (action: string) => {
    switch (action) {
      case "create":
        return "success";
      case "update":
        return "info";
      case "delete":
        return "danger";
      case "login":
      case "logout":
        return "secondary";
      default:
        return "default";
    }
  };

  const logs = logsData?.results || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/admin">
            <Buttonvariant="secondary">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Audit Log</h1>
            <p className="text-sm text-gray-500 mt-1">View system activity and audit trail</p>
          </div>
        </div>
      </div>

      {/* Statistics */}
      {statsData && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{statsData.total}</div>
              <p className="text-sm text-gray-500 mt-1">Total Logs</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{statsData.by_action.length}</div>
              <p className="text-sm text-gray-500 mt-1">Action Types</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{statsData.top_users.length}</div>
              <p className="text-sm text-gray-500 mt-1">Active Users</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{statsData.top_models.length}</div>
              <p className="text-sm text-gray-500 mt-1">Models Tracked</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search logs..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
              <select
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Actions</option>
                {ACTION_CHOICES.map((action) => (
                  <option key={action.value} value={action.value}>
                    {action.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Logs List */}
      <Card>
        <CardHeader>
          <CardTitle>
            Audit Logs ({logsData?.count || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length > 0 ? (
            <div className="space-y-4">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <Badge variant={getActionVariant(log.action) as any}>
                          {log.action}
                        </Badge>
                        {log.model_name && (
                          <span className="text-sm text-gray-600">{log.model_name}</span>
                        )}
                        {log.object_repr && (
                          <span className="text-sm text-gray-500">- {log.object_repr}</span>
                        )}
                      </div>
                      <div className="text-sm text-gray-700">
                        <p>
                          <span className="font-medium">User:</span>{" "}
                          {log.user_name || log.user_email || "System"}
                        </p>
                        {log.ip_address && (
                          <p>
                            <span className="font-medium">IP:</span> {log.ip_address}
                          </p>
                        )}
                        <p>
                          <span className="font-medium">Time:</span>{" "}
                          {format(new Date(log.timestamp), "MMM dd, yyyy HH:mm:ss")}
                        </p>
                      </div>
                      {log.changes && Object.keys(log.changes).length > 0 && (
                        <div className="mt-2 p-2 bg-gray-50 rounded text-xs font-mono">
                          <pre>{JSON.stringify(log.changes, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500">No audit logs found</p>
            </div>
          )}

          {/* Pagination */}
          {logsData && (logsData.next || logsData.previous) && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
              <div className="text-sm text-gray-700">
                Showing {logs.length} of {logsData.count} logs
              </div>
              <div className="flex items-center space-x-2">
                <Button
                 variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={!logsData.previous || isLoading}
                >
                  Previous
                </Button>
                <span className="text-sm text-gray-700">Page {page}</span>
                <Button
                 variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!logsData.next || isLoading}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
