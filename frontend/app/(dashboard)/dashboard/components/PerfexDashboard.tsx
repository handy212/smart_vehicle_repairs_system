"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import {
  DollarSign, Wrench, Calendar, AlertTriangle, TrendingUp, TrendingDown,
  Package, FileText, Truck, ArrowRight, ChevronRight, Users, Car,
  RefreshCw, Search, X, ChevronDown, ChevronUp, ChevronsUpDown,
  Clock, AlertCircle, Plus, Receipt, UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { DashboardShortcutBar } from "./DashboardShortcutBar";
import { getWorkOrderStagePresentation } from "@/lib/utils/workorder-inspection-stage";
import {
  type DashboardRoleConfig,
  dashboardShowsSection,
} from "@/lib/utils/dashboard-role-config";

/* ═══════════════════════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════════════════════ */

interface Stats {
  today_revenue: number; week_revenue: number; month_revenue: number; mrr: number;
  active_work_orders: number; overdue_invoices: number; overdue_amount: number;
  low_stock_items: number; pending_estimates: number; active_roadside: number;
  roadside_completed_today: number; today_appointments: number;
  total_customers: number; total_vehicles: number; active_subscriptions: number;
}

interface WorkOrderSummary {
  pending_count?: number; active_count?: number; attention_count?: number;
  completed?: number; average_completion_hours?: number;
}

interface RecentWorkOrder {
  id: number; wo_number: string; status: string; created_at: string;
  diagnosis_notes?: string;
  customer?: string;
  vehicle?: string;
  gate_pass_status?: string;
  estimate_summary?: {
    id: number;
    estimate_number: string;
    status: string;
    total: string;
  } | null;
  invoice_summary?: {
    id: number;
    invoice_number: string;
    status: string;
    total: string;
    amount_paid?: string;
    amount_due?: string;
    is_paid?: boolean;
  } | null;
  current_quote_stage?:
    | "waiting_for_stores_quotation"
    | "waiting_for_customer_approval"
    | "quotation_ready"
    | "approved_waiting_for_parts"
    | "parts_ready_waiting_for_repairs"
    | "approved_waiting_for_repairs"
    | null;
  current_quote_stage_display?: string | null;
}

interface TodayAppointment {
  id: number; status: string; customer_name?: string;
  vehicle_display?: string; vehicle_info?: string; appointment_time?: string;
}

interface LowStockItem {
  id: number; name: string; part_number?: string;
  quantity: number; reorder_point: number;
}

interface ServiceVehicle {
  id: number; vehicle_info: string; license_plate: string;
  last_service_date: string | null; mileage: number | null;
}

interface TechPerf {
  technician_name?: string; name?: string; role?: string;
  total_jobs?: number; completed_jobs?: number; in_progress_jobs?: number;
  completion_rate?: number; avg_completion_days?: number; total_revenue?: number;
}

interface DailyRevenue {
  date?: string; total?: number; revenue?: number; total_revenue?: number;
}

interface InvoiceStats {
  counts?: { total?: number; draft?: number; paid?: number; partially_paid?: number; overdue?: number; unpaid?: number };
  financials?: { total_paid?: number; past_due_total?: number; outstanding_total?: number };
}

interface RecentInvoice {
  id: number; invoice_number: string; customer_name?: string;
  status: string; total: number; balance_due: number;
  due_date?: string; invoice_date?: string;
}

type WorkOrderStatusCount = { status: string; count: number };

export interface PerfexDashboardProps {
  stats: Stats;
  workOrderSummary?: WorkOrderSummary;
  workOrderByStatus?: WorkOrderStatusCount[];
  recentWorkOrders?: RecentWorkOrder[];
  todayAppointments?: TodayAppointment[];
  lowStockItems?: LowStockItem[];
  serviceDueVehicles?: ServiceVehicle[];
  technicianData?: TechPerf[];
  revenueChartData?: DailyRevenue[];
  invoiceStats?: InvoiceStats;
  recentInvoices?: RecentInvoice[];
  isLoading?: boolean;
  queryErrors?: string[];
  onRefresh?: () => void;
  todayLabel: string;
  formatCurrency: (val: number) => string;
  roleConfig?: DashboardRoleConfig;
}

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════════════ */

const WO_STATUS_COLORS: Record<string, string> = {
  intake: "bg-blue-100 text-blue-700", diagnosis: "bg-amber-100 text-amber-700",
  in_progress: "bg-indigo-100 text-primary", repair: "bg-indigo-100 text-primary",
  qc: "bg-teal-100 text-teal-700", ready: "bg-green-100 text-green-700",
  completed: "bg-gray-100 text-gray-600", cancelled: "bg-red-100 text-destructive",
  pending: "bg-orange-100 text-orange-700", confirmed: "bg-green-100 text-green-700",
  scheduled: "bg-sky-100 text-sky-700",
};

const INV_STATUS: Record<string, { label: string; cls: string }> = {
  draft:           { label: "Draft",    cls: "bg-gray-100 text-gray-600"  },
  sent:            { label: "Sent",     cls: "bg-blue-100 text-blue-700"  },
  paid:            { label: "Paid",     cls: "bg-green-100 text-green-700"},
  partially_paid:  { label: "Partial",  cls: "bg-teal-100 text-teal-700" },
  overdue:         { label: "Overdue",  cls: "bg-red-100 text-destructive"   },
  unpaid:          { label: "Unpaid",   cls: "bg-orange-100 text-orange-700"},
  cancelled:       { label: "Cancelled",cls: "bg-gray-100 text-gray-500" },
};

