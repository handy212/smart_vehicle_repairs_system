"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Package,
  Tags,
  Truck,
  FileText,
  Boxes,
  TrendingUp,
  ArrowLeftRight,
  Receipt,
  ClipboardList,
  Calculator,
  MinusSquare,
  Banknote,
  Undo2,
  CreditCard,
  LayoutDashboard,
  Users,
  ShieldCheck,
  Building2,
  Database,
  Settings,
  Mail,
  History,
  Inbox,
  BarChart3,
  BookOpen,
  Hash,
  Landmark,
  Scale,
  PieChart,
  Library,
  Clock,
  Activity,
  Percent,
  Target,
  Wallet,
  Repeat,
  Zap,
  Shield,
  UserPlus,
  Calendar,
  Briefcase,
  GraduationCap,
  Star,
  FileCheck,
  MessageSquare,
  LucideIcon,
  Puzzle,
  LayoutGrid,
  ShieldAlert,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";

import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { useQuery } from "@tanstack/react-query";
import { adminApi, SystemSetting } from "@/lib/api/admin";
import { useMemo } from "react";
import { useTheme } from "@/lib/hooks/useTheme";
import { ensureVisibleColor } from "@/lib/utils/color-utils";

interface SubNavItem {
  name: string;
  href: string;
  permission?: string;
  icon?: LucideIcon;
}

interface SubNavProps {
  items: SubNavItem[];
  title: string;
  onToggle?: (collapsed: boolean) => void;
  isCollapsed?: boolean;
  sidebarCollapsed?: boolean;
}

export function SubNav({ items, title, onToggle, isCollapsed: externalCollapsed, sidebarCollapsed = false }: SubNavProps) {
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const isCollapsed = externalCollapsed !== undefined ? externalCollapsed : internalCollapsed;

  // Calculate left position based on sidebar state
  // Sidebar: 256px (w-64) when expanded, 64px (w-16) when collapsed
  const sidebarLeft = sidebarCollapsed ? 64 : 256;

  const { data: brandingSettings } = useQuery<SystemSetting[]>({
    queryKey: ["settings", "branding", "public"],
    queryFn: () => adminApi.settings.publicBranding(),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const branding = useMemo(() => {
    if (!brandingSettings) {
      return {
        primary_color: "#ff8040", // Default orange
      };
    }

    const getSetting = (key: string): string | null => {
      const setting = brandingSettings.find((s) => s.key === key);
      return setting?.value && setting.value.trim() !== "" ? setting.value : null;
    };

    return {
      primary_color: getSetting("primary_color") || "#ff8040",
    };
  }, [brandingSettings]);

  const handleToggle = () => {
    const newState = !isCollapsed;
    if (externalCollapsed === undefined) {
      setInternalCollapsed(newState);
    }
    onToggle?.(newState);
  };

  // Shared logic: compute active item using longest-match strategy
  const getIsActive = (item: SubNavItem) => {
    const matchingItems = items.filter(i =>
      pathname === i.href || pathname?.startsWith(i.href + "/")
    );
    const longestMatch = matchingItems.reduce((prev, curr) =>
      curr.href.length > prev.href.length ? curr : prev,
      { href: "" }
    );
    return item.href === longestMatch.href;
  };

  const isDark = resolvedTheme === "dark";
  const visiblePrimary = branding.primary_color ? ensureVisibleColor(branding.primary_color, isDark) : undefined;

  return (
    <>
      {/* Mobile: Horizontal scrollable tab bar */}
      <div
        className="fixed top-16 left-0 right-0 z-20 lg:hidden bg-background/90 backdrop-blur-xl border-b border-border/60 shadow-sm"
      >
        <nav className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto scrollbar-none">
          {items.map((item) => {
            const isActive = getIsActive(item);

            const navItem = (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200 whitespace-nowrap shrink-0 relative overflow-hidden",
                  isActive
                    ? "font-semibold shadow-sm ring-1 ring-black/5 dark:ring-white/10"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
                style={isActive ? {
                  backgroundColor: `${visiblePrimary}15`,
                  color: visiblePrimary,
                } : undefined}
              >
                {item.icon && (
                  <item.icon
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 transition-colors",
                      isActive ? "" : "text-muted-foreground"
                    )}
                    style={isActive ? { color: visiblePrimary } : undefined}
                  />
                )}
                <span>{item.name}</span>
              </Link>
            );

            if (item.permission) {
              return (
                <PermissionGuard key={item.name} permission={item.permission}>
                  {navItem}
                </PermissionGuard>
              );
            }

            return navItem;
          })}
        </nav>
      </div>

      {/* Desktop: Vertical sidebar (unchanged) */}
      <aside
        className={cn(
          "fixed top-16 bottom-0 z-10 transition-all duration-300",
          "hidden lg:block",
          "bg-card/80 bg-background/80 backdrop-blur-xl border-r border-border/60 border-border/60 shadow-lg",
          isCollapsed ? "w-12" : "w-52"
        )}
        style={{ left: `${sidebarLeft}px` }}
      >
        <div className={cn("p-3", isCollapsed && "px-2")}>
          <div className={cn("flex items-center mb-3", isCollapsed ? "justify-center" : "justify-between")}>
            {!isCollapsed && (
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {title}
              </h2>
            )}
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-6 w-6", !isCollapsed && "ml-auto")}
              onClick={handleToggle}
              title={isCollapsed ? "Expand" : "Collapse"}
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
          </div>
          <nav className="space-y-1">
            {items.map((item) => {
              const isActive = getIsActive(item);

              const navItem = (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 relative overflow-hidden",
                    isActive
                      ? "font-semibold shadow-sm ring-1 ring-black/5 dark:ring-white/10"
                      : "text-muted-foreground hover:bg-card/60 hover:bg-muted/50 hover:text-foreground ",
                    isCollapsed && "justify-center"
                  )}
                  style={isActive ? {
                    backgroundColor: `${visiblePrimary}15`,
                    color: visiblePrimary,
                  } : undefined}
                  title={isCollapsed ? item.name : undefined}
                >
                  {isActive && (
                    <div
                      className="absolute inset-0 opacity-5"
                      style={{ backgroundColor: visiblePrimary }}
                    />
                  )}

                  {item.icon && (
                    <item.icon className={cn(
                      "h-4 w-4 shrink-0 transition-colors",
                      isActive ? "text-primary" : "text-muted-foreground",
                      !isCollapsed && "mr-3"
                    )}
                      style={isActive ? { color: visiblePrimary } : undefined}
                    />
                  )}

                  {!isCollapsed && (
                    <>
                      <span className="relative z-10">{item.name}</span>
                      {isActive && (
                        <div
                          className="w-1 h-1 rounded-full ml-auto absolute right-2 top-1/2 -translate-y-1/2"
                          style={{ backgroundColor: branding.primary_color }}
                        />
                      )}
                    </>
                  )}
                </Link>
              );

              if (item.permission) {
                return (
                  <PermissionGuard key={item.name} permission={item.permission}>
                    {navItem}
                  </PermissionGuard>
                );
              }

              return navItem;
            })}
          </nav>
        </div>
      </aside>
    </>
  );
}

