"use client";

import { useQuery } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers";
import { vehiclesApi } from "@/lib/api/vehicles";
import { appointmentsApi } from "@/lib/api/appointments";
import { workordersApi } from "@/lib/api/workorders";
import { reportingApi } from "@/lib/api/reporting";
import dynamic from "next/dynamic";
import { format } from "date-fns";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { useMemo } from "react";
import { SummaryStatsGrid } from "./components/SummaryStatsGrid";
import { ShopPulse } from "./components/ShopPulse";
import { ServiceReminders } from "./components/ServiceReminders";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { DashboardHeader } from "./components/DashboardHeader";
import { InventoryWatchlist } from "./components/InventoryWatchlist";
import { SmartDiagnosisFeed } from "./components/SmartDiagnosisFeed";
import { CompactActivityList } from "./components/CompactActivityList";

// Lazy load heavy chart components
const WorkOrderPieChart = dynamic(() => import("./components/WorkOrderPieChart"), {
  loading: () => <div className="flex items-center justify-center h-[200px] text-muted-foreground">Loading chart...</div>,
  ssr: false,
});

export default function DashboardPage() {
  // Fetch dashboard overview from reporting API
  const { data: dashboardData, isLoading: dashboardLoading } = useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: () => reportingApi.dashboard(),
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch work order statistics
  const { data: workOrderStats } = useQuery({
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

  // Fetch counts only
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
    }),
    [
      dashboardData,
      todayAppointments,
      activeWorkOrders,
      lowStockData,
      customerCount,
      vehicleCount
    ]
  );

  const diagnosisLogs = useMemo(() => {
    return dashboardData?.recent_activity?.work_orders?.slice(0, 5).map((wo: any) => ({
      id: wo.id,
      work_order_number: wo.wo_number,
      description: wo.diagnosis_notes
        ? `Analysis: ${wo.diagnosis_notes}`
        : `Status: ${wo.status.replace(/_/g, ' ').toUpperCase()}`,
      priority: (wo.status === 'diagnosis' ? 'warning' : 'info') as 'warning' | 'info' | 'critical',
      timestamp: wo.created_at
    })) || [];
  }, [dashboardData]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6 p-4 max-w-[1700px] mx-auto pb-10">
      <DynamicPageTitle title="Dashboard" />
      
      {/* Row 1: Header */}
      <DashboardHeader />

      {/* Row 2: Key Metrics */}
      <SummaryStatsGrid stats={stats} />

      {/* Row 3: Operational Flow (Pulse) */}
      <ShopPulse workOrderStats={workOrderStats} />

      {/* Row 4: Complex Data Grid (12-column foundation) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Workload Distribution */}
        <div className="lg:col-span-5">
          <WorkOrderPieChart data={workOrderStats?.by_status || []} />
        </div>
        
        {/* Service Intelligence */}
        <div className="lg:col-span-7">
          <ServiceReminders vehicles={serviceDueData?.vehicles || []} isLoading={serviceDueLoading} />
        </div>

        {/* Detailed Feeds (Unified row) */}
        <div className="lg:col-span-4 h-full">
          <InventoryWatchlist items={lowStockData?.items || []} isLoading={lowStockLoading} />
        </div>
        
        <div className="lg:col-span-4 h-full">
          <SmartDiagnosisFeed logs={diagnosisLogs} isLoading={false} />
        </div>
        
        <div className="lg:col-span-4 h-full">
          <CompactActivityList 
              appointments={todayAppointments} 
              workOrders={dashboardData?.recent_activity?.work_orders} 
          />
        </div>
      </div>
    </div>
  );
}
