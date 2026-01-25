"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";

import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { useQuery } from "@tanstack/react-query";
import { adminApi, SystemSetting } from "@/lib/api/admin";
import { useMemo } from "react";

interface SubNavItem {
  name: string;
  href: string;
  permission?: string;
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
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const isCollapsed = externalCollapsed !== undefined ? externalCollapsed : internalCollapsed;

  // Calculate left position based on sidebar state
  // Sidebar: 288px (w-72) when expanded, 80px (w-20) when collapsed
  const sidebarLeft = sidebarCollapsed ? 80 : 288;

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

  return (
    <aside
      className={cn(
        "fixed top-16 bottom-0 z-10 transition-all duration-300",
        "bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-r border-gray-200/60 dark:border-gray-800/60 shadow-lg", // Premium glass effect
        isCollapsed ? "w-12" : "w-56" // Slightly wider for premium feel
      )}
      style={{ left: `${sidebarLeft}px` }}
    >
      <div className={cn("p-4", isCollapsed && "px-2")}>
        <div className={cn("flex items-center mb-3", isCollapsed ? "justify-center" : "justify-between")}>
          {!isCollapsed && (
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
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
            // For sub-nav items, check exact match or if pathname starts with the href
            // Exclude the base route to avoid false positives
            const isExactMatch = pathname === item.href;
            const isSubRoute = pathname?.startsWith(item.href + "/");
            const isActive = isExactMatch || isSubRoute;

            const navItem = (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 relative overflow-hidden",
                  isActive
                    ? "font-semibold shadow-sm ring-1 ring-black/5 dark:ring-white/10"
                    : "text-gray-600 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-100",
                  isCollapsed && "justify-center"
                )}
                style={isActive ? {
                  backgroundColor: `${branding.primary_color}15`, // 10% opacity hex
                  color: branding.primary_color,
                } : undefined}
                title={isCollapsed ? item.name : undefined}
              >
                {/* Active indicator background effect */}
                {isActive && (
                  <div
                    className="absolute inset-0 opacity-5"
                    style={{ backgroundColor: branding.primary_color }}
                  />
                )}

                {isCollapsed ? (
                  <span className="text-xs font-bold">{item.name.charAt(0)}</span>
                ) : (
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
  );
}

// Define sub-navigation items for each module
export const subNavConfig: Record<string, SubNavItem[]> = {
  inventory: [
    { name: "Work Order Requests", href: "/inventory/parts-requests", permission: "view_parts_requests" },
    { name: "Parts", href: "/inventory", permission: "view_inventory" },
    { name: "Categories", href: "/inventory/categories", permission: "view_categories" },
    { name: "Suppliers", href: "/inventory/suppliers", permission: "view_suppliers" },
    { name: "Purchase Orders", href: "/inventory/purchase-orders", permission: "view_purchase_orders" },
    { name: "Transfers", href: "/inventory/transfers", permission: "view_transfers" },
  ],
  billing: [
    { name: "Invoices", href: "/billing/invoices", permission: "view_invoices" },
    // { name: "Invoices", href: "/billing" },
    { name: "Estimates", href: "/billing/estimates", permission: "view_estimates" },
    { name: "Credit Notes", href: "/billing/credit-notes", permission: "view_credit_notes" },
    { name: "Till Management", href: "/billing/tills", permission: "view_tills" },
    { name: "Refunds", href: "/billing/refunds", permission: "view_refunds" },
    { name: "Bills", href: "/billing/bills", permission: "view_bills" },
  ],

  admin: [
    { name: "Dashboard", href: "/admin", permission: "view_admin_dashboard" },
    { name: "Users", href: "/admin/users", permission: "view_users" },
    { name: "Roles", href: "/admin/roles", permission: "view_roles" },
    { name: "Branches", href: "/admin/branches", permission: "view_branches" },
    { name: "Backups", href: "/admin/backups", permission: "view_backups" },
    { name: "Settings", href: "/admin/settings", permission: "view_settings" },
    { name: "Email Templates", href: "/admin/settings/email-templates", permission: "view_email_templates" },
    { name: "Audit Log", href: "/admin/audit-log", permission: "view_audit_log" },
    { name: "Import History", href: "/admin/import-history", permission: "view_import_history" },
  ],
  accounting: [
    { name: "Overview", href: "/accounting", permission: "view_accounting_dashboard" },
    { name: "Journal Entries", href: "/accounting/journal-entries", permission: "view_journal_entries" },
    { name: "Chart of Accounts", href: "/accounting/accounts", permission: "view_accounts" },
    { name: "Banking", href: "/accounting/banking/reconciliation", permission: "view_accounting" },
    { name: "Balance Sheet", href: "/accounting/reports/balance-sheet", permission: "view_financial_reports" },
    { name: "Profit & Loss", href: "/accounting/reports/profit-loss", permission: "view_financial_reports" },
    { name: "Trial Balance", href: "/accounting/reports/trial-balance", permission: "view_financial_reports" },
    { name: "Aging Report", href: "/accounting/reports/aging", permission: "view_financial_reports" },
    { name: "Cash Flow", href: "/accounting/reports/cash-flow", permission: "view_financial_reports" },
    { name: "Tax Report", href: "/accounting/reports/tax", permission: "view_financial_reports" },
    { name: "Job Profitability", href: "/accounting/reports/job-profitability", permission: "view_financial_reports" },
    { name: "Budgets", href: "/accounting/budgets", permission: "view_accounting_settings" },
    { name: "Fund Transfers", href: "/accounting/transfers", permission: "view_accounting_settings" },
    { name: "Accruals", href: "/accounting/accruals", permission: "view_accounting_settings" },
    { name: "Controls & Compliance", href: "/accounting/controls", permission: "view_accounting_settings" },
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

  return null;
}
