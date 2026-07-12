"use client";

import { useQuery } from "@tanstack/react-query";
import { appointmentsApi } from "@/lib/api/appointments";
import { customersApi } from "@/lib/api/customers";
import { vehiclesApi } from "@/lib/api/vehicles";
import { reportingApi, type DashboardOverview } from "@/lib/api/reporting";
import { billingApi } from "@/lib/api/billing";
import { workordersApi } from "@/lib/api/workorders";
import { inventoryApi } from "@/lib/api/inventory";
import { format } from "date-fns";
import { useMemo, useCallback } from "react";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { PerfexDashboard } from "./components/PerfexDashboard";
import { useBranchStore } from "@/store/branchStore";
import { useAuthStore } from "@/store/authStore";
import { getDashboardRoleConfig, dashboardShowsSection } from "@/lib/utils/dashboard-role-config";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { DASHBOARD_VIEW_PERMISSIONS } from "@/lib/utils/permissions";
import {
  buildStatusCountsFromDashboardStats,
  buildSummaryFromDashboardStats,
  mapInventoryLowStock,
  mapWorkOrderToDashboardRecent,
} from "@/lib/utils/dashboard-data";

type DashboardAppointment = {
  id: number;
  status: string;
  customer_name?: string;
  customer?: { name?: string } | number;
  vehicle_display?: string;
  vehicle_info?: string;
  appointment_time?: string;
};

type LowStockReportItem = {
  part?: {
    id?: number;
    name?: string;
    part_number?: string;
  };
  stock?: {
    current?: number;
    reorder_point?: number;
  };
};

type TechnicianPerformanceItem = {
  technician?: {
    name?: string;
    role?: string;
  };
  metrics?: {
    total_work_orders?: number;
    completed?: number;
    in_progress?: number;
    average_completion_hours?: number | null;
    revenue?: number;
  };
};

const DASHBOARD_TOP_TECHNICIANS_LIMIT = 12;

