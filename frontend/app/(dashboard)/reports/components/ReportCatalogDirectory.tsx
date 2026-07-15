"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  BarChart3,
  Car,
  ClipboardList,
  DollarSign,
  FileBarChart,
  Package,
  Search,
  Settings2,
  Users,
  Wrench,
} from "lucide-react";
import type { ReportCatalogItem } from "@/lib/api/reporting";
import type { LucideIcon } from "lucide-react";

const HUB_TAB_ROUTES: Record<string, string> = {
  financial: "/reports/financial",
  operational: "/reports/operational",
  inventory: "/reports/inventory",
  customers: "/reports/customers",
  subscriptions: "/reports/subscriptions",
  vehicles: "/reports/vehicles",
  controls: "/reports/controls",
};

const CATALOG_ROUTE_BY_KEY: Record<string, string> = {
  revenue: "/reports/financial",
  profit_margin: "/accounting/reports/margin-analysis",
  work_orders: "/reports/operations",
  technician_performance: "/reports/efficiency",
  appointments: "/appointments",
  inventory: "/inventory/reports/accounting",
  inventory_turnover: "/inventory/reports/accounting",
  low_stock: "/inventory",
  customers: "/customers",
  vehicles: "/vehicles",
  service_due: "/vehicles",
  subscriptions: "/subscriptions",
  service_bundles: "/reports/bundles",
  controls: "/reports/controls",
  roadside_revenue: "/reports/operations",
  exception_log: "/reports/operations",
  system_usage: "/reports/operations",
  traceability: "/reports/operations",
  capacity_planning: "/reports/operations",
  dashboard_overview: "/dashboard",
  cost_control_return_jobs: "/accounting/reports/cost-control",
  ap_cycle_time: "/reports/operations",
};

const ACCOUNTING_LINKS = [
  { name: "Balance Sheet", href: "/accounting/reports/balance-sheet", icon: FileBarChart },
  { name: "Profit & Loss", href: "/accounting/reports/profit-loss", icon: DollarSign },
  { name: "General Ledger", href: "/accounting/reports/general-ledger", icon: ClipboardList },
  { name: "Trial Balance", href: "/accounting/reports/trial-balance", icon: BarChart3 },
  { name: "AR/AP Aging", href: "/accounting/reports/aging", icon: DollarSign },
  { name: "Cash Flow", href: "/accounting/reports/cash-flow", icon: DollarSign },
  { name: "Management Dashboard", href: "/accounting/reports/management", icon: BarChart3 },
  { name: "Job Profitability", href: "/accounting/reports/job-profitability", icon: Wrench },
  { name: "OPEX Variance", href: "/accounting/reports/opex-variance", icon: BarChart3 },
];

const INVENTORY_LINKS = [
  { name: "Compliance Reports", href: "/inventory/reports/compliance", icon: ClipboardList },
  { name: "Inventory GL Report", href: "/inventory/reports/accounting", icon: Package },
];

const OPS_LINKS = [
  { name: "Operations Intelligence", href: "/reports/operations", icon: Settings2 },
  { name: "Technician Efficiency", href: "/reports/efficiency", icon: Wrench },
  { name: "Service Bundles", href: "/reports/bundles", icon: Package },
];

type FilterKey = "all" | "hub" | "financial" | "operations" | "inventory" | "accounting";

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "hub", label: "Hub tabs" },
  { key: "financial", label: "Financial" },
  { key: "operations", label: "Operations" },
  { key: "inventory", label: "Inventory" },
  { key: "accounting", label: "Accounting GL" },
];

const CATEGORY_ICON: Record<string, LucideIcon> = {
  financial: DollarSign,
  operations: Wrench,
  inventory: Package,
  customers: Users,
  vehicles: Car,
  subscriptions: BarChart3,
  governance: Settings2,
};

import { WORKSHOP_PANEL_CLASS } from "@/lib/constants/table-typography";

interface ReportCatalogDirectoryProps {
  reports: ReportCatalogItem[];
}

