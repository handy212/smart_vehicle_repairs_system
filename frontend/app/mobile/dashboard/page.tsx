"use client";

import { useState, useEffect } from "react";
import { workordersApi, WorkOrder } from "@/lib/api/workorders";
import { useOfflineStore } from "@/store/offlineStore";
import { workOrdersDB } from "@/lib/offline/db";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  Wrench,
  Clock,
  CheckCircle,
  AlertCircle,
  Play,
  ClipboardCheck,
  Pause,
  Square,
  Truck,
} from "lucide-react";
import apiClient from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function MobileDashboardPage() {
  const { isOnline, sync, isSyncing } = useOfflineStore();
  const router = useRouter();
  const [stats, setStats] = useState({
    total: 0,
    in_progress: 0,
    assigned: 0,
    completed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [activeWorkOrders, setActiveWorkOrders] = useState<WorkOrder[]>([]);
  const [recentWorkOrders, setRecentWorkOrders] = useState<any[]>([]);
  const [activeLog, setActiveLog] = useState<any | null>(null);

  useEffect(() => {
    loadData();
    checkActiveLog();
  }, []);

  const checkActiveLog = async () => {
    try {
      if (isOnline) {
        const response = await apiClient.get("/workorders/time-logs/active/");
        setActiveLog(response.data);
      }
    } catch (error) {
      setActiveLog(null);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      if (isOnline) {
        // Load from API
        // Fetch stats
        const statsData = await workordersApi.dashboardStats();
        setStats({
          total: statsData.total_workorders || 0,
          in_progress: statsData.in_progress || 0,
          assigned: statsData.pending || 0,
          completed: statsData.completed || 0,
        });


        // Fetch active work orders
        const allWOsResponse = await workordersApi.list({
          page: 1,
        });
        const woResults = allWOsResponse.results || [];
        const activeWOs = woResults.filter(wo =>
          wo.status === 'in_progress' || wo.status === 'assigned'
        ).slice(0, 5);
        setActiveWorkOrders(activeWOs);

        const workOrdersData = await workordersApi.list({ page: 1, ordering: "-created_at" });
        const workOrders = workOrdersData.results || [];
        setRecentWorkOrders(workOrders.slice(0, 5));

        // Cache work orders
        for (const wo of workOrders) {
          await workOrdersDB.set(wo.id, wo, true);
        }
      } else {
        // Load from cache
        const cachedWorkOrders = await workOrdersDB.getAll();
        setRecentWorkOrders(cachedWorkOrders.slice(0, 5));

        // Calculate stats from cached data
        setStats({
          total: cachedWorkOrders.length,
          in_progress: cachedWorkOrders.filter((wo) => wo.status === "in_progress")
            .length,
          assigned: cachedWorkOrders.filter((wo) => wo.status === "assigned")
            .length,
          completed: cachedWorkOrders.filter((wo) => wo.status === "completed")
            .length,
        });
        // For offline, active work orders are just in_progress or assigned
        setActiveWorkOrders(cachedWorkOrders.filter(wo => wo.status === "in_progress" || wo.status === "assigned").slice(0, 5));
      }
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    await sync();
    await loadData();
  };

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            Dashboard
          </h2>
          <p className="text-sm text-muted-foreground">
            {isOnline ? "Online" : "Offline Mode"}
          </p>
        </div>
        {isOnline && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleSync}
            disabled={isSyncing}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isSyncing ? "animate-spin" : ""}`}
            />
            Sync
          </Button>
        )}
      </div>

      {/* Active Time Log Widget */}
      {activeLog && (
        <Card className="border-primary/50 bg-primary/5 dark:bg-primary/10">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-full animate-pulse">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">
                  Currently Clocked In
                </div>
                <div className="text-xs text-gray-500">
                  {activeLog.work_order_number || `WO #${activeLog.work_order}`}
                </div>
              </div>
            </div>
            <Link href="/mobile/time-tracking">
              <Button size="sm">View</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          <Button
            onClick={() => router.push('/mobile/time-tracking')}
            className="h-auto py-4 flex-col gap-2"
          >
            <Clock className="h-5 w-5" />
            <span className="text-sm font-medium">Time Tracking</span>
          </Button>
          <Button
            onClick={() => {
              if (activeWorkOrders.length > 0) {
                router.push(`/mobile/workorders/${activeWorkOrders[0].id}`);
              }
            }}
            disabled={activeWorkOrders.length === 0}
            variant="outline"
            className="h-auto py-4 flex-col gap-2"
          >
            <Play className="h-5 w-5" />
            <span className="text-sm font-medium">Start Next</span>
          </Button>
        </CardContent>
      </Card>

      {/* My Active Work Orders */}
      {activeWorkOrders.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">My Active Work Orders</CardTitle>
              <Link href="/mobile/workorders">
                <Button variant="ghost" size="sm" className="h-8 text-xs">
                  View All
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {activeWorkOrders.map((wo) => (
              <Link key={wo.id} href={`/mobile/workorders/${wo.id}`}>
                <div className="p-3 rounded-lg border border-border hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <div className="flex items-start justify-between mb-1">
                    <div className="font-medium text-sm text-foreground">
                      {wo.work_order_number || `WO #${wo.id}`}
                    </div>
                    <Badge
                      className={cn(
                        'text-xs',
                        wo.status === 'in_progress'
                          ? 'bg-orange-100 text-primary'
                          : 'bg-yellow-100 text-yellow-700'
                      )}
                    >
                      {wo.status === 'in_progress' ? 'In Progress' : 'Assigned'}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {wo.vehicle_display || wo.vehicle_info || 'Vehicle'}
                  </div>
                  {wo.customer_name && (
                    <div className="text-xs text-gray-500 mt-1">
                      {wo.customer_name}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {stats.total}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <Wrench className="h-4 w-4" />
              In Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary dark:text-primary">
              {stats.in_progress}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {stats.assigned}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <CheckCircle className="h-4 w-4" />
              Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">
              {stats.completed}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Link href="/mobile/workorders?status=in_progress">
            <Button variant="outline" className="w-full justify-start">
              <Wrench className="h-4 w-4 mr-2" />
              View Active Work Orders
            </Button>
          </Link>
          <Link href="/mobile/inspections">
            <Button variant="outline" className="w-full justify-start">
              <ClipboardCheck className="h-4 w-4 mr-2" />
              New Inspection
            </Button>
          </Link>
          <Link href="/mobile/time-tracking">
            <Button variant="outline" className="w-full justify-start">
              <Clock className="h-4 w-4 mr-2" />
              Time Tracking
            </Button>
          </Link>
          <Link href="/mobile/roadside">
            <Button variant="outline" className="w-full justify-start">
              <Truck className="h-4 w-4 mr-2" />
              Roadside Requests
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Recent Work Orders */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Work Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {recentWorkOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No work orders found
            </p>
          ) : (
            <div className="space-y-2">
              {recentWorkOrders.map((wo) => (
                <Link
                  key={wo.id}
                  href={`/mobile/workorders/${wo.id}`}
                  className="block p-3 rounded-lg border border-border hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-foreground">
                        {wo.work_order_number || `WO #${wo.id}`}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {wo.vehicle_display || wo.vehicle_info || "Vehicle"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "px-2 py-1 rounded text-xs font-medium",
                          wo.status === "in_progress" &&
                          "bg-orange-100 text-primary dark:bg-orange-900 dark:text-orange-300",
                          wo.status === "assigned" &&
                          "bg-orange-100 text-primary dark:bg-orange-900 dark:text-orange-300",
                          wo.status === "completed" &&
                          "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                        )}
                      >
                        {wo.status?.replace("_", " ").toUpperCase()}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
          {recentWorkOrders.length > 0 && (
            <Link href="/mobile/workorders">
              <Button variant="ghost" className="w-full mt-2">
                View All Work Orders
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

