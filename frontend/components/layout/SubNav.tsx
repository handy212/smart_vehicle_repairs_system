"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";

import { PermissionGuard } from "@/components/auth/PermissionGuard";

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
  // Sidebar: 256px (w-64) when expanded, 80px (w-20) when collapsed
  const sidebarLeft = sidebarCollapsed ? 80 : 256;

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
        "fixed top-16 bottom-0 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 overflow-y-auto z-10 transition-all duration-300",
        isCollapsed ? "w-12" : "w-52"
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
                  "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                  isActive
                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800",
                  isCollapsed && "justify-center"
                )}
                title={isCollapsed ? item.name : undefined}
              >
                {isCollapsed ? (
                  <span className="text-xs font-bold">{item.name.charAt(0)}</span>
                ) : (
                  item.name
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
    { name: "Executive Dashboard", href: "/accounting/management", permission: "view_financial_reports" },
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