// Define sub-navigation items for each module
export const subNavConfig: Record<string, SubNavItem[]> = {
  inventory: [
    { name: "Work Order Requests", href: "/inventory/parts-requests", permission: "view_parts_requests", icon: ListChecks },
    { name: "Parts", href: "/inventory", permission: "view_inventory", icon: Package },
    { name: "Categories", href: "/inventory/categories", permission: "view_categories", icon: Tags },
    { name: "Suppliers", href: "/inventory/suppliers", permission: "view_suppliers", icon: Truck },
    { name: "Purchase Orders", href: "/inventory/purchase-orders", permission: "view_purchase_orders", icon: FileText },
    { name: "Service Bundles", href: "/inventory/bundles", permission: "view_inventory", icon: Boxes },
    { name: "Forecasting", href: "/inventory/forecasting", permission: "view_inventory", icon: TrendingUp },
    { name: "Transfers", href: "/inventory/transfers", permission: "view_transfers", icon: ArrowLeftRight },
  ],
  billing: [
    { name: "Invoices", href: "/billing/invoices", permission: "view_invoices", icon: Receipt },
    { name: "Proforma Invoices", href: "/billing/proformas", permission: "view_invoices", icon: ClipboardList },
    { name: "Estimates", href: "/billing/estimates", permission: "view_estimates", icon: Calculator },
    { name: "Credit Notes", href: "/billing/credit-notes", permission: "view_credit_notes", icon: MinusSquare },
    { name: "Till Management", href: "/billing/tills", permission: "view_tills", icon: Banknote },
    { name: "Refunds", href: "/billing/refunds", permission: "view_refunds", icon: Undo2 },
    { name: "Bills", href: "/billing/bills", permission: "view_bills", icon: CreditCard },
  ],

  admin: [
    { name: "Dashboard", href: "/admin", permission: "view_admin_dashboard", icon: LayoutDashboard },
    { name: "Users", href: "/admin/users", permission: "view_users", icon: Users },
    { name: "Roles", href: "/admin/roles", permission: "view_roles", icon: ShieldCheck },
    { name: "Branches", href: "/admin/branches", permission: "view_branches", icon: Building2 },
    { name: "Backups", href: "/admin/backups", permission: "view_backups", icon: Database },
    { name: "Settings", href: "/admin/settings", permission: "view_settings", icon: Settings },
    { name: "Email Templates", href: "/admin/settings/email-templates", permission: "view_email_templates", icon: Mail },
    { name: "Audit Log", href: "/admin/audit-log", permission: "view_audit_log", icon: History },
    { name: "Import History", href: "/admin/import-history", permission: "view_import_history", icon: Inbox },
    { name: "Integrations", href: "/admin/integrations", permission: "manage_settings", icon: Puzzle },
    { name: "Feedback", href: "/admin/feedback", permission: "view_settings", icon: MessageSquare },
  ],
  accounting: [
    { name: "Overview", href: "/accounting", permission: "view_accounting_dashboard", icon: BarChart3 },
    { name: "Journal Entries", href: "/accounting/journal-entries", permission: "view_journal_entries", icon: BookOpen },
    { name: "Chart of Accounts", href: "/accounting/accounts", permission: "view_accounts", icon: Hash },
    { name: "Banking", href: "/accounting/banking/reconciliation", permission: "view_accounting", icon: Landmark },
    { name: "Balance Sheet", href: "/accounting/reports/balance-sheet", permission: "view_financial_reports", icon: Scale },
    { name: "Profit & Loss", href: "/accounting/reports/profit-loss", permission: "view_financial_reports", icon: PieChart },
    { name: "Trial Balance", href: "/accounting/reports/trial-balance", permission: "view_financial_reports", icon: Library },
    { name: "Aging Report", href: "/accounting/reports/aging", permission: "view_financial_reports", icon: Clock },
    { name: "Cash Flow", href: "/accounting/reports/cash-flow", permission: "view_financial_reports", icon: Activity },
    { name: "Tax Report", href: "/accounting/reports/tax", permission: "view_financial_reports", icon: Percent },
    { name: "Job Profitability", href: "/accounting/reports/job-profitability", permission: "view_financial_reports", icon: Target },
    { name: "Budgets", href: "/accounting/budgets", permission: "view_accounting_settings", icon: Wallet },
    { name: "Fund Transfers", href: "/accounting/transfers", permission: "view_accounting_settings", icon: Repeat },
    { name: "Accruals", href: "/accounting/accruals", permission: "view_accounting_settings", icon: Zap },
    { name: "Controls & Compliance", href: "/accounting/controls", permission: "view_accounting_settings", icon: Shield },
  ],
  hr: [
    { name: "Dashboard", href: "/hr", permission: "view_hr", icon: LayoutDashboard },
    { name: "Staff", href: "/hr/staff", permission: "view_employees", icon: Users },
    { name: "Departments", href: "/hr/departments", permission: "view_departments", icon: Building2 },
    { name: "Leave", href: "/hr/leave", permission: "view_leave", icon: Calendar },
    { name: "Attendance", href: "/hr/attendance", permission: "view_attendance", icon: Clock },
    { name: "Payroll", href: "/hr/payroll", permission: "view_payroll", icon: Banknote },
    { name: "Recruitment", href: "/hr/recruitment", permission: "view_recruitment", icon: Briefcase },
    { name: "Performance", href: "/hr/performance", permission: "view_performance", icon: Star },
    { name: "Training", href: "/hr/training", permission: "view_training", icon: GraduationCap },
    { name: "Compliance", href: "/hr/compliance", permission: "view_compliance", icon: FileCheck },
  ],
};

// Helper function to get sub-nav config based on pathname
export function getSubNavConfig(pathname: string | null): { items: SubNavItem[]; title: string } | null {
  if (!pathname) return null;

  if (pathname.startsWith("/inventory")) {
    return {
      items: subNavConfig.inventory,
      title: "Inventory",
    };
  }

  if (pathname.startsWith("/billing")) {
    return {
      items: subNavConfig.billing,
      title: "Billing",
    };
  }

  if (pathname.startsWith("/accounting")) {
    return {
      items: subNavConfig.accounting,
      title: "Accounting",
    };
  }

  if (pathname.startsWith("/admin")) {
    return {
      items: subNavConfig.admin,
      title: "Administration",
    };
  }

  if (pathname.startsWith("/hr")) {
    return {
      items: subNavConfig.hr,
      title: "HR Management",
    };
  }

  return null;
}
