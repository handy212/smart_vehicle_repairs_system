"use client";

import { useQuery } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers";
import { vehiclesApi } from "@/lib/api/vehicles";
import { appointmentsApi } from "@/lib/api/appointments";
import { workordersApi } from "@/lib/api/workorders";
import { reportingApi } from "@/lib/api/reporting";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
import { InventoryWatchlist } from "./components/InventoryWatchlist";
import { ServiceReminders } from "./components/ServiceReminders";
import { SmartDiagnosisFeed } from "./components/SmartDiagnosisFeed";
import { AdvancedWidget } from "./components/AdvancedWidget";

// Lazy load heavy chart components
const RevenueAreaChart = dynamic(() => import("./components/RevenueAreaChart"), {
  loading: () => <div className="flex items-center justify-center h-[200px] text-muted-foreground">Loading chart...</div>,
  ssr: false,
});

const WorkOrderPieChart = dynamic(() => import("./components/WorkOrderPieChart"), {
  loading: () => <div className="flex items-center justify-center h-[200px] text-muted-foreground">Loading chart...</div>,
  ssr: false,
});

export default function DashboardPage() {
  // Fetch dashboard overview from reporting API
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: dashboardData, isLoading: dashboardLoading, error: dashboardError } = useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: () => reportingApi.dashboard(),
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch revenue data for charts (last 7 days)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: revenueData, error: revenueError } = useQuery({
    queryKey: ["dashboard", "revenue"],
    queryFn: () => {
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 7);
      return reportingApi.revenue({
        start_date: format(startDate, "yyyy-MM-dd"),
        end_date: format(today, "yyyy-MM-dd"),
        period: "daily",
      });
    },
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 10 * 60 * 1000,
  });

  // Fetch work order statistics
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    staleTime: 10 * 60 * 1000,
  });

  // Fetch low stock items
  const { data: lowStockData, isLoading: lowStockLoading } = useQuery({
    queryKey: ["dashboard", "low-stock"],
    queryFn: () => reportingApi.lowStock(),
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch service due report
  const { data: serviceDueData, isLoading: serviceDueLoading } = useQuery({
    queryKey: ["dashboard", "service-due"],
    queryFn: () => reportingApi.serviceDue(),
    staleTime: 15 * 60 * 1000,
  });

  const { data: todayAppointments } = useQuery({
    queryKey: ["appointments", "today"],
    queryFn: () => appointmentsApi.today(),
    staleTime: 2 * 60 * 1000,
  });

  const { data: activeWorkOrders } = useQuery({
    queryKey: ["workorders", "active"],
    queryFn: () => workordersApi.active(),
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 2 * 60 * 1000,
  });

  // Fetch counts only (using select to avoid storing the full paginated result)
  const { data: customerCount } = useQuery({
    queryKey: ["customers", "count"],
    queryFn: () => customersApi.list({ page: 1 }),
    select: (data) => data?.count || 0,
    staleTime: 10 * 60 * 1000,
  });

  const { data: vehicleCount } = useQuery({
    queryKey: ["vehicles", "count"],
    queryFn: () => vehiclesApi.list({ page: 1 }),
    select: (data) => data?.count || 0,
    staleTime: 10 * 60 * 1000,
  });

  const isLoading = dashboardLoading;

  // Memoize expensive calculations
  const stats = useMemo(
    () => ({
      total_customers: customerCount || 0,
      total_vehicles: vehicleCount || 0,
      today_appointments: dashboardData?.today?.appointments || todayAppointments?.length || 0,
      today_revenue: dashboardData?.today?.revenue || 0,
      week_revenue: dashboardData?.week?.revenue || 0,
      month_revenue: dashboardData?.month?.revenue || 0,
      active_work_orders: dashboardData?.alerts?.active_work_orders || activeWorkOrders?.length || 0,
      overdue_invoices: dashboardData?.alerts?.overdue_invoices?.count || 0,
      overdue_amount: dashboardData?.alerts?.overdue_invoices?.total || 0,
      low_stock_items: dashboardData?.alerts?.low_stock_items || lowStockData?.summary?.total_low_stock || 0,
      active_subscriptions: dashboardData?.subscriptions?.active_count || 0,
      active_roadside: dashboardData?.today?.roadside_requests || 0,
      mrr: dashboardData?.subscriptions?.mrr || 0,
      arr: dashboardData?.subscriptions?.arr || 0,
    }),
    [
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

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-4 p-4 max-w-[1700px] mx-auto pb-10">
      <DynamicPageTitle title="Command Center" />
      <DashboardHeader />

      {/* Global Vital Stats Summary */}
      <SummaryStatsGrid stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* LEFT COLUMN: Operations & Flow (60%) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {/* Main Operational Hub */}
          <ShopPulse workOrderStats={workOrderStats} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Financial Intelligence Wing */}
            <AdvancedWidget
              title="Revenue Intelligence"
              icon="TrendingUp"
            >
              <RevenueAreaChart data={revenueChartData} />
            </AdvancedWidget>

            {/* Operational Spread */}
            <AdvancedWidget
              title="Workload Distribution"
              icon="PieChart"
            >
              <WorkOrderPieChart data={workOrderStats?.by_status || []} />
            </AdvancedWidget>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Supply Chain & Parts */}
            <InventoryWatchlist items={lowStockData?.items || []} isLoading={lowStockLoading} />

            {/* Service Intelligence */}
            <ServiceReminders vehicles={serviceDueData?.vehicles || []} isLoading={serviceDueLoading} />
          </div>
        </div>

        {/* RIGHT COLUMN: Real-time Feeds & Activity (40%) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <SmartDiagnosisFeed
            isLoading={false}
            logs={dashboardData?.recent_activity?.work_orders?.slice(0, 5).map((wo: { id: number; wo_number: string; diagnosis_notes?: string; status: string; created_at: string }) => ({
              id: wo.id,
              work_order_number: wo.wo_number,
              description: wo.diagnosis_notes
                ? `AI Analysis: ${wo.diagnosis_notes}`
                : `Status Update: ${wo.status.replace(/_/g, ' ').toUpperCase()}`,
              priority: wo.status === 'diagnosis' ? 'warning' : 'info',
              timestamp: wo.created_at
            })) || []}
          />

          <AdvancedWidget title="Live Workshop Activity" icon="Activity">
            <CompactActivityList
              appointments={todayAppointments}
              workOrders={dashboardData?.recent_activity?.work_orders}
            />
          </AdvancedWidget>
        </div>
      </div>
    </div>
  );
}
