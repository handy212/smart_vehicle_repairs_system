"use client";

import { useQuery } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers";
import { vehiclesApi } from "@/lib/api/vehicles";
import { appointmentsApi } from "@/lib/api/appointments";
import { workordersApi } from "@/lib/api/workorders";
import { reportingApi } from "@/lib/api/reporting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Car, Calendar, Wrench, DollarSign, Package, TrendingUp, AlertTriangle } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { useMemo } from "react";
import { StatCard } from "./components/StatCard";

// Lazy load heavy chart components
const RevenueAreaChart = dynamic(() => import("./components/RevenueAreaChart"), {
  loading: () => <div className="flex items-center justify-center h-[300px] text-gray-500 dark:text-gray-400">Loading chart...</div>,
  ssr: false,
});

const WorkOrderPieChart = dynamic(() => import("./components/WorkOrderPieChart"), {
  loading: () => <div className="flex items-center justify-center h-[300px] text-gray-500 dark:text-gray-400">Loading chart...</div>,
  ssr: false,
});

const PaymentMethodBarChart = dynamic(() => import("./components/PaymentMethodBarChart"), {
  loading: () => <div className="flex items-center justify-center h-[300px] text-gray-500 dark:text-gray-400">Loading chart...</div>,
  ssr: false,
});