type DirectoryEntry = {
  id: string;
  name: string;
  description?: string;
  href?: string;
  hubTab?: string;
  group: string;
  drillDown?: boolean;
  isHub?: boolean;
};

function buildEntries(reports: ReportCatalogItem[]): DirectoryEntry[] {
  const catalog: DirectoryEntry[] = reports.map((item) => ({
    id: item.key,
    name: item.name,
    group: item.category,
    drillDown: item.drill_down,
    isHub: item.key === "revenue" || item.key === "controls",
    hubTab: item.key === "revenue" ? "financial" : item.key === "controls" ? "controls" : undefined,
    href:
      (item.key === "revenue" ? HUB_TAB_ROUTES.financial : undefined) ||
      (item.key === "controls" ? HUB_TAB_ROUTES.controls : undefined) ||
      CATALOG_ROUTE_BY_KEY[item.key] ||
      "/reports",
  }));

  const accounting = ACCOUNTING_LINKS.map((l) => ({
    id: `acct-${l.href}`,
    name: l.name,
    href: l.href,
    group: "accounting",
  }));

  const inventory = INVENTORY_LINKS.map((l) => ({
    id: `inv-${l.href}`,
    name: l.name,
    href: l.href,
    group: "inventory",
  }));

  const ops = OPS_LINKS.map((l) => ({
    id: `ops-${l.href}`,
    name: l.name,
    href: l.href,
    group: "operations",
  }));

  return [...catalog, ...accounting, ...inventory, ...ops];
}

function matchesFilter(entry: DirectoryEntry, filter: FilterKey): boolean {
  if (filter === "all") return true;
  if (filter === "hub") return Boolean(entry.isHub);
  if (filter === "accounting") return entry.group === "accounting" || entry.id.startsWith("acct-");
  if (filter === "inventory") return entry.group === "inventory" || entry.id.startsWith("inv-");
  if (filter === "operations") {
    return entry.group === "operations" || entry.id.startsWith("ops-");
  }
  if (filter === "financial") {
    return entry.group === "financial" || entry.group === "subscriptions" || entry.group === "governance";
  }
  return true;
}

export function ReportCatalogDirectory({
  reports,
}: ReportCatalogDirectoryProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  const allEntries = useMemo(() => buildEntries(reports), [reports]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allEntries.filter((entry) => {
      if (!matchesFilter(entry, filter)) return false;
      if (!q) return true;
      return (
        entry.name.toLowerCase().includes(q) ||
        entry.group.toLowerCase().includes(q) ||
        entry.id.toLowerCase().includes(q)
      );
    });
  }, [allEntries, filter, query]);

  return (
    <div className={WORKSHOP_PANEL_CLASS}>
      <div className="space-y-3 border-b border-[color:var(--outline-variant)] px-4 py-3.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
              <FileBarChart className="h-4 w-4 text-primary" />
              Report Directory
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Search and open any report — hub analytics, accounting, inventory, or operations.
            </p>
          </div>
          <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {filtered.length} of {allEntries.length} reports
          </p>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reports…"
            className="h-9 pl-9 text-sm"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setFilter(opt.key)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === opt.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-[color:var(--outline-variant)] bg-background text-muted-foreground hover:bg-muted/60"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No reports match your search. Try another filter or clear the search box.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((entry) => {
              const Icon = CATEGORY_ICON[entry.group] ?? FileBarChart;
              const content = (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                  <p className="mt-3 text-sm font-medium leading-snug text-foreground">{entry.name}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge variant="outline" className="text-xs capitalize">
                      {entry.group.replace(/_/g, " ")}
                    </Badge>
                    {entry.isHub && (
                      <Badge variant="secondary" className="text-xs">
                        Hub tab
                      </Badge>
                    )}
                    {entry.drillDown && (
                      <Badge variant="outline" className="text-xs">
                        Drill-down
                      </Badge>
                    )}
                  </div>
                </>
              );

              return (
                <Link
                  key={entry.id}
                  href={entry.href ?? "/reports"}
                  className="group flex flex-col rounded-lg border border-[color:var(--outline-variant)] bg-muted/20 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-muted/40"
                >
                  {content}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
