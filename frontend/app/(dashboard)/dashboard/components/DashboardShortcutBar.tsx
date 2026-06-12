"use client";

import Link from "next/link";
import {
  Banknote,
  FilePlus2,
  HandCoins,
  Landmark,
  Package,
  Receipt,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useModules } from "@/lib/hooks/useModules";
import { usePermissions } from "@/lib/hooks/usePermissions";

type DashboardShortcut = {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
  module?: string;
};

const DASHBOARD_SHORTCUTS: DashboardShortcut[] = [
  { label: "Customers", href: "/customers", icon: Users, permission: "view_customers", module: "customers" },
  { label: "Create Invoice", href: "/billing/invoices/new", icon: FilePlus2, permission: "create_invoices", module: "billing" },
  { label: "Receive Payment", href: "/billing/payments", icon: HandCoins, permission: "process_payments", module: "billing" },
  { label: "Supplier Bills", href: "/billing/bills", icon: Receipt, permission: "view_billing", module: "billing" },
  { label: "Purchase Orders", href: "/inventory/purchase-orders", icon: Package, permission: "view_inventory", module: "inventory" },
  { label: "Inventory", href: "/inventory", icon: Package, permission: "view_inventory", module: "inventory" },
  { label: "Bank Reconcile", href: "/accounting/banking/reconciliation", icon: Banknote, permission: "view_bank_statements", module: "accounting" },
  { label: "Financial Reports", href: "/accounting/reports", icon: Landmark, permission: "view_financial_reports", module: "accounting" },
];

export function DashboardShortcutBar() {
  const { hasPermission } = usePermissions();
  const { isModuleEnabled } = useModules();

  const shortcuts = DASHBOARD_SHORTCUTS.filter(
    (shortcut) =>
      (!shortcut.permission || hasPermission(shortcut.permission)) &&
      (!shortcut.module || isModuleEnabled(shortcut.module))
  );

  if (shortcuts.length === 0) {
    return null;
  }

  return (
    <Card className="rounded-md border border-border bg-card shadow-[0px_1px_15px_1px_rgba(90,90,90,0.08)]">
      <CardHeader className="border-b border-border/60 px-4 py-3">
        <CardTitle className="text-sm font-semibold">Quick Shortcuts</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {shortcuts.map((shortcut) => (
          <Link
            key={shortcut.href}
            href={shortcut.href}
            className="flex min-h-16 flex-col items-center justify-center gap-2 rounded-md border border-border/70 bg-background/70 px-2 py-3 text-center text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted/40"
          >
            <shortcut.icon className="h-4 w-4 text-primary" />
            <span className="leading-tight">{shortcut.label}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