const WO_FILTERS: Record<string, string[]> = {
  all:       [],
  pending:   ["pending"],
  active:    ["intake", "in_progress", "repair"],
  attention: ["diagnosis", "qc", "waiting_parts", "on_hold"],
  completed: ["completed", "ready", "cancelled"],
};
type WOFilterKey = "all" | "pending" | "active" | "attention" | "completed";

const INV_FILTERS: Record<string, string[]> = {
  all:     [],
  unpaid:  ["unpaid", "sent"],
  overdue: ["overdue"],
  paid:    ["paid", "partially_paid"],
  draft:   ["draft"],
};
type InvFilterKey = "all" | "unpaid" | "overdue" | "paid" | "draft";

type SortCol     = "wo_number" | "customer" | "status" | "created_at";
type WODateRange = "all" | "today" | "week" | "month";
type MainTab     = "workorders" | "invoices";

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════════ */

function StatusPill({ status, map, label }: { status: string; map: Record<string, string>; label?: string }) {
  const cls = map[status] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>
      {label || status.replace(/_/g, " ")}
    </span>
  );
}

function TrendBadge({ current, baseline }: { current: number; baseline: number }) {
  if (baseline === 0 || current === 0) return null;
  const pct = ((current - baseline) / baseline) * 100;
  if (Math.abs(pct) < 2) return null;
  const up = pct > 0;
  return (
    <span className={`flex items-center gap-0.5 text-[10px] font-semibold ${up ? "text-success" : "text-destructive"}`}>
      {up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

function SortHeader({ col, label, sortCol, sortDir, onSort, className = "" }: {
  col: SortCol; label: string; sortCol: SortCol | null;
  sortDir: "asc" | "desc"; onSort: (c: SortCol) => void; className?: string;
}) {
  const active = sortCol === col;
  return (
    <th className={`cursor-pointer select-none px-4 py-2 text-left text-xs font-semibold text-[#374151] hover:text-primary ${className}`}
        onClick={() => onSort(col)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {active
          ? sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
          : <ChevronsUpDown className="h-3 w-3 opacity-30" />}
      </span>
    </th>
  );
}

/** 7-day revenue bar chart */
function DailyRevChart({ data, formatCurrency }: { data: DailyRevenue[]; formatCurrency: (n: number) => string }) {
  if (!data.length) return (
    <div className="flex h-14 items-center justify-center text-[11px] text-muted-foreground">No chart data</div>
  );
  const vals = data.map((d) => d.total ?? d.total_revenue ?? d.revenue ?? 0);
  const max   = Math.max(...vals, 1);
  return (
    <div className="flex items-end gap-1 h-14">
      {data.map((d, i) => {
        const v   = vals[i];
        const pct = Math.max((v / max) * 100, 3);
        const isLast = i === data.length - 1;
        const label  = d.date ? format(new Date(d.date), "EEE") : String(i + 1);
        return (
          <div key={d.date ?? i} className="flex flex-1 flex-col items-center gap-0.5" title={`${label}: ${formatCurrency(v)}`}>
            <div className={`w-full rounded-t-sm transition-all ${isLast ? "bg-primary" : "bg-primary/30 hover:bg-primary/50"}`}
                 style={{ height: `${pct}%` }} />
            <span className="text-[8px] text-muted-foreground leading-none">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Technician completion rate mini bar */
function RateBar({ rate }: { rate: number }) {
  const pct = Math.min(Math.max(rate, 0), 100);
  const color = pct >= 80 ? "bg-success/100" : pct >= 60 ? "bg-warning/100" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-medium tabular-nums text-foreground w-8 text-right">{pct.toFixed(0)}%</span>
    </div>
  );
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (86_400_000));
}

function isUpcomingSoon(timeStr?: string): boolean {
  if (!timeStr) return false;
  try {
    const now = new Date();
    const m = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (m) {
      const a = new Date(now);
      let h = parseInt(m[1]); const mm = parseInt(m[2]);
      if (/pm/i.test(timeStr) && h < 12) h += 12;
      if (/am/i.test(timeStr) && h === 12) h = 0;
      a.setHours(h, mm, 0, 0);
      const d = a.getTime() - now.getTime();
      return d >= 0 && d <= 30 * 60_000;
    }
    const a2 = new Date(timeStr);
    if (!isNaN(a2.getTime())) { const d = a2.getTime() - now.getTime(); return d >= 0 && d <= 30 * 60_000; }
  } catch { /* ignore */ }
  return false;
}

/* ═══════════════════════════════════════════════════════════════════
   SKELETON
═══════════════════════════════════════════════════════════════════ */

export function PerfexSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-4 pb-8 max-w-[1700px] mx-auto">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5"><div className="h-4 w-24 rounded bg-muted" /><div className="h-3 w-36 rounded bg-muted" /></div>
        <div className="flex gap-2"><div className="h-8 w-32 rounded bg-muted" /><div className="h-8 w-32 rounded bg-muted" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-md border border-border bg-card p-3 h-[60px]">
            <div className="h-9 w-9 shrink-0 rounded-md bg-muted" />
            <div className="space-y-1.5 flex-1"><div className="h-2 w-full rounded bg-muted" /><div className="h-3.5 w-3/4 rounded bg-muted" /></div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8 rounded-md border border-border bg-card h-72" />
        <div className="lg:col-span-4 rounded-md border border-border bg-card h-72" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => <div key={i} className="rounded-md border border-border bg-card h-44" />)}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════ */

export function PerfexDashboard({
  stats, workOrderSummary, workOrderByStatus = [],
  recentWorkOrders = [], todayAppointments = [], lowStockItems = [],
  serviceDueVehicles = [], technicianData = [], revenueChartData = [],
  invoiceStats, recentInvoices = [],
  isLoading = false, queryErrors = [], onRefresh, todayLabel, formatCurrency,
  roleConfig,
}: PerfexDashboardProps) {

  const router = useRouter();
  const showSection = (section: Parameters<typeof dashboardShowsSection>[1]) =>
    !roleConfig || dashboardShowsSection(roleConfig, section);

  /* ── state ── */
  const [mainTab,         setMainTab]         = useState<MainTab>(roleConfig?.defaultMainTab ?? "workorders");
  const [woFilter,        setWoFilter]        = useState<WOFilterKey>(roleConfig?.defaultWoFilter ?? "all");
  const [invFilter,       setInvFilter]       = useState<InvFilterKey>("all");
  const [woDateRange,     setWoDateRange]     = useState<WODateRange>("all");
  const [woSearch,        setWoSearch]        = useState("");
  const [sortCol,         setSortCol]         = useState<SortCol | null>(null);
  const [sortDir,         setSortDir]         = useState<"asc" | "desc">("asc");
  const [bottomExpanded,  setBottom]          = useState(true);
  const [techExpanded,    setTechExpanded]    = useState(true);
  const [isRefreshing,    setIsRefreshing]    = useState(false);
  const [lastUpdated,     setLastUpdated]     = useState<Date>(() => new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!roleConfig) return;
    if (roleConfig.defaultMainTab) setMainTab(roleConfig.defaultMainTab);
    if (roleConfig.defaultWoFilter) setWoFilter(roleConfig.defaultWoFilter);
  }, [roleConfig?.variant, roleConfig?.defaultMainTab, roleConfig?.defaultWoFilter]);

  /* ── auto-refresh ── */
  useEffect(() => {
    if (!onRefresh) return;
    intervalRef.current = setInterval(() => { onRefresh(); setLastUpdated(new Date()); }, 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [onRefresh]);

  const handleRefresh = useCallback(() => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    onRefresh();
    setLastUpdated(new Date());
    setTimeout(() => setIsRefreshing(false), 800);
  }, [onRefresh]);

  /* ── keyboard shortcuts ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const inInput = ["INPUT", "TEXTAREA", "SELECT"].includes(tag);
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "n") {
        e.preventDefault(); router.push("/workorders/new");
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "a") {
        e.preventDefault(); router.push("/appointments/new");
      }
if (e.key === "r" && !inInput && !e.ctrlKey && !e.metaKey) handleRefresh();
      if (e.key === "Escape" && woSearch) setWoSearch("");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router, handleRefresh, woSearch]);

  /* ── sort handler ── */
  const handleSort = useCallback((col: SortCol) => {
    setSortCol((prev) => {
      if (prev === col) { setSortDir((d) => (d === "asc" ? "desc" : "asc")); return col; }
      setSortDir("asc"); return col;
    });
  }, []);

  /* ── WO date filter ── */
  const woDateStart = useMemo((): Date | null => {
    const now = new Date();
    if (woDateRange === "today") { const d = new Date(now); d.setHours(0,0,0,0); return d; }
    if (woDateRange === "week")  { const d = new Date(now); d.setDate(d.getDate() - 7); return d; }
    if (woDateRange === "month") { const d = new Date(now); d.setDate(d.getDate() - 30); return d; }
    return null;
  }, [woDateRange]);

  /* ── filter counts ── */
  const woCounts = useMemo(() => ({
    all:       recentWorkOrders.length,
    pending:   recentWorkOrders.filter((w) => WO_FILTERS.pending.includes(w.status)).length,
    active:    recentWorkOrders.filter((w) => WO_FILTERS.active.includes(w.status)).length,
    attention: recentWorkOrders.filter((w) => WO_FILTERS.attention.includes(w.status)).length,
    // Count 'completed'/'ready'/'cancelled' statuses PLUS closed WOs with a completed gate pass
    completed: recentWorkOrders.filter((w) =>
      ["completed", "ready", "cancelled"].includes(w.status) ||
      (w.status === "closed" && w.gate_pass_status === "completed")
    ).length,
  }), [recentWorkOrders]);

  const invCounts = useMemo(() => ({
    all:     recentInvoices.length,
    unpaid:  recentInvoices.filter((i) => INV_FILTERS.unpaid.includes(i.status)).length,
    overdue: recentInvoices.filter((i) => INV_FILTERS.overdue.includes(i.status)).length,
    paid:    recentInvoices.filter((i) => INV_FILTERS.paid.includes(i.status)).length,
    draft:   recentInvoices.filter((i) => INV_FILTERS.draft.includes(i.status)).length,
  }), [recentInvoices]);

  /* ── filtered + sorted WOs ── */
  const displayWOs = useMemo(() => {
    let list = recentWorkOrders;
    if (woFilter !== "all") {
      if (woFilter === "completed") {
        // 'completed' tab: normal completed statuses + closed WOs where gate pass is completed (picked up)
        list = list.filter((w) =>
          ["completed", "ready", "cancelled"].includes(w.status) ||
          (w.status === "closed" && w.gate_pass_status === "completed")
        );
      } else {
        // For all other filters, exclude 'closed' WOs unless they match the filter explicitly
        list = list.filter((w) => WO_FILTERS[woFilter].includes(w.status));
      }
    }
    if (woDateStart) list = list.filter((w) => new Date(w.created_at) >= woDateStart);
    if (woSearch.trim()) {
      const q = woSearch.toLowerCase();
      list = list.filter((w) =>
        w.wo_number.toLowerCase().includes(q) ||
        (w.customer || "").toLowerCase().includes(q) ||
        (w.vehicle   || "").toLowerCase().includes(q)
      );
    }
    if (sortCol) {
      list = [...list].sort((a, b) => {
        const av = (a[sortCol] ?? "") as string;
        const bv = (b[sortCol] ?? "") as string;
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    return list;
  }, [recentWorkOrders, woFilter, woDateStart, woSearch, sortCol, sortDir]);

  /* ── filtered invoices ── */
  const displayInvs = useMemo(() => {
    if (invFilter === "all") return recentInvoices;
    return recentInvoices.filter((i) => INV_FILTERS[invFilter].includes(i.status));
  }, [recentInvoices, invFilter]);

  /* ── derived ── */
  const weeklyDailyAvg = stats.week_revenue / 7;

  /* ── KPIs ── */
  const kpis = useMemo(() => [
    { label: "Revenue Today",     value: formatCurrency(stats.today_revenue),
      trend: <TrendBadge current={stats.today_revenue} baseline={weeklyDailyAvg} />,
      icon: DollarSign, iconColor: "text-success", iconBg: "bg-success/10", href: "/billing", pulse: false },
    { label: "Active Jobs",       value: String(workOrderSummary?.active_count ?? stats.active_work_orders),
      icon: Wrench,       iconColor: "text-primary",   iconBg: "bg-info/10",   href: "/workorders", pulse: false },
    { label: "Appointments",      value: String(stats.today_appointments),
      icon: Calendar,     iconColor: "text-primary", iconBg: "bg-primary/10", href: "/appointments", pulse: false },
    { label: "Overdue Invoices",  value: String(stats.overdue_invoices),
      sub: stats.overdue_invoices > 0 ? formatCurrency(stats.overdue_amount) : undefined,
      icon: AlertTriangle,
      iconColor: stats.overdue_invoices > 0 ? "text-destructive"   : "text-gray-300",
      iconBg:    stats.overdue_invoices > 0 ? "bg-destructive/10"      : "bg-gray-50",
      href: "/billing/invoices", pulse: stats.overdue_invoices > 0 },
    { label: "Low Stock",         value: String(stats.low_stock_items),
      icon: Package,
      iconColor: stats.low_stock_items > 0 ? "text-warning" : "text-gray-300",
      iconBg:    stats.low_stock_items > 0 ? "bg-warning/10"    : "bg-gray-50",
      href: "/inventory", pulse: stats.low_stock_items > 0 },
    { label: "Pending Estimates", value: String(stats.pending_estimates),
      icon: FileText,     iconColor: "text-sky-500",    iconBg: "bg-sky-50",    href: "/billing/estimates", pulse: false },
    { label: "Customers",         value: String(stats.total_customers),
      icon: Users,        iconColor: "text-info",   iconBg: "bg-cyan-50",   href: "/customers", pulse: false },
    { label: "Month Revenue",     value: formatCurrency(stats.month_revenue),
      trend: <TrendBadge current={stats.month_revenue} baseline={stats.week_revenue * 4.3} />,
      icon: TrendingUp,   iconColor: "text-violet-600", iconBg: "bg-violet-50", href: "/reports", pulse: false },
  ], [stats, workOrderSummary, weeklyDailyAvg, formatCurrency]);

  const visibleKpis = useMemo(() => {
    if (!roleConfig || roleConfig.kpiLabels === "all") return kpis;
    const allowed = new Set(roleConfig.kpiLabels);
    return kpis.filter((k) => allowed.has(k.label));
  }, [kpis, roleConfig]);

  const kpiGridClass = useMemo(() => {
    const n = visibleKpis.length;
    if (n <= 3) return "grid grid-cols-2 gap-3 sm:grid-cols-3";
    if (n <= 4) return "grid grid-cols-2 gap-3 sm:grid-cols-4";
    if (n <= 6) return "grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6";
    return "grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8";
  }, [visibleKpis.length]);

  if (isLoading) return <PerfexSkeleton />;

  /* ═══════════ RENDER ═══════════ */
  return (
    <div className="space-y-4 p-4 pb-8 max-w-[1700px] mx-auto">
      <DynamicPageTitle title={roleConfig?.title ?? "Dashboard"} />

      {queryErrors.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3">
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Some data could not be loaded: {queryErrors.join(", ")}. Metrics may be incomplete.
            </span>
          </div>
          {onRefresh && (
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefreshing ? "animate-spin" : ""}`} />
              Retry
            </Button>
          )}
        </div>
      )}

      {/* ── Page Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:mb-4">
        <div>
          <h1 className="text-base font-semibold text-foreground">{roleConfig?.title ?? "Dashboard"}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {roleConfig?.subtitle ?? todayLabel}
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          {onRefresh && (
            <button onClick={handleRefresh} disabled={isRefreshing}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 mr-1"
              title="Refresh (R)"
              aria-label="Refresh dashboard">
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{formatDistanceToNow(lastUpdated, { addSuffix: true })}</span>
            </button>
          )}
          {roleConfig?.showCheckIn && (
            <Button variant="default" size="sm" asChild>
              <Link href="/check-in">
                <UserCheck className="h-3.5 w-3.5 mr-1" /> Check-in
              </Link>
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href="/appointments/new" title="New appointment (Ctrl+Shift+A)">
              <Plus className="h-3.5 w-3.5 mr-1" /> Appointment
            </Link>
          </Button>
          {roleConfig?.variant === "accountant" ? (
            <Button size="sm" asChild>
              <Link href="/billing/invoices">
                <Receipt className="h-3.5 w-3.5 mr-1" /> Invoices
              </Link>
            </Button>
          ) : roleConfig?.variant === "parts_manager" ? (
            <Button size="sm" asChild>
              <Link href="/inventory">
                <Package className="h-3.5 w-3.5 mr-1" /> Inventory
              </Link>
            </Button>
          ) : (
            <Button size="sm" asChild>
              <Link href="/workorders/new" title="New work order (Ctrl+N)">
                <Plus className="h-3.5 w-3.5 mr-1" /> Work Order
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className={kpiGridClass}>
        {visibleKpis.map((card) => (
          <Link key={card.label} href={card.href}
            className={`relative flex items-center gap-3 rounded-md border bg-card p-3
                        shadow-[0px_1px_15px_1px_rgba(90,90,90,0.08)]
                        transition-colors hover:border-primary/30 hover:bg-muted/30
                        ${card.pulse ? "border-border/80 ring-1 ring-offset-1 ring-red-200 animate-[pulse_2s_ease-in-out_infinite]" : "border-border"}`}>
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${card.iconBg}`}>
              <card.icon className={`h-4 w-4 ${card.iconColor}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] leading-tight text-muted-foreground">{card.label}</p>
              <p className="text-sm font-semibold leading-tight text-foreground">{card.value}</p>
              {"sub" in card && card.sub && <p className="text-[10px] text-destructive leading-tight">{card.sub}</p>}
              {"trend" in card && card.trend}
            </div>
          </Link>
        ))}
      </div>

      <DashboardShortcutBar />

      {showSection("wo_status_breakdown") && workOrderByStatus.length > 0 && (
        <div className="rounded-md border border-border bg-card px-4 py-3 shadow-[0px_1px_15px_1px_rgba(90,90,90,0.08)]">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Work orders by status (30 days)
            </h2>
            <Link href="/reports/operations" className="text-[11px] text-primary hover:underline">
              Operations report
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {workOrderByStatus.map((row) => (
              <Link
                key={row.status}
                href={`/workorders?status=${encodeURIComponent(row.status)}`}
                className="inline-flex items-center gap-2 rounded-md border border-border/80 bg-muted/30 px-2.5 py-1.5 text-xs transition-colors hover:border-primary/30 hover:bg-muted/60"
              >
                <StatusPill status={row.status} map={WO_STATUS_COLORS} />
                <span className="font-semibold tabular-nums text-foreground">{row.count}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Main Grid: Work Orders/Invoices + Appointments ── */}
      {(showSection("main_table") || showSection("appointments")) && (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">

        {/* Tabbed table: Work Orders | Invoices */}
        {showSection("main_table") && (
        <div className={`overflow-hidden rounded-md border border-border bg-card
                        shadow-[0px_1px_15px_1px_rgba(90,90,90,0.08)] ${showSection("appointments") ? "lg:col-span-8" : "lg:col-span-12"}`}>

          {/* Top bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            {/* Main tabs */}
            <div className="flex items-center gap-0">
              {(["workorders", "invoices"] as MainTab[]).map((tab) => (
                <button key={tab} onClick={() => setMainTab(tab)}
                  className={`border-b-2 px-3 py-1.5 text-xs font-medium capitalize transition-colors
                    ${mainTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                  {tab === "workorders" ? "Work Orders" : "Invoices"}
                </button>
              ))}
            </div>
            {/* Search (WO only) + view all */}
            <div className="flex items-center gap-2">
              {mainTab === "workorders" && (
                <>
                  {/* Date range */}
                  <div className="flex items-center gap-0 rounded border border-border overflow-hidden">
                    {(["all","today","week","month"] as WODateRange[]).map((r) => (
                      <button key={r} onClick={() => setWoDateRange(r)}
                        className={`px-2 py-1 text-[10px] font-medium capitalize transition-colors
                          ${woDateRange === r ? "bg-primary text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}>
                        {r}
                      </button>
                    ))}
                  </div>
                  {/* Search */}
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                    <input type="text" placeholder="Search…" value={woSearch}
                      onChange={(e) => setWoSearch(e.target.value)}
                      className="h-7 w-36 rounded border border-border bg-background pl-7 pr-6 text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
                    {woSearch && (
                      <button onClick={() => setWoSearch("")}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </>
              )}
              <Link href={mainTab === "workorders" ? "/workorders" : "/billing/invoices"}
                className="flex items-center gap-1 text-xs text-primary hover:underline whitespace-nowrap">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>

          {/* Filter tabs row */}
          <div className="flex items-center gap-0 border-b border-border bg-muted/30 px-4 overflow-x-auto print:hidden">
            {mainTab === "workorders"
              ? (Object.keys(WO_FILTERS) as WOFilterKey[]).map((key) => (
                  <button key={key} onClick={() => setWoFilter(key)}
                    className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-[11px] font-medium capitalize transition-colors
                      ${woFilter === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                    {key}
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none
                      ${woFilter === key ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
                      {woCounts[key]}
                    </span>
                  </button>
                ))
              : (Object.keys(INV_FILTERS) as InvFilterKey[]).map((key) => (
                  <button key={key} onClick={() => setInvFilter(key)}
                    className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-[11px] font-medium capitalize transition-colors
                      ${invFilter === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                    {key}
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none
                      ${invFilter === key ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
                      {invCounts[key]}
                    </span>
                  </button>
                ))}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {mainTab === "workorders" ? (
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-border bg-[#f1f5f9]">
                    <SortHeader col="wo_number"  label="WO #"     sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="whitespace-nowrap" />
                    <SortHeader col="customer"   label="Customer" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                    <th className="px-4 py-2 text-left text-xs font-semibold text-[#374151]">Vehicle</th>
                    <SortHeader col="status"     label="Status"   sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                    <SortHeader col="created_at" label="Date"     sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="whitespace-nowrap" />
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {displayWOs.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <Wrench className="h-8 w-8 text-muted-foreground/30" />
                        <p className="text-sm font-medium text-muted-foreground">
                          {woSearch ? `No results for "${woSearch}"` : "No work orders found"}
                        </p>
                        {!woSearch && woFilter === "all" && woDateRange === "all" && (
                          <Button size="sm" asChild><Link href="/workorders/new"><Plus className="h-3.5 w-3.5 mr-1" />Create work order</Link></Button>
                        )}
                        {(woSearch || woFilter !== "all" || woDateRange !== "all") && (
                          <button onClick={() => { setWoSearch(""); setWoFilter("all"); setWoDateRange("all"); }}
                            className="text-xs text-primary hover:underline">Clear filters</button>
                        )}
                      </div>
                    </td></tr>
                  ) : displayWOs.slice(0, 10).map((wo) => (
                    <tr key={wo.id} className="border-b border-border/50 transition-colors hover:bg-muted/40">
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs font-medium text-primary">{wo.wo_number}</td>
                      <td className="px-4 py-2.5 text-xs text-foreground">{wo.customer || "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-foreground">{wo.vehicle   || "—"}</td>
                      <td className="px-4 py-2.5">
                        {(() => {
                          const stagePresentation = getWorkOrderStagePresentation(wo);
                          const useStageAsPrimary = [
                            "diagnosis",
                            "awaiting_approval",
                            "approved",
                            "in_progress",
                            "paused",
                            "additional_work_found",
                            "quality_check",
                            "completed",
                            "discontinued_pending_bill",
                            "closed",
                          ].includes(wo.status) && !!stagePresentation.label;
                          return (
                            <div className="flex flex-wrap items-center gap-1">
                              <StatusPill
                                status={wo.status}
                                map={WO_STATUS_COLORS}
                                label={useStageAsPrimary ? stagePresentation.label : undefined}
                              />
                              {stagePresentation.label && !useStageAsPrimary ? (
                                <span className="inline-flex items-center rounded border border-border/80 bg-background px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                                  {stagePresentation.label}
                                </span>
                              ) : null}
                              {wo.gate_pass_status === 'completed' && (
                                <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium border border-success/30 text-success bg-success/5" title="Vehicle Picked Up">
                                  <Truck className="w-2.5 h-2.5" /> Picked Up
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">{format(new Date(wo.created_at), "MMM d")}</td>
                      <td className="px-4 py-2.5">
                        <Link href={`/workorders/${wo.id}`} className="text-muted-foreground hover:text-primary">
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              /* ── Invoices table ── */
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-border bg-[#f1f5f9]">
                    <th className="whitespace-nowrap px-4 py-2 text-left text-xs font-semibold text-[#374151]">Invoice #</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-[#374151]">Customer</th>
                    <th className="whitespace-nowrap px-4 py-2 text-right text-xs font-semibold text-[#374151]">Total</th>
                    <th className="whitespace-nowrap px-4 py-2 text-right text-xs font-semibold text-[#374151]">Balance Due</th>
                    <th className="whitespace-nowrap px-4 py-2 text-left text-xs font-semibold text-[#374151]">Due Date</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-[#374151]">Status</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {displayInvs.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <Receipt className="h-8 w-8 text-muted-foreground/30" />
                        <p className="text-sm font-medium text-muted-foreground">No invoices found</p>
                      </div>
                    </td></tr>
                  ) : displayInvs.slice(0, 10).map((inv) => {
                    const invCls = (INV_STATUS[inv.status] ?? INV_STATUS.draft).cls;
                    const invLbl = (INV_STATUS[inv.status] ?? INV_STATUS.draft).label;
                    return (
                      <tr key={inv.id} className="border-b border-border/50 transition-colors hover:bg-muted/40">
                        <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs font-medium text-primary">{inv.invoice_number}</td>
                        <td className="px-4 py-2.5 text-xs text-foreground">{inv.customer_name || "—"}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs font-medium text-foreground">{formatCurrency(inv.total)}</td>
                        <td className={`whitespace-nowrap px-4 py-2.5 text-right text-xs font-semibold ${inv.balance_due > 0 ? "text-destructive" : "text-success"}`}>
                          {formatCurrency(inv.balance_due)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                          {inv.due_date ? format(new Date(inv.due_date), "MMM d, yyyy") : "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${invCls}`}>{invLbl}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <Link href={`/billing/invoices/${inv.id}`} className="text-muted-foreground hover:text-primary">
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
        )}

        {/* Today's Appointments */}
        {showSection("appointments") && (
        <div className="overflow-hidden rounded-md border border-border bg-card
                        shadow-[0px_1px_15px_1px_rgba(90,90,90,0.08)] lg:col-span-4">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">Appointments</h2>
              {todayAppointments.length > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {todayAppointments.length}
                </span>
              )}
            </div>
            <Link href="/appointments" className="flex items-center gap-1 text-xs text-primary hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-border/50">
            {todayAppointments.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
                <Calendar className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm font-medium text-muted-foreground">No appointments today</p>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/appointments/new"><Plus className="h-3.5 w-3.5 mr-1" /> Schedule one</Link>
                </Button>
              </div>
            ) : todayAppointments.slice(0, 10).map((appt) => {
              const upcoming  = isUpcomingSoon(appt.appointment_time);
              const confirmed = appt.status === "confirmed";
              return (
                <Link key={appt.id} href={`/appointments/${appt.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40">
                  <span className="relative flex h-2 w-2 shrink-0">
                    {upcoming && confirmed && (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                    )}
                    <span className={`relative inline-flex h-2 w-2 rounded-full ${confirmed ? "bg-success/100" : "bg-amber-400"}`} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{appt.customer_name || "Unknown"}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {appt.vehicle_display || appt.vehicle_info || "No vehicle"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {appt.appointment_time && (
                      <p className={`text-[11px] font-medium ${upcoming ? "text-success" : "text-muted-foreground"}`}>
                        {appt.appointment_time}
                      </p>
                    )}
                    <StatusPill status={appt.status} map={WO_STATUS_COLORS} />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
        )}
      </div>
      )}

      {/* ── Bottom Row: Pipeline + Revenue + Alerts (collapsible) ── */}
      {showSection("bottom_summary") && (
      <div className="rounded-md border border-border bg-card/50 shadow-[0px_1px_15px_1px_rgba(90,90,90,0.06)]">
        <button onClick={() => setBottom((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-muted/30 rounded-t-md print:hidden">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Key Metrics</span>
          {bottomExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        {bottomExpanded && (
          <div className="grid grid-cols-1 gap-0 border-t border-border md:grid-cols-3">

            {/* Pipeline */}
            <div className="border-b border-border p-4 md:border-b-0 md:border-r">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-foreground">Work Order Pipeline</h3>
                <Link href="/workorders" className="text-[11px] text-primary hover:underline">View</Link>
              </div>
              <div className="space-y-2">
                {[
                  { label: "Pending",            value: workOrderSummary?.pending_count   ?? 0, dot: "bg-orange-400" },
                  { label: "Active / In Repair",  value: workOrderSummary?.active_count    ?? stats.active_work_orders, dot: "bg-info/100" },
                  { label: "Attention Needed",    value: workOrderSummary?.attention_count ?? 0, dot: "bg-destructive/100"    },
                  { label: "Completed (30 days)", value: workOrderSummary?.completed       ?? 0, dot: "bg-success/100"  },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${row.dot}`} />
                      <span className="text-xs text-foreground">{row.label}</span>
                    </div>
                    <span className="text-xs font-semibold tabular-nums text-foreground">{row.value}</span>
                  </div>
                ))}
              </div>
              {workOrderSummary?.average_completion_hours != null && (
                <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" /> Avg. turnaround
                  </span>
                  <span className="text-xs font-medium text-foreground">
                    {workOrderSummary.average_completion_hours.toFixed(1)} h
                  </span>
                </div>
              )}
            </div>

            {/* Revenue + 7-day chart */}
            <div className="border-b border-border p-4 md:border-b-0 md:border-r">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-foreground">Revenue</h3>
                <Link href="/billing" className="text-[11px] text-primary hover:underline">Billing</Link>
              </div>
              <div className="space-y-2 mb-2">
                {[
                  { label: "Today",      value: formatCurrency(stats.today_revenue),  bold: true },
                  { label: "This week",  value: formatCurrency(stats.week_revenue),   bold: false },
                  { label: "This month", value: formatCurrency(stats.month_revenue),  bold: false },
                  { label: "MRR",        value: formatCurrency(stats.mrr),            bold: false },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{row.label}</span>
                    <span className={`text-xs tabular-nums ${row.bold ? "font-bold text-success" : "font-medium text-foreground"}`}>
                      {row.value}
                    </span>
                  </div>
                ))}
                {invoiceStats?.financials && (
                  <>
                    <div className="my-1 border-t border-border/60" />
                    {[
                      { label: "Paid (invoices)",  value: formatCurrency(invoiceStats.financials.total_paid    ?? 0), color: "text-success" },
                      { label: "Outstanding",       value: formatCurrency(invoiceStats.financials.outstanding_total ?? 0), color: "text-warning" },
                      { label: "Past due",          value: formatCurrency(invoiceStats.financials.past_due_total ?? 0), color: "text-destructive" },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{row.label}</span>
                        <span className={`text-xs font-semibold tabular-nums ${row.color}`}>{row.value}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
              <DailyRevChart data={revenueChartData} formatCurrency={formatCurrency} />
            </div>

            {/* Alerts */}
            <div className="p-4">
              <h3 className="mb-3 text-xs font-semibold text-foreground">Active Alerts</h3>
              <div className="-mx-1 space-y-0">
                {[
                  { icon: AlertTriangle, label: "Overdue invoices",  value: stats.overdue_invoices,  sub: stats.overdue_invoices  > 0 ? formatCurrency(stats.overdue_amount) : null, href: "/billing/invoices",  active: "text-destructive"   },
                  { icon: Package,       label: "Low stock items",    value: stats.low_stock_items,   sub: null, href: "/inventory",          active: "text-warning" },
                  { icon: FileText,      label: "Pending estimates",  value: stats.pending_estimates, sub: null, href: "/billing/estimates",  active: "text-blue-500"  },
                  { icon: Truck,         label: "Roadside active",    value: stats.active_roadside,   sub: stats.active_roadside > 0 ? `${stats.roadside_completed_today} done today` : null, href: "/roadside", active: "text-teal-500" },
                ].map((alert) => (
                  <Link key={alert.label} href={alert.href}
                    className="flex items-center justify-between rounded px-1.5 py-2 transition-colors hover:bg-muted/60">
                    <div className="flex items-center gap-2.5">
                      <alert.icon className={`h-3.5 w-3.5 shrink-0 ${alert.value > 0 ? alert.active : "text-gray-300"}`} />
                      <div>
                        <p className="text-xs text-foreground">{alert.label}</p>
                        {alert.sub && <p className="text-[10px] text-muted-foreground">{alert.sub}</p>}
                      </div>
                    </div>
                    <span className={`text-xs font-semibold tabular-nums ${alert.value > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                      {alert.value}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {/* ── Technician Performance ── */}
      {showSection("technician_perf") && technicianData.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border bg-card shadow-[0px_1px_15px_1px_rgba(90,90,90,0.08)]">
          <button onClick={() => setTechExpanded((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/30 print:hidden">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <UserCheck className="h-4 w-4 text-primary" />
              Top Technician Performance
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {technicianData.length}
              </span>
            </h2>
            <div className="flex items-center gap-2">
              <Link href="/reports/efficiency" onClick={(e) => e.stopPropagation()}
                className="text-xs text-primary hover:underline">Full report</Link>
              {techExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </button>
          {techExpanded && (
            <div className="overflow-x-auto border-t border-border">
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-border bg-[#f1f5f9]">
                    <th className="px-4 py-2 text-left text-xs font-semibold text-[#374151]">Technician</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-[#374151]">Total Jobs</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-[#374151]">Completed</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-[#374151]">In Progress</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-[#374151] min-w-[140px]">Completion Rate</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-[#374151]">Avg Days</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-[#374151]">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {technicianData.map((tech, idx) => {
                    const name = tech.technician_name || tech.name || `Tech ${idx + 1}`;
                    const rate = tech.completion_rate ?? 0;
                    return (
                      <tr key={`tech-${idx}`} className="border-b border-border/50 transition-colors hover:bg-muted/40">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                              {name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-xs font-medium text-foreground">{name}</span>
                              {tech.role && (
                                <span className={`text-[10px] font-medium ${tech.role === "service_coordinator" ? "text-blue-500" : "text-muted-foreground"}`}>
                                  {tech.role === "service_coordinator" ? "Service Coordinator" : "Technician"}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center text-xs font-medium text-foreground">{tech.total_jobs ?? "—"}</td>
                        <td className="px-4 py-2.5 text-center text-xs text-success font-medium">{tech.completed_jobs ?? "—"}</td>
                        <td className="px-4 py-2.5 text-center text-xs text-primary font-medium">{tech.in_progress_jobs ?? "—"}</td>
                        <td className="px-4 py-2.5"><RateBar rate={rate} /></td>
                        <td className="px-4 py-2.5 text-center text-xs text-muted-foreground">
                          {tech.avg_completion_days != null ? `${tech.avg_completion_days.toFixed(1)}d` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs font-medium text-foreground">
                          {tech.total_revenue != null ? formatCurrency(tech.total_revenue) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Low Stock Table ── */}
      {showSection("low_stock") && lowStockItems.length > 0 && (
        <div className="overflow-hidden rounded-md border border-border bg-card shadow-[0px_1px_15px_1px_rgba(90,90,90,0.08)]">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              Low Stock
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                {lowStockItems.length}
              </span>
            </h2>
            <Link href="/inventory" className="flex items-center gap-1 text-xs text-primary hover:underline">
              Manage <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-[#f1f5f9]">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-[#374151]">Part Name</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-[#374151]">Part #</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-[#374151]">In Stock</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-[#374151]">Reorder At</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-[#374151]">Status</th>
                </tr>
              </thead>
              <tbody>
                {lowStockItems.slice(0, 8).map((item, idx) => {
                  const critical = item.quantity === 0;
                  return (
                    <tr key={item.id ?? `stock-${idx}`} className="border-b border-border/50 transition-colors hover:bg-muted/40">
                      <td className="px-4 py-2.5 text-xs font-medium text-foreground">
                        {item.id ? (
                          <Link href={`/inventory/parts/${item.id}`} className="text-primary hover:underline">
                            {item.name}
                          </Link>
                        ) : (
                          item.name
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{item.part_number || "—"}</td>
                      <td className="px-4 py-2.5 text-xs font-semibold text-foreground">{item.quantity}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{item.reorder_point}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${critical ? "bg-red-100 text-destructive" : "bg-amber-100 text-amber-700"}`}>
                          {critical ? "Out of stock" : "Low stock"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

            {/* ── Service Due — card grid ── */}
      {showSection("service_due") && serviceDueVehicles && serviceDueVehicles.length > 0 && (
        <div className="overflow-hidden rounded-md border border-warning/20 bg-card shadow-[0px_1px_15px_1px_rgba(90,90,90,0.08)]">
          <div className="flex items-center justify-between border-b border-warning/20 bg-warning/10/60 px-4 py-2.5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-warning">
              <AlertCircle className="h-4 w-4" />
              Service Due
              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-warning">
                {serviceDueVehicles.length}
              </span>
            </h2>
            <div className="flex items-center gap-3">
              <p className="hidden text-[11px] text-amber-700 sm:block">
                Vehicles flagged based on mileage or time since last recorded service
              </p>
              <Link href="/vehicles" className="flex items-center gap-1 text-xs text-amber-700 hover:text-warning hover:underline">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {serviceDueVehicles.map((v) => {
              const days   = daysSince(v.last_service_date);
              const danger = !v.last_service_date || !v.mileage || (days !== null && days > 180);
              return (
                <Link key={v.id} href={`/vehicles/${v.id}`}
                  className={`flex flex-col gap-2 rounded-md border p-3 transition-colors hover:shadow-sm
                    ${danger ? "border-destructive/20 bg-destructive/10/40 hover:border-red-300" : "border-warning/20 bg-warning/10/40 hover:border-amber-300"}`}>
                  <div className="flex items-start justify-between gap-1">
                    <span className={`rounded px-1.5 py-0.5 font-mono text-xs font-bold
                      ${danger ? "bg-red-100 text-destructive" : "bg-amber-100 text-amber-700"}`}>
                      {v.license_plate}
                    </span>
                    <AlertTriangle className={`h-3.5 w-3.5 shrink-0 ${danger ? "text-destructive" : "text-warning"}`} />
                  </div>
                  <p className="truncate text-[11px] font-medium text-foreground" title={v.vehicle_info}>
                    {v.vehicle_info}
                  </p>
                  <div className="mt-auto space-y-0.5">
                    {v.mileage && (
                      <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Car className="h-2.5 w-2.5" /> {v.mileage.toLocaleString()} km
                      </p>
                    )}
                    {days !== null
                      ? <p className={`text-[10px] font-medium ${danger ? "text-destructive" : "text-warning"}`}>
                          {days}d since last service
                        </p>
                      : <p className="text-[10px] text-muted-foreground">No service record</p>
                    }
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
