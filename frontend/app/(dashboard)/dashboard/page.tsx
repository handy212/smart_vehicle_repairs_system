"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, Clock3, Package, Truck, TrendingUp, Wrench, type LucideIcon } from "lucide-react";
import { customersApi } from "@/lib/api/customers";
import { vehiclesApi } from "@/lib/api/vehicles";
import { appointmentsApi } from "@/lib/api/appointments";
import { workordersApi } from "@/lib/api/workorders";
import { reportingApi, type DashboardOverview } from "@/lib/api/reporting";
import { billingApi } from "@/lib/api/billing";
import dynamic from "next/dynamic";
import { format } from "date-fns";
import { DashboardSkeleton } from "@/components/ui/skeleton";
import { useMemo, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { SummaryStatsGrid } from "./components/SummaryStatsGrid";
import { ShopPulse } from "./components/ShopPulse";
import { ServiceReminders } from "./components/ServiceReminders";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { DashboardHeader } from "./components/DashboardHeader";
import { InventoryWatchlist } from "./components/InventoryWatchlist";
import { SmartDiagnosisFeed } from "./components/SmartDiagnosisFeed";
import { CompactActivityList } from "./components/CompactActivityList";
import { PerfexDashboard } from "./components/PerfexDashboard";
import { useTheme } from "@/lib/hooks/useTheme";
import { useBranchStore } from "@/store/branchStore";

// Lazy load heavy chart components
const WorkOrderPieChart = dynamic(() => import("./components/WorkOrderPieChart"), {
  loading: () => <div className="flex items-center justify-center h-[200px] text-muted-foreground">Loading chart...</div>,
  ssr: false,
});

type DashboardDiagnosisLog = {
  id: number;
  work_order_number: string;
  description: string;
  priority: "critical" | "warning" | "info";
  timestamp: string;
};

type AttentionCard = {
  title: string;
  value: number;
  description: string;
  href: string;
  icon: LucideIcon;
  tone: "danger" | "warning" | "info";
};

type SnapshotCard = {
  label: string;
  value: string;
  hint: string;
  href: string;
  icon: LucideIcon;
};

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

export default function DashboardPage() {
  const { formatCurrency } = useCurrency();
  const { theme: activeTheme } = useTheme();
  const isPerfex = activeTheme === "perfex";
  const activeBranchId = useBranchStore((s) => s.activeBranchId);

  // Fetch dashboard overview from reporting API
  const { data: dashboardData, isLoading: dashboardLoading, refetch: refetchDashboard } = useQuery({
    queryKey: ["dashboard", "overview", activeBranchId],
    queryFn: () => reportingApi.dashboard(),
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch work order statistics
  const { data: workOrderStats, refetch: refetchWOStats } = useQuery({
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
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 10 * 60 * 1000,
  });

  // Fetch low stock items
  const { data: lowStockData, isLoading: lowStockLoading, refetch: refetchLowStock } = useQuery({
    queryKey: ["dashboard", "low-stock", activeBranchId],
    queryFn: () => reportingApi.lowStock(),
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch service due report
  const { data: serviceDueData, isLoading: serviceDueLoading, refetch: refetchServiceDue } = useQuery({
    queryKey: ["dashboard", "service-due", activeBranchId],
    queryFn: () => reportingApi.serviceDue(),
    staleTime: 15 * 60 * 1000,
  });

  const { data: todayAppointments, refetch: refetchAppointments } = useQuery({
    queryKey: ["appointments", "today", activeBranchId],
    queryFn: () => appointmentsApi.today(),
    staleTime: 2 * 60 * 1000,
  });

  const { data: activeWorkOrders, refetch: refetchActiveWOs } = useQuery({
    queryKey: ["workorders", "active", activeBranchId],
    queryFn: () => workordersApi.active(),
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 2 * 60 * 1000,
  });

  // Perfex-only: invoice stats, recent invoices, technician performance, 7-day revenue
  const { data: invoiceStatsData, refetch: refetchInvoiceStats } = useQuery({
    queryKey: ["dashboard", "invoice-stats", activeBranchId],
    queryFn: () => billingApi.invoices.stats(),
    enabled: isPerfex,
    staleTime: 5 * 60 * 1000,
  });

  const { data: recentInvoicesData, refetch: refetchRecentInvoices } = useQuery({
    queryKey: ["dashboard", "recent-invoices", activeBranchId],
    queryFn: () => billingApi.invoices.list({ ordering: "-invoice_date", page: 1 }),
    enabled: isPerfex,
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
    enabled: isPerfex,
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
    enabled: isPerfex,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch counts only
  const { data: customerCount } = useQuery({
    queryKey: ["customers", "count", activeBranchId],
    queryFn: () => customersApi.list({ page: 1 }),
    select: (data) => data?.count || 0,
    staleTime: 10 * 60 * 1000,
  });

  const { data: vehicleCount } = useQuery({
    queryKey: ["vehicles", "count", activeBranchId],
    queryFn: () => vehiclesApi.list({ page: 1 }),
    select: (data) => data?.count || 0,
    staleTime: 10 * 60 * 1000,
  });

  const handleRefresh = useCallback(() => {
    void refetchDashboard();
    void refetchWOStats();
    void refetchLowStock();
    void refetchServiceDue();
    void refetchAppointments();
    void refetchActiveWOs();
    if (isPerfex) {
      void refetchInvoiceStats();
      void refetchRecentInvoices();
      void refetchTechPerf();
      void refetchRevenueChart();
    }
  }, [isPerfex, refetchDashboard, refetchWOStats, refetchLowStock, refetchServiceDue, refetchAppointments, refetchActiveWOs, refetchInvoiceStats, refetchRecentInvoices, refetchTechPerf, refetchRevenueChart]);

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
      pending_estimates: dashboardData?.alerts?.pending_estimates || 0,
      active_subscriptions: dashboardData?.subscriptions?.active_count || 0,
      active_roadside: dashboardData?.today?.roadside_requests || 0,
      roadside_completed_today: dashboardData?.today?.roadside_completed || 0,
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

  const diagnosisLogs = useMemo<DashboardDiagnosisLog[]>(() => {
    return (
      dashboardData?.recent_activity?.work_orders?.slice(0, 5).map((wo: DashboardOverview["recent_activity"]["work_orders"][number]) => ({
        id: wo.id,
        work_order_number: wo.wo_number,
        description: wo.diagnosis_notes?.trim()
          ? `Analysis: ${wo.diagnosis_notes}`
          : `Status: ${wo.status.replace(/_/g, " ").toUpperCase()}`,
        priority: wo.status === "diagnosis" ? "warning" : "info",
        timestamp: wo.created_at,
      })) || []
    );
  }, [dashboardData]);

  const workOrderSummary = workOrderStats?.summary;

  const todayLabel = format(
    dashboardData?.today?.date ? new Date(dashboardData.today.date) : new Date(),
    "EEEE, MMMM d"
  );

  const attentionCards = useMemo<AttentionCard[]>(
    () => [
      {
        title: "Overdue invoices",
        value: stats.overdue_invoices,
        description: `${formatCurrency(stats.overdue_amount || 0)} still waiting to be collected from past-due invoices.`,
        href: "/billing/invoices",
        icon: AlertTriangle,
        tone: "danger",
      },
      {
        title: "Low stock blockers",
        value: stats.low_stock_items,
        description: "Parts below reorder point can slow repairs and increase vehicle turnaround time.",
        href: "/inventory",
        icon: Package,
        tone: "warning",
      },
      {
        title: "Pending estimates",
        value: stats.pending_estimates || 0,
        description: "Quotes waiting for follow-up or customer approval before work can move ahead.",
        href: "/billing/estimates",
        icon: Clock3,
        tone: "info",
      },
      {
        title: "Roadside in progress",
        value: stats.active_roadside || 0,
        description: `${stats.roadside_completed_today || 0} roadside requests have already been completed today.`,
        href: "/roadside",
        icon: Truck,
        tone: "info",
      },
    ],
    [
      formatCurrency,
      stats.active_roadside,
      stats.low_stock_items,
      stats.overdue_amount,
      stats.overdue_invoices,
      stats.pending_estimates,
      stats.roadside_completed_today,
    ]
  );

  const activeAttentionCount = attentionCards.filter((item) => item.value > 0).length;

  const headerSummary = useMemo(() => {
    if (activeAttentionCount === 0) {
      return `The shop looks steady right now. ${stats.active_work_orders} jobs are active, ${stats.today_appointments} appointments are on the board, and revenue today is ${formatCurrency(stats.today_revenue)}.`;
    }

    return `${activeAttentionCount} operating areas need attention right now. ${stats.active_work_orders} jobs are active in the shop, ${stats.today_appointments} appointments are scheduled today, and ${formatCurrency(stats.today_revenue)} has been collected so far.`;
  }, [
    activeAttentionCount,
    formatCurrency,
    stats.active_work_orders,
    stats.today_appointments,
    stats.today_revenue,
  ]);

  const spotlight = useMemo(
    () => [
      {
        label: "Revenue Today",
        value: formatCurrency(stats.today_revenue || 0),
      },
      {
        label: "Pending Queue",
        value: `${workOrderSummary?.pending_count ?? 0} jobs`,
      },
      {
        label: "Roadside Live",
        value: `${stats.active_roadside || 0} active`,
      },
    ],
    [formatCurrency, stats.active_roadside, stats.today_revenue, workOrderSummary?.pending_count]
  );

  const todayBoard: SnapshotCard[] = [
    {
      label: "Appointments today",
      value: `${stats.today_appointments}`,
      hint: `${todayAppointments?.filter((appointment) => appointment.status === "confirmed").length || 0} confirmed so far`,
      href: "/appointments",
      icon: CalendarClock,
    },
    {
      label: "Active repair load",
      value: `${workOrderSummary?.active_count ?? stats.active_work_orders}`,
      hint: `${workOrderSummary?.attention_count ?? 0} jobs currently sit in attention states`,
      href: "/workorders",
      icon: Wrench,
    },
    {
      label: "Average turnaround",
      value: workOrderSummary?.average_completion_hours
        ? `${workOrderSummary.average_completion_hours.toFixed(1)} h`
        : "No data",
      hint: "Based on completed work orders in the selected reporting window",
      href: "/reports",
      icon: Clock3,
    },
    {
      label: "Recurring revenue",
      value: formatCurrency(stats.mrr || 0),
      hint: `Month to date ${formatCurrency(stats.month_revenue || 0)}`,
      href: "/subscriptions",
      icon: TrendingUp,
    },
  ];

  if (activeTheme === "perfex") {
    return (
      <PerfexDashboard
        isLoading={isLoading}
        stats={stats}
        workOrderSummary={workOrderStats?.summary}
        recentWorkOrders={dashboardData?.recent_activity?.work_orders?.map((wo) => ({
          id: wo.id,
          wo_number: wo.wo_number,
          status: wo.status,
          created_at: wo.created_at,
          diagnosis_notes: wo.diagnosis_notes ?? undefined,
          customer: wo.customer || undefined,
          vehicle: wo.vehicle || undefined,
          gate_pass_status: wo.gate_pass_status ?? undefined,
        }))}
        todayAppointments={(todayAppointments as DashboardAppointment[] | undefined)?.map((appt) => ({
          id: appt.id,
          status: appt.status,
          customer_name: appt.customer_name || (typeof appt.customer === "object" ? appt.customer.name : undefined),
          vehicle_display: appt.vehicle_display,
          vehicle_info: appt.vehicle_info,
          appointment_time: appt.appointment_time,
        }))}
        lowStockItems={(lowStockData?.items as LowStockReportItem[] | undefined)?.map((item) => ({
          id: item.part?.id ?? 0,
          name: item.part?.name ?? "Unknown part",
          part_number: item.part?.part_number,
          quantity: item.stock?.current ?? 0,
          reorder_point: item.stock?.reorder_point ?? 0,
        }))}
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
        technicianData={(techPerfData?.technicians as TechnicianPerformanceItem[] | undefined)?.map((t) => ({
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
        }))}
        revenueChartData={revenueChartRaw?.daily ?? revenueChartRaw}
        onRefresh={handleRefresh}
        todayLabel={todayLabel}
        formatCurrency={formatCurrency}
      />
    );
  }

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6 p-4 max-w-[1700px] mx-auto pb-10">
      <DynamicPageTitle title="Dashboard" />
      
      <DashboardHeader todayLabel={todayLabel} summary={headerSummary} spotlight={spotlight} />

      <SummaryStatsGrid stats={stats} />

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-12">
        <Card className="precision-card overflow-hidden 2xl:col-span-7">
          <CardHeader className="flex flex-col gap-4 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <Badge variant="outline" className="w-fit rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.25em]">
                Attention Required
              </Badge>
              <CardTitle className="text-2xl tracking-tight">What needs action first</CardTitle>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                These are the operating queues most likely to slow cash collection, customer response time, or repair throughput.
              </p>
            </div>
            <Button variant="outline" className="rounded-xl" asChild>
              <Link href="/reports">
                Review reports
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {attentionCards.map((item) => {
              const toneClasses = {
                danger: "border-rose-200 bg-rose-50/70 hover:border-rose-300 dark:border-rose-950/60 dark:bg-rose-950/20",
                warning: "border-warning/20 bg-warning/10/70 hover:border-amber-300 dark:border-amber-950/60 dark:bg-amber-950/20",
                info: "border-sky-200 bg-sky-50/70 hover:border-sky-300 dark:border-sky-950/60 dark:bg-sky-950/20",
              } satisfies Record<AttentionCard["tone"], string>;

              const badgeVariant = {
                danger: "danger",
                warning: "warning",
                info: "info",
              } satisfies Record<AttentionCard["tone"], "danger" | "warning" | "info">;

              return (
                <Link
                  key={item.title}
                  href={item.href}
                  className={`rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-md ${toneClasses[item.tone]}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-background/80 text-foreground shadow-sm">
                        <item.icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{item.title}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                    <Badge variant={badgeVariant[item.tone]} className="rounded-full whitespace-nowrap">
                      {item.value} open
                    </Badge>
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card className="precision-card 2xl:col-span-5">
          <CardHeader className="space-y-2 pb-5">
            <Badge variant="outline" className="w-fit rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.25em]">
              Today At A Glance
            </Badge>
            <CardTitle className="text-2xl tracking-tight">Operator snapshot</CardTitle>
            <p className="text-sm leading-6 text-muted-foreground">
              A compact read on the front desk, shop floor, service pace, and revenue footing for the day.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {todayBoard.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="rounded-2xl border border-border/60 bg-muted/30 p-4 transition-all hover:border-primary/30 hover:bg-muted/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                      {item.label}
                    </p>
                    <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                      {item.value}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.hint}</p>
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-background text-primary shadow-sm">
                    <item.icon className="h-5 w-5" />
                  </div>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <ShopPulse workOrderStats={workOrderStats} />
        </div>

        <div className="grid gap-6 xl:col-span-5">
          <Card className="precision-card">
            <CardHeader className="space-y-2 pb-4">
              <Badge variant="outline" className="w-fit rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.25em]">
                Revenue Pulse
              </Badge>
              <CardTitle className="text-xl tracking-tight">Cash and recurring revenue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-muted/40 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Today</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{formatCurrency(stats.today_revenue)}</p>
                </div>
                <div className="rounded-2xl bg-muted/40 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Week</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{formatCurrency(stats.week_revenue)}</p>
                </div>
                <div className="rounded-2xl bg-muted/40 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Month</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{formatCurrency(stats.month_revenue)}</p>
                </div>
                <div className="rounded-2xl bg-muted/40 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">MRR</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{formatCurrency(stats.mrr || 0)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" className="rounded-xl" asChild>
                  <Link href="/billing">Open billing</Link>
                </Button>
                <Button variant="ghost" className="rounded-xl" asChild>
                  <Link href="/reports">See reporting</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="precision-card">
            <CardHeader className="space-y-2 pb-4">
              <Badge variant="outline" className="w-fit rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.25em]">
                Operations Brief
              </Badge>
              <CardTitle className="text-xl tracking-tight">Workflow health across the last 30 days</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {[
                {
                  label: "Pending queue",
                  value: `${workOrderSummary?.pending_count ?? 0}`,
                },
                {
                  label: "Active repair",
                  value: `${workOrderSummary?.active_count ?? stats.active_work_orders}`,
                },
                {
                  label: "Attention states",
                  value: `${workOrderSummary?.attention_count ?? 0}`,
                },
                {
                  label: "Completed",
                  value: `${workOrderSummary?.completed ?? 0}`,
                },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{item.label}</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{item.value}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5">
          <WorkOrderPieChart data={workOrderStats?.by_status || []} />
        </div>
        
        <div className="lg:col-span-7">
          <ServiceReminders vehicles={serviceDueData?.vehicles || []} isLoading={serviceDueLoading} />
        </div>

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