export default function DashboardPage() {
  const { formatCurrency } = useCurrency();
  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const userRole = useAuthStore((s) => s.user?.role);
  const roleConfig = useMemo(() => getDashboardRoleConfig(userRole), [userRole]);
  const { hasPermission, hasAnyPermission } = usePermissions();

  const canViewDashboardOverview = hasAnyPermission([...DASHBOARD_VIEW_PERMISSIONS]);
  const canViewReports = hasAnyPermission(["view_reports", "view_all_reports"]);
  const canViewAppointments = hasAnyPermission(["view_appointments", "view_own_appointments"]);
  const canViewBilling = hasPermission("view_billing");
  const canViewCustomers = hasPermission("view_customers");
  const canViewVehicles = hasPermission("view_vehicles");
  const canViewWorkOrders = hasAnyPermission(["view_workorders", "view_own_workorders"]);
  const canViewLowStockAlerts = hasAnyPermission([
    "view_low_stock_alerts",
    "view_inventory_reports",
    "manage_inventory",
  ]);

  const showSection = (section: Parameters<typeof dashboardShowsSection>[1]) =>
    dashboardShowsSection(roleConfig, section);

  const useReportingOverview = canViewDashboardOverview;
  const useReportingWorkOrderStats =
    canViewReports && canViewWorkOrders && showSection("wo_status_breakdown");
  // Prefer reporting overview when available; avoid duplicate unscoped/fallback WO calls
  const useWorkOrderFallback =
    canViewWorkOrders &&
    !useReportingOverview &&
    !useReportingWorkOrderStats &&
    (showSection("kpi") || showSection("main_table") || showSection("wo_status_breakdown"));
  const useBillingQueries =
    canViewBilling &&
    (showSection("bottom_summary") || roleConfig.defaultMainTab === "invoices");
  const useLowStockQueries = canViewLowStockAlerts && showSection("low_stock");
  const useServiceDueQueries = canViewReports && showSection("service_due");
  const useTechPerfQueries = canViewReports && showSection("technician_perf");
  const useRevenueQueries =
    canViewReports && canViewBilling && showSection("bottom_summary");
  const kpiNeedsCustomerCount =
    roleConfig.kpiLabels === "all" ||
    (Array.isArray(roleConfig.kpiLabels) && roleConfig.kpiLabels.includes("Customers"));
  const kpiNeedsVehicleCount =
    roleConfig.kpiLabels === "all" ||
    (Array.isArray(roleConfig.kpiLabels) && roleConfig.kpiLabels.includes("Vehicles"));

  const {
    data: dashboardData,
    isLoading: dashboardLoading,
    isError: dashboardError,
    refetch: refetchDashboard,
  } = useQuery({
    queryKey: ["dashboard", "overview", activeBranchId],
    queryFn: () => reportingApi.dashboard(),
    enabled: useReportingOverview,
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: workOrderStats,
    isError: workOrderStatsError,
    refetch: refetchWOStats,
  } = useQuery({
    queryKey: ["dashboard", "workorder-stats", activeBranchId],
    queryFn: () => {
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 30);
      return reportingApi.workOrderStatistics({
        start_date: format(startDate, "yyyy-MM-dd"),
        end_date: format(today, "yyyy-MM-dd"),
      });
    },
    enabled: useReportingWorkOrderStats,
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 10 * 60 * 1000,
  });

  const {
    data: workOrderDashboardStats,
    isLoading: workOrderDashboardStatsLoading,
    isError: workOrderDashboardStatsError,
    refetch: refetchWorkOrderDashboardStats,
  } = useQuery({
    queryKey: ["dashboard", "workorder-dashboard-stats", activeBranchId],
    queryFn: () => workordersApi.dashboardStats(),
    enabled: useWorkOrderFallback,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: recentWorkOrdersData,
    isLoading: recentWorkOrdersLoading,
    refetch: refetchRecentWorkOrders,
  } = useQuery({
    queryKey: ["dashboard", "recent-workorders", activeBranchId],
    queryFn: () => workordersApi.list({ ordering: "-created_at", page: 1 }),
    enabled: canViewWorkOrders && !useReportingOverview,
    staleTime: 2 * 60 * 1000,
  });

  const { data: serviceDueData, refetch: refetchServiceDue } = useQuery({
    queryKey: ["dashboard", "service-due", activeBranchId],
    queryFn: () => reportingApi.serviceDue(),
    enabled: useServiceDueQueries,
    staleTime: 15 * 60 * 1000,
  });

  const { data: lowStockData, refetch: refetchLowStock } = useQuery({
    queryKey: ["dashboard", "low-stock", activeBranchId],
    queryFn: () => reportingApi.lowStock(),
    enabled:
      useLowStockQueries &&
      canViewReports &&
      (dashboardData?.alerts?.low_stock_items ?? 0) > 0,
    staleTime: 5 * 60 * 1000,
  });

  const { data: inventoryLowStock, refetch: refetchInventoryLowStock } = useQuery({
    queryKey: ["dashboard", "inventory-low-stock", activeBranchId],
    queryFn: () => inventoryApi.lowStock(),
    enabled: useLowStockQueries && !canViewReports,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: todayAppointments,
    isError: appointmentsError,
    refetch: refetchAppointments,
  } = useQuery({
    queryKey: ["appointments", "today", activeBranchId],
    queryFn: () => appointmentsApi.today(),
    enabled: canViewAppointments && showSection("appointments"),
    staleTime: 2 * 60 * 1000,
  });

  const { data: invoiceStatsData, refetch: refetchInvoiceStats } = useQuery({
    queryKey: ["dashboard", "invoice-stats", activeBranchId],
    queryFn: () => billingApi.invoices.stats(),
    enabled: useBillingQueries,
    staleTime: 5 * 60 * 1000,
  });

  const { data: estimateStatsData, refetch: refetchEstimateStats } = useQuery({
    queryKey: ["dashboard", "estimate-stats", activeBranchId],
    queryFn: () => billingApi.estimates.stats(),
    enabled: useBillingQueries && !useReportingOverview,
    staleTime: 5 * 60 * 1000,
  });

  const { data: recentInvoicesData, refetch: refetchRecentInvoices } = useQuery({
    queryKey: ["dashboard", "recent-invoices", activeBranchId],
    queryFn: () => billingApi.invoices.list({ ordering: "-invoice_date", page: 1 }),
    enabled: useBillingQueries,
    staleTime: 2 * 60 * 1000,
  });

  const { data: techPerfData, refetch: refetchTechPerf } = useQuery({
    queryKey: ["dashboard", "tech-performance", activeBranchId],
    queryFn: () => {
      const today = new Date();
      const start = new Date(today);
      start.setDate(start.getDate() - 30);
      return reportingApi.technicianPerformance({
        start_date: format(start, "yyyy-MM-dd"),
        end_date: format(today, "yyyy-MM-dd"),
      });
    },
    enabled: useTechPerfQueries,
    staleTime: 10 * 60 * 1000,
  });

  const { data: revenueChartRaw, refetch: refetchRevenueChart } = useQuery({
    queryKey: ["dashboard", "revenue-chart", activeBranchId],
    queryFn: () => {
      const today = new Date();
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return reportingApi.revenue({
        start_date: format(start, "yyyy-MM-dd"),
        end_date: format(today, "yyyy-MM-dd"),
        period: "daily",
      });
    },
    enabled: useRevenueQueries,
    staleTime: 5 * 60 * 1000,
  });

  const { data: customerStats } = useQuery({
    queryKey: ["customers", "dashboard-stats", activeBranchId],
    queryFn: () => customersApi.dashboardStats(),
    enabled: canViewCustomers && showSection("kpi") && kpiNeedsCustomerCount,
    staleTime: 10 * 60 * 1000,
  });

  const { data: vehicleStats } = useQuery({
    queryKey: ["vehicles", "dashboard-stats", activeBranchId],
    queryFn: () => vehiclesApi.dashboardStats(),
    enabled: canViewVehicles && showSection("kpi") && kpiNeedsVehicleCount,
    staleTime: 10 * 60 * 1000,
  });

  const handleRefresh = useCallback(() => {
    void refetchDashboard();
    void refetchWOStats();
    void refetchWorkOrderDashboardStats();
    void refetchRecentWorkOrders();
    void refetchServiceDue();
    void refetchLowStock();
    void refetchInventoryLowStock();
    void refetchAppointments();
    void refetchInvoiceStats();
    void refetchEstimateStats();
    void refetchRecentInvoices();
    void refetchTechPerf();
    void refetchRevenueChart();
  }, [
    refetchDashboard,
    refetchWOStats,
    refetchWorkOrderDashboardStats,
    refetchRecentWorkOrders,
    refetchServiceDue,
    refetchLowStock,
    refetchInventoryLowStock,
    refetchAppointments,
    refetchInvoiceStats,
    refetchEstimateStats,
    refetchRecentInvoices,
    refetchTechPerf,
    refetchRevenueChart,
  ]);

  const queryErrors = useMemo(() => {
    const errors: string[] = [];
    if (dashboardError) errors.push("Dashboard overview");
    if (workOrderStatsError) errors.push("Work order statistics");
    if (workOrderDashboardStatsError) errors.push("Work order summary");
    if (appointmentsError) errors.push("Today's appointments");
    return errors;
  }, [dashboardError, workOrderStatsError, workOrderDashboardStatsError, appointmentsError]);

  const workOrderSummary = useMemo(
    () => workOrderStats?.summary ?? buildSummaryFromDashboardStats(workOrderDashboardStats),
    [workOrderStats, workOrderDashboardStats]
  );

  const workOrderByStatus = useMemo(
    () => workOrderStats?.by_status ?? buildStatusCountsFromDashboardStats(workOrderDashboardStats),
    [workOrderStats, workOrderDashboardStats]
  );

  const pendingEstimatesFallback =
    (estimateStatsData?.counts?.draft ?? 0) + (estimateStatsData?.counts?.sent ?? 0);

  const stats = useMemo(
    () => ({
      total_customers: customerStats?.total_customers ?? 0,
      total_vehicles: vehicleStats?.total_vehicles ?? 0,
      today_appointments: dashboardData?.today?.appointments || todayAppointments?.length || 0,
      today_revenue: dashboardData?.today?.revenue || 0,
      week_revenue: dashboardData?.week?.revenue || 0,
      month_revenue: dashboardData?.month?.revenue || 0,
      active_work_orders:
        dashboardData?.alerts?.active_work_orders ||
        ((workOrderDashboardStats?.in_progress ?? 0) + (workOrderDashboardStats?.pending ?? 0)),
      overdue_invoices:
        dashboardData?.alerts?.overdue_invoices?.count ||
        invoiceStatsData?.counts?.overdue ||
        0,
      overdue_amount:
        dashboardData?.alerts?.overdue_invoices?.total ||
        invoiceStatsData?.financials?.past_due_total ||
        0,
      low_stock_items:
        dashboardData?.alerts?.low_stock_items ||
        inventoryLowStock?.length ||
        0,
      pending_estimates:
        dashboardData?.alerts?.pending_estimates ||
        pendingEstimatesFallback ||
        0,
      active_subscriptions: dashboardData?.subscriptions?.active_count || 0,
      active_roadside: dashboardData?.today?.roadside_requests || 0,
      roadside_completed_today: dashboardData?.today?.roadside_completed || 0,
      mrr: dashboardData?.subscriptions?.mrr || 0,
    }),
    [
      dashboardData,
      todayAppointments,
      customerStats,
      vehicleStats,
      workOrderDashboardStats,
      invoiceStatsData,
      inventoryLowStock,
      pendingEstimatesFallback,
    ]
  );

  const lowStockItems = useMemo(() => {
    if (lowStockData?.items) {
      const items = (lowStockData.items as LowStockReportItem[]) ?? [];
      return items.map((item) => ({
        id: item.part?.id ?? 0,
        name: item.part?.name ?? "Unknown part",
        part_number: item.part?.part_number,
        quantity: item.stock?.current ?? 0,
        reorder_point: item.stock?.reorder_point ?? 0,
      }));
    }
    return mapInventoryLowStock(inventoryLowStock ?? []);
  }, [lowStockData, inventoryLowStock]);

  const topTechnicianData = useMemo(
    () =>
      ((techPerfData?.technicians as TechnicianPerformanceItem[] | undefined) ?? [])
        .slice(0, DASHBOARD_TOP_TECHNICIANS_LIMIT)
        .map((t) => ({
          name: t.technician?.name,
          role: t.technician?.role,
          total_jobs: t.metrics?.total_work_orders,
          completed_jobs: t.metrics?.completed,
          in_progress_jobs: t.metrics?.in_progress,
          completion_rate: t.metrics?.total_work_orders
            ? ((t.metrics.completed ?? 0) / t.metrics.total_work_orders) * 100
            : 0,
          avg_completion_days: t.metrics?.average_completion_hours != null
            ? t.metrics.average_completion_hours / 24
            : undefined,
          total_revenue: t.metrics?.revenue,
        })),
    [techPerfData]
  );

  const recentWorkOrders = useMemo(() => {
    if (dashboardData?.recent_activity?.work_orders?.length) {
      return dashboardData.recent_activity.work_orders.map(
        (wo: DashboardOverview["recent_activity"]["work_orders"][number]) => ({
          id: wo.id,
          wo_number: wo.wo_number,
          status: wo.status,
          diagnosis_status: wo.diagnosis_status ?? null,
          has_technician_assignment: wo.has_technician_assignment ?? false,
          estimate_summary: wo.estimate_summary ?? null,
          invoice_summary: wo.invoice_summary ?? null,
          current_quote_stage: wo.current_quote_stage ?? null,
          current_quote_stage_display: wo.current_quote_stage_display ?? null,
          created_at: wo.created_at,
          diagnosis_notes: wo.diagnosis_notes ?? undefined,
          customer: wo.customer || undefined,
          vehicle: wo.vehicle || undefined,
          gate_pass_status: wo.gate_pass_status ?? undefined,
        })
      );
    }

    return (recentWorkOrdersData?.results ?? []).map(mapWorkOrderToDashboardRecent);
  }, [dashboardData, recentWorkOrdersData]);

  const isLoading = useReportingOverview
    ? dashboardLoading
    : workOrderDashboardStatsLoading || recentWorkOrdersLoading;

  const todayLabel = format(
    dashboardData?.today?.date ? new Date(dashboardData.today.date) : new Date(),
    "EEEE, MMMM d"
  );

  return (
    <PerfexDashboard
      isLoading={isLoading}
      queryErrors={queryErrors}
      stats={stats}
      workOrderSummary={workOrderSummary}
      workOrderByStatus={workOrderByStatus}
      recentWorkOrders={recentWorkOrders}
      todayAppointments={(todayAppointments as DashboardAppointment[] | undefined)?.map((appt) => ({
        id: appt.id,
        status: appt.status,
        customer_name: appt.customer_name || (typeof appt.customer === "object" ? appt.customer.name : undefined),
        vehicle_display: appt.vehicle_display,
        vehicle_info: appt.vehicle_info,
        appointment_time: appt.appointment_time,
      }))}
      lowStockItems={lowStockItems}
      serviceDueVehicles={serviceDueData?.vehicles}
      invoiceStats={invoiceStatsData}
      recentInvoices={recentInvoicesData?.results?.map((inv) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        customer_name: inv.customer_name,
        status: inv.status,
        total: parseFloat(inv.total) || 0,
        balance_due: parseFloat(inv.balance_due ?? "0") || 0,
        due_date: inv.due_date,
        invoice_date: inv.invoice_date,
      }))}
      technicianData={topTechnicianData}
      revenueChartData={revenueChartRaw?.daily ?? revenueChartRaw}
      onRefresh={handleRefresh}
      todayLabel={todayLabel}
      formatCurrency={formatCurrency}
      roleConfig={roleConfig}
    />
  );
}