export default function DashboardPage() {
  // Fetch dashboard overview from reporting API
  const { data: dashboardData, isLoading: dashboardLoading, error: dashboardError } = useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: () => reportingApi.dashboard(),
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch revenue data for charts (last 7 days)
  const { data: revenueData, error: revenueError } = useQuery({
    queryKey: ["dashboard", "revenue"],
    queryFn: () => {
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 7); // Last 7 days
      return reportingApi.revenue({
        start_date: format(startDate, "yyyy-MM-dd"),
        end_date: format(today, "yyyy-MM-dd"),
        period: "daily",
      });
    },
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  // Fetch work order statistics
  const { data: workOrderStats, error: workOrderStatsError } = useQuery({
    queryKey: ["dashboard", "workorder-stats"],
    queryFn: () => {
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 30);
      return reportingApi.workOrderStatistics({
        start_date: format(startDate, "yyyy-MM-dd"),
        end_date: format(today, "yyyy-MM-dd"),
      });
    },
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  // Fetch low stock items
  const { data: lowStockData, error: lowStockError } = useQuery({
    queryKey: ["dashboard", "low-stock"],
    queryFn: () => reportingApi.lowStock(),
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch basic counts
  const { data: customersData } = useQuery({
    queryKey: ["customers", "dashboard"],
    queryFn: () => customersApi.list({ page: 1 }),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  const { data: vehiclesData } = useQuery({
    queryKey: ["vehicles", "dashboard"],
    queryFn: () => vehiclesApi.list({ page: 1 }),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  const { data: todayAppointments } = useQuery({
    queryKey: ["appointments", "today"],
    queryFn: () => appointmentsApi.today(),
    staleTime: 2 * 60 * 1000, // 2 minutes (more frequently updated)
  });

  const { data: activeWorkOrders, error: activeWorkOrdersError } = useQuery({
    queryKey: ["workorders", "active"],
    queryFn: () => workordersApi.active(),
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  const isLoading = dashboardLoading || !customersData || !vehiclesData;

  // Show error banner if critical APIs are failing
  const hasApiErrors = dashboardError || revenueError || activeWorkOrdersError;

  // Memoize expensive calculations
  const stats = useMemo(
    () => ({
      total_customers: customersData?.count || 0,
      total_vehicles: vehiclesData?.count || 0,
      today_appointments: dashboardData?.today?.appointments || todayAppointments?.length || 0,
      today_revenue: dashboardData?.today?.revenue || 0,
      week_revenue: dashboardData?.week?.revenue || 0,
      month_revenue: dashboardData?.month?.revenue || 0,
      active_work_orders: dashboardData?.alerts?.active_work_orders || activeWorkOrders?.length || 0,
      overdue_invoices: dashboardData?.alerts?.overdue_invoices?.count || 0,
      overdue_amount: dashboardData?.alerts?.overdue_invoices?.total || 0,
      low_stock_items: dashboardData?.alerts?.low_stock_items || lowStockData?.summary?.total_low_stock || 0,
    }),
    [
      customersData,
      vehiclesData,
      dashboardData,
      todayAppointments,
      activeWorkOrders,
      lowStockData,
    ]
  );

  // Memoize chart data preparation
  const workOrderStatusData = useMemo(
    () =>
      workOrderStats?.by_status?.map((item) => ({
        status: item.status.replace(/_/g, " "),
        count: item.count,
      })) || [],
    [workOrderStats]
  );

  const revenueChartData = useMemo(
    () =>
      revenueData?.revenue_by_period?.slice(-7).map((item) => ({
        period: item.period,
        date: format(new Date(item.period), "MMM d"),
        revenue: item.revenue || 0,
      })) || [],
    [revenueData]
  );

  const paymentMethodData = useMemo(
    () => revenueData?.revenue_by_payment_method || [],
    [revenueData]
  );

  // Memoize stat cards configuration - MUST be before any early returns
  const statCards = useMemo(
    () => [
      {
        title: "Total Customers",
        value: stats.total_customers,
        icon: Users,
        color: "bg-blue-500",
        link: "/customers",
      },
      {
        title: "Total Vehicles",
        value: stats.total_vehicles,
        icon: Car,
        color: "bg-green-500",
        link: "/vehicles",
      },
      {
        title: "Today's Appointments",
        value: stats.today_appointments,
        icon: Calendar,
        color: "bg-yellow-500",
        link: "/appointments",
      },
      {
        title: "Active Work Orders",
        value: stats.active_work_orders,
        icon: Wrench,
        color: "bg-purple-500",
        link: "/workorders",
      },
      {
        title: "Monthly Revenue",
        value: `$${parseFloat(String(stats.month_revenue || 0)).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
        icon: DollarSign,
        color: "bg-emerald-500",
        link: "/billing",
      },
      {
        title: "Low Stock Items",
        value: stats.low_stock_items,
        icon: Package,
        color: "bg-red-500",
        link: "/inventory",
        alert: stats.low_stock_items > 0,
      },
    ],
    [stats]
  );

  const alertCards = useMemo(
    () => [
      ...(stats.overdue_invoices > 0
        ? [
            {
              title: "Overdue Invoices",
              value: stats.overdue_invoices,
              amount: `$${parseFloat(String(stats.overdue_amount || 0)).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`,
              icon: AlertTriangle,
              color: "bg-red-500",
              link: "/billing",
            },
          ]
        : []),
    ],
    [stats]
  );

  // Early return AFTER all hooks have been called
  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
          Dashboard
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
          Welcome back! Here's what's happening today.
        </p>
      </div>

      {/* Error Banner */}
      {hasApiErrors && (
        <Card className="border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20">
          <CardContent className="pt-4 sm:pt-6">
            <div className="flex items-start sm:items-center space-x-2 text-yellow-800 dark:text-yellow-400">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 sm:mt-0" />
              <p className="text-xs sm:text-sm font-medium">
                Some dashboard data is temporarily unavailable. The page will continue to load with
                available data.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid - Mobile optimized */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {statCards.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </div>

      {/* Alert Cards - Mobile optimized */}
      {alertCards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {alertCards.map((alert) => {
            const Icon = alert.icon;
            const CardWrapper = alert.link ? Link : "div";
            return (
              <CardWrapper
                key={alert.title}
                href={alert.link}
                className={alert.link ? "block" : ""}
              >
                <Card
                  className={`transition-all hover:shadow-lg border-2 border-orange-300 dark:border-orange-700 ${
                    alert.link ? "cursor-pointer" : ""
                  }`}
                >
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-xs sm:text-sm font-medium text-orange-700 dark:text-orange-400">
                      {alert.title}
                    </CardTitle>
                    <div className={`${alert.color} p-2 rounded-lg`}>
                      <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {alert.value}
                    </div>
                    {alert.amount && (
                      <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {alert.amount}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </CardWrapper>
            );
          })}
        </div>
      )}

      {/* Revenue Chart - Mobile responsive */}
      <Card>
        <CardHeader className="pb-3 sm:pb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
            <div>
              <CardTitle className="text-base sm:text-lg">Revenue Trend (Last 7 Days)</CardTitle>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Daily revenue based on payment dates
              </p>
            </div>
            <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <span className="text-gray-600 dark:text-gray-400">Daily Revenue</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          <RevenueAreaChart data={revenueChartData} />
        </CardContent>
      </Card>

      {/* Charts - Mobile responsive grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Work Orders by Status */}
        <Card>
          <CardHeader className="pb-3 sm:pb-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base sm:text-lg">
                  Work Orders by Status
                </CardTitle>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Last 30 days • {workOrderStats?.summary?.total_work_orders || 0} total
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            <WorkOrderPieChart data={workOrderStatusData} />
          </CardContent>
        </Card>

        {/* Revenue by Payment Method */}
        <Card>
          <CardHeader className="pb-3 sm:pb-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base sm:text-lg">Revenue by Payment Method</CardTitle>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {revenueData?.period?.start_date && revenueData?.period?.end_date && (
                    <>
                      {format(new Date(revenueData.period.start_date), "MMM d")} -{" "}
                      {format(new Date(revenueData.period.end_date), "MMM d, yyyy")}
                    </>
                  )}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            <PaymentMethodBarChart data={paymentMethodData} />
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity - Mobile responsive */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 pb-3 sm:pb-6">
            <CardTitle className="text-base sm:text-lg">Today's Appointments</CardTitle>
            <Link
              href="/appointments"
              className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
            >
              View All
            </Link>
          </CardHeader>
          <CardContent>
            {todayAppointments && todayAppointments.length > 0 ? (
              <div className="space-y-2 sm:space-y-3">
                {todayAppointments.slice(0, 5).map((apt: any) => (
                  <Link
                    key={apt.id}
                    href={`/appointments/${apt.id}`}
                    className="flex items-center justify-between p-2 sm:p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="font-medium text-xs sm:text-sm text-gray-900 dark:text-gray-100 truncate">
                        {apt.customer_name || "N/A"}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {apt.vehicle_display || apt.vehicle_info || "N/A"} • {apt.appointment_time}
                      </p>
                    </div>
                    <Badge
                      variant={
                        apt.status === "confirmed"
                          ? "success"
                          : apt.status === "pending"
                            ? "warning"
                            : "secondary"
                      }
                      className="ml-2 flex-shrink-0 text-xs"
                    >
                      {apt.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                No appointments scheduled for today
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 pb-3 sm:pb-6">
            <CardTitle className="text-base sm:text-lg">Active Work Orders</CardTitle>
            <Link
              href="/workorders"
              className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
            >
              View All
            </Link>
          </CardHeader>
          <CardContent>
            {activeWorkOrders && activeWorkOrders.length > 0 ? (
              <div className="space-y-2 sm:space-y-3">
                {activeWorkOrders.slice(0, 5).map((wo: any) => (
                  <Link
                    key={wo.id}
                    href={`/workorders/${wo.id}`}
                    className="flex items-center justify-between p-2 sm:p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="font-medium text-xs sm:text-sm text-gray-900 dark:text-gray-100 truncate">
                        {wo.work_order_number}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {wo.customer_name || "N/A"} • {wo.vehicle_info || "N/A"}
                      </p>
                    </div>
                    <Badge
                      variant={
                        wo.status === "in_progress"
                          ? "default"
                          : wo.status === "pending"
                            ? "warning"
                            : "secondary"
                      }
                      className="ml-2 flex-shrink-0 text-xs"
                    >
                      {wo.status.replace(/_/g, " ")}
                    </Badge>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                No active work orders
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats Row - Mobile responsive */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <Card>
          <CardHeader className="pb-2 sm:pb-3">
            <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
              Today's Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
                $
                {parseFloat(String(stats.today_revenue || 0)).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8 text-green-500 flex-shrink-0" />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Revenue for today</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 sm:pb-3">
            <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
              Week Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
                $
                {parseFloat(String(stats.week_revenue || 0)).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              <DollarSign className="h-6 w-6 sm:h-8 sm:w-8 text-blue-500 flex-shrink-0" />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">This week's total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 sm:pb-3">
            <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
              Month Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
                $
                {parseFloat(String(stats.month_revenue || 0)).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8 text-emerald-500 flex-shrink-0" />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">This month's total</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

