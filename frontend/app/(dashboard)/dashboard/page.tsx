"use client";

import { useQuery } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers";
import { vehiclesApi } from "@/lib/api/vehicles";
import { appointmentsApi } from "@/lib/api/appointments";
import { workordersApi } from "@/lib/api/workorders";
import { reportingApi } from "@/lib/api/reporting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PremiumIcons } from "@/components/ui/icons";
import dynamic from "next/dynamic";
import { format } from "date-fns";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { useMemo } from "react";
import { DashboardHeader } from "./components/DashboardHeader";
import { SummaryStatsGrid } from "./components/SummaryStatsGrid";
import { ShopPulse } from "./components/ShopPulse";
import { CompactActivityList } from "./components/CompactActivityList";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";

// Lazy load heavy chart components
const RevenueAreaChart = dynamic(() => import("./components/RevenueAreaChart"), {
  loading: () => <div className="flex items-center justify-center h-[200px] text-gray-500 dark:text-gray-400">Loading chart...</div>,
  ssr: false,
});

const WorkOrderPieChart = dynamic(() => import("./components/WorkOrderPieChart"), {
  loading: () => <div className="flex items-center justify-center h-[200px] text-gray-500 dark:text-gray-400">Loading chart...</div>,
  ssr: false,
});

const PaymentMethodBarChart = dynamic(() => import("./components/PaymentMethodBarChart"), {
  loading: () => <div className="flex items-center justify-center h-[200px] text-gray-500 dark:text-gray-400">Loading chart...</div>,
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
      active_subscriptions: dashboardData?.subscriptions?.active_count || 0,
      mrr: dashboardData?.subscriptions?.mrr || 0,
      arr: dashboardData?.subscriptions?.arr || 0,
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
  const revenueChartData = useMemo(
    () =>
      revenueData?.revenue_by_period?.slice(-7).map((item: { period: string | number | Date; revenue: any; }) => ({
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

  // Early return AFTER all hooks have been called
  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Header with Breadcrumbs */}
      <DynamicPageTitle title="Dashboard" />
      <DashboardHeader />

      {/* Error Banner */}
      {hasApiErrors && (
        <Card className="border-yellow-200 dark:border-yellow-900 bg-yellow-50/50 dark:bg-yellow-900/10 backdrop-blur-sm">
          <CardContent className="pt-4">
            <div className="flex items-center space-x-2 text-yellow-700 dark:text-yellow-500">
              <PremiumIcons.AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm font-medium">
                Some dashboard data is temporarily unavailable. The page will continue to load with available data.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Stats Grid */}
      <SummaryStatsGrid stats={stats} />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2/3) - Shop Operations */}
        <div className="lg:col-span-2 space-y-6">
          {/* Shop Pulse */}
          <ShopPulse workOrderStats={workOrderStats} />

          {/* Revenue Chart */}
          <Card className="border-none shadow-sm overflow-hidden bg-white/60 dark:bg-gray-900/40 backdrop-blur-md ring-1 ring-gray-900/5">
            <CardHeader className="py-4 px-6 border-b border-gray-100/50 dark:border-gray-800/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded-lg bg-emerald-100/50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                    <PremiumIcons.Receipt className="w-4 h-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold text-gray-900 dark:text-gray-100 tracking-tight">
                      Revenue Performance
                    </CardTitle>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="mb-4">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Daily revenue totals for the last 7 days.
                </p>
              </div>
              <RevenueAreaChart data={revenueChartData} />
            </CardContent>
          </Card>

          {/* Work Order Status & Payment Methods Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-none shadow-sm overflow-hidden bg-white/60 dark:bg-gray-900/40 backdrop-blur-md ring-1 ring-gray-900/5">
              <CardHeader className="py-4 px-6 border-b border-gray-100/50 dark:border-gray-800/50">
                <CardTitle className="text-base font-semibold text-gray-900 dark:text-gray-100 tracking-tight">
                  Workload Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <WorkOrderPieChart data={workOrderStats?.by_status?.map((item: { status: string; count: number }) => ({
                  status: item.status.replace(/_/g, " "),
                  count: item.count,
                })) || []} />
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm overflow-hidden bg-white/60 dark:bg-gray-900/40 backdrop-blur-md ring-1 ring-gray-900/5">
              <CardHeader className="py-4 px-6 border-b border-gray-100/50 dark:border-gray-800/50">
                <CardTitle className="text-base font-semibold text-gray-900 dark:text-gray-100 tracking-tight">
                  Payment Mix
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <PaymentMethodBarChart data={paymentMethodData} />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right Column (1/3) - Activity Feed */}
        <div className="lg:col-span-1">
          <CompactActivityList
            appointments={todayAppointments}
            workOrders={dashboardData?.recent_activity?.work_orders}
          />
        </div>
      </div>
    </div>
  );
}
