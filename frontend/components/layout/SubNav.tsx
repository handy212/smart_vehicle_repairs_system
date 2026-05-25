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
  Calendar,
  Briefcase,
  GraduationCap,
  Star,
  FileCheck,
  MessageSquare,
  LucideIcon,
  Puzzle,
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
import { useModules } from "@/lib/hooks/useModules";

interface SubNavItem {
  name: string;
  href: string;
  permission?: string;
  icon?: LucideIcon;
  module?: string;
  group?: string;
}

interface SubNavProps {
  items: SubNavItem[];
  title: string;
  onToggle?: (collapsed: boolean) => void;
  isCollapsed?: boolean;
  sidebarCollapsed?: boolean;
  module?: string;
}

export function SubNav({ items, title, onToggle, isCollapsed: externalCollapsed, sidebarCollapsed = false, module }: SubNavProps) {
  const pathname = usePathname();
  const { resolvedTheme, theme: activeTheme } = useTheme();
  const { isModuleEnabled } = useModules();
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const isCollapsed = externalCollapsed !== undefined ? externalCollapsed : internalCollapsed;



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

  const isPerfexTheme = activeTheme.startsWith("perfex");
  const isDark = resolvedTheme === "dark";
  const visiblePrimary = branding.primary_color ? ensureVisibleColor(branding.primary_color, isDark) : undefined;
  const sidebarLeft = sidebarCollapsed ? "64px" : (isPerfexTheme ? "var(--sidebar-width)" : "256px");

  // If module is disabled, hide the entire SubNav
  if (module && !isModuleEnabled(module)) {
    return null;
  }

  const filteredItems = items.filter(item =>
    !item.module || isModuleEnabled(item.module)
  );

  const renderItem = (item: SubNavItem, variant: "mobile" | "desktop") => {
    const isActive = getIsActive(item);
    const collapsed = variant === "desktop" && isCollapsed;

    let linkClass: string;
    let linkStyle: React.CSSProperties | undefined;
    let content: React.ReactNode;

    if (isPerfexTheme) {
      if (variant === "mobile") {
        linkClass = cn(
          "flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium whitespace-nowrap shrink-0 transition-colors border-b-2",
          isActive
            ? "border-primary text-foreground font-semibold"
            : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
        );
        linkStyle = isActive ? { borderColor: visiblePrimary, color: visiblePrimary } : undefined;
        content = (
          <>
            {item.icon && <item.icon className="h-3.5 w-3.5 shrink-0" style={isActive ? { color: visiblePrimary } : undefined} />}
            <span>{item.name}</span>
          </>
        );
      } else {
        // Perfex desktop: full-width item with left border accent when active
        linkClass = cn(
          "flex items-center w-full transition-colors relative",
          collapsed ? "justify-center px-2 py-2" : "px-3 py-[6px]",
          isActive
            ? "bg-white dark:bg-white/5 font-semibold border-l-[3px]"
            : "border-l-[3px] border-transparent text-[#6b7280] hover:bg-[#f3f4f6] dark:hover:bg-white/5 hover:text-foreground text-[13px]"
        );
        linkStyle = isActive
          ? { borderLeftColor: visiblePrimary, color: visiblePrimary, backgroundColor: `${visiblePrimary}0d` }
          : undefined;
        content = (
          <>
            {item.icon && (
              <item.icon
                className={cn("h-[14px] w-[14px] shrink-0 transition-colors", !collapsed && "mr-2.5")}
                style={isActive ? { color: visiblePrimary } : undefined}
              />
            )}
            {!collapsed && <span className="text-[13px] leading-none">{item.name}</span>}
          </>
        );
      }
    } else {
      if (variant === "mobile") {
        linkClass = cn(
          "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200 whitespace-nowrap shrink-0 relative overflow-hidden",
          isActive
            ? "font-semibold shadow-sm ring-1 ring-black/5 dark:ring-white/10"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        );
        linkStyle = isActive ? { backgroundColor: `${visiblePrimary}15`, color: visiblePrimary } : undefined;
        content = (
          <>
            {item.icon && (
              <item.icon
                className={cn("h-3.5 w-3.5 shrink-0 transition-colors", isActive ? "" : "text-muted-foreground")}
                style={isActive ? { color: visiblePrimary } : undefined}
              />
            )}
            <span>{item.name}</span>
          </>
        );
      } else {
        linkClass = cn(
          "flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 relative overflow-hidden",
          isActive
            ? "font-semibold shadow-sm ring-1 ring-black/5 dark:ring-white/10"
            : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
          collapsed && "justify-center"
        );
        linkStyle = isActive ? { backgroundColor: `${visiblePrimary}15`, color: visiblePrimary } : undefined;
        content = (
          <>
            {isActive && <div className="absolute inset-0 opacity-5" style={{ backgroundColor: visiblePrimary }} />}
            {item.icon && (
              <item.icon
                className={cn("h-4 w-4 shrink-0 transition-colors", isActive ? "text-primary" : "text-muted-foreground", !collapsed && "mr-3")}
                style={isActive ? { color: visiblePrimary } : undefined}
              />
            )}
            {!collapsed && (
              <>
                <span className="relative z-10">{item.name}</span>
                {isActive && (
                  <div className="w-1 h-1 rounded-full ml-auto absolute right-2 top-1/2 -translate-y-1/2" style={{ backgroundColor: branding.primary_color }} />
                )}
              </>
            )}
          </>
        );
      }
    }

    const link = (
      <Link key={item.name} href={item.href} className={linkClass} style={linkStyle} title={collapsed ? item.name : undefined}>
        {content}
      </Link>
    );

    if (item.permission) {
      return <PermissionGuard key={item.name} permission={item.permission}>{link}</PermissionGuard>;
    }
    return link;
  };
  const renderNavItems = (variant: "mobile" | "desktop") => {
    let lastGroup: string | undefined;

    return filteredItems.map((item) => {
      const groupHeader =
        variant === "desktop" && !isCollapsed && item.group && item.group !== lastGroup ? (
          <p
            key={`group-${item.group}-${item.name}`}
            className={cn(
              "px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
              lastGroup !== undefined && "mt-1"
            )}
          >
            {item.group}
          </p>
        ) : null;

      if (item.group) lastGroup = item.group;

      return (
        <div key={item.name}>
          {groupHeader}
          {renderItem(item, variant)}
        </div>
      );
    });
  };

  return (
    <>
      {/* Mobile: Horizontal scrollable tab bar */}
      <div className={cn(
        "fixed top-[var(--header-height)] left-0 right-0 z-20 border-b border-border bg-background shadow-sm lg:hidden",
        isPerfexTheme && "bg-card shadow-none"
      )}>
        <nav className="flex items-center gap-0 px-2 overflow-x-auto scrollbar-none">
          {renderNavItems("mobile")}
        </nav>
      </div>

      {/* Desktop: Vertical sidebar */}
      <aside
        className={cn(
          "fixed top-[var(--header-height)] bottom-0 z-10 transition-all duration-200",
          "hidden lg:block",
          isPerfexTheme
            ? cn("border-r border-border bg-card", isCollapsed ? "w-12" : "w-52")
            : cn("border-r border-border bg-background shadow-sm", isCollapsed ? "w-12" : "w-52")
        )}
        style={{ left: sidebarLeft }}
      >
        <div className={cn(isPerfexTheme ? "pt-2" : "p-3", isCollapsed && "px-2")}>
          <div className={cn("flex items-center", isPerfexTheme ? "mb-1 px-3 py-2" : "mb-3", isCollapsed ? "justify-center" : "justify-between")}>
            {!isCollapsed && (
              <h2 className={cn(
                "text-xs font-semibold uppercase tracking-wider",
                "text-muted-foreground"
              )}>
                {title}
              </h2>
            )}
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-6 w-6 shrink-0", !isCollapsed && "ml-auto")}
              onClick={handleToggle}
              title={isCollapsed ? "Expand" : "Collapse"}
            >
              {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          </div>
          <nav className={isPerfexTheme ? "space-y-0" : "space-y-1"}>
            {renderNavItems("desktop")}
          </nav>
        </div>
      </aside>
    </>
  );
}

// Define sub-navigation items for each module
export const subNavConfig: Record<string, SubNavItem[]> = {
  inventory: [
    { name: "Stores Workbench", href: "/inventory/quotation-requests", permission: "view_inventory", icon: ListChecks },
    { name: "Parts", href: "/inventory", permission: "view_inventory", icon: Package },
    { name: "Categories", href: "/inventory/categories", permission: "view_inventory", icon: Tags },
    { name: "Suppliers", href: "/inventory/suppliers", permission: "view_inventory", icon: Truck },
    { name: "Purchase Orders", href: "/inventory/purchase-orders", permission: "view_inventory", icon: FileText },
    { name: "Service Bundles", href: "/inventory/bundles", permission: "view_inventory", icon: Boxes },
    { name: "Transfers", href: "/inventory/transfers", permission: "view_inventory", icon: ArrowLeftRight },
    { name: "Compliance Reports", href: "/inventory/reports/compliance", permission: "view_inventory", icon: BarChart3 },
    { name: "Physical Counts", href: "/inventory/physical-counts", permission: "view_inventory", icon: ClipboardList },
    { name: "Inventory GL Report", href: "/inventory/reports/accounting", permission: "view_inventory", icon: PieChart },
  ],
  billing: [
    { name: "Invoices", href: "/billing/invoices", permission: "view_billing", icon: Receipt },
    { name: "Estimates", href: "/billing/estimates", permission: "view_billing", icon: Calculator },
    { name: "Proforma Invoices", href: "/billing/proformas", permission: "view_billing", icon: ClipboardList },
    { name: "Credit Notes", href: "/billing/credit-notes", permission: "view_billing", icon: MinusSquare },
    { name: "Till Management", href: "/billing/tills", permission: "view_billing", icon: Banknote },
    { name: "Refunds", href: "/billing/refunds", permission: "view_billing", icon: Undo2 },
    { name: "Bills", href: "/billing/bills", permission: "view_billing", icon: CreditCard },
    { name: "Payments", href: "/billing/payments", permission: "view_billing", icon: Wallet },
  ],

  admin: [
    { name: "Users", href: "/admin/users", permission: "view_users", icon: Users },
    { name: "Roles", href: "/admin/roles", permission: "manage_roles", icon: ShieldCheck },
    { name: "Branches", href: "/admin/branches", permission: "view_branches", icon: Building2 },
    { name: "Backups", href: "/admin/backups", permission: "manage_backups", icon: Database },
    { name: "Settings", href: "/admin/settings", permission: "view_settings", icon: Settings },
    { name: "Modules", href: "/admin/modules", permission: "view_modules", icon: Puzzle },
    { name: "Email Templates", href: "/admin/settings/email-templates", permission: "manage_notification_templates", icon: Mail },
    { name: "Audit Log", href: "/admin/audit-log", permission: "view_audit_logs", icon: History },
    { name: "Import History", href: "/admin/import-history", permission: "view_audit_logs", icon: Inbox },
    { name: "Integrations", href: "/admin/integrations", permission: "manage_settings", icon: Puzzle },
    { name: "Feedback", href: "/admin/feedback", permission: "view_settings", icon: MessageSquare },
  ],
  accounting: [
    { name: "Overview", href: "/accounting", permission: "view_accounting", icon: BarChart3, group: "Overview" },
    { name: "Journal Entries", href: "/accounting/journal-entries", permission: "view_journal_entries", icon: BookOpen, group: "Ledger" },
    { name: "Chart of Accounts", href: "/accounting/accounts", permission: "view_accounting", icon: Hash, group: "Ledger" },
    { name: "Accruals", href: "/accounting/accruals", permission: "view_accounting", icon: Zap, group: "Ledger" },
    { name: "Banking", href: "/accounting/banking/reconciliation", permission: "view_bank_statements", icon: Landmark, group: "Banking" },
    { name: "Fund Transfers", href: "/accounting/transfers", permission: "view_transfer_requests", icon: Repeat, group: "Banking" },
    { name: "Budgets", href: "/accounting/budgets", permission: "view_budgets", icon: Wallet, group: "Planning" },
    { name: "Financial Reports", href: "/accounting/reports", permission: "view_financial_reports", icon: PieChart, group: "Reports" },
    { name: "Controls & Compliance", href: "/accounting/controls", permission: "manage_accounting_periods", icon: Shield, group: "Governance" },
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
  sms: [
    { name: "Console", href: "/sms", permission: "send_notifications", icon: MessageSquare },
    { name: "Templates", href: "/sms/templates", permission: "send_notifications", icon: Settings2 },
  ],
  technicians: [
    { name: "Technicians", href: "/technicians", permission: "view_technicians", icon: Users },
    { name: "Skills", href: "/technicians/skills", permission: "manage_technician_skills", icon: GraduationCap },
  ],
  fixedAssets: [
    { name: "Assets", href: "/fixed-assets", permission: "view_assets", icon: Landmark },
    { name: "Acquisitions", href: "/fixed-assets/acquisitions", permission: "view_assets", icon: ClipboardList },
    { name: "Valuation", href: "/fixed-assets/reports/valuation", permission: "view_assets", icon: PieChart },
  ],
  reports: [
    { name: "Reports Hub", href: "/reports", permission: "view_reports", icon: LayoutDashboard },
    { name: "Operations Intelligence", href: "/reports/operations", permission: "view_reports", icon: Activity },
    { name: "Technician Efficiency", href: "/reports/efficiency", permission: "view_technician_reports", icon: Target },
    { name: "Service Bundles", href: "/reports/bundles", permission: "view_reports", icon: Boxes },
  ],
};

// Helper function to get sub-nav config based on pathname
export function getSubNavConfig(pathname: string | null): { items: SubNavItem[]; title: string; module?: string } | null {
  if (!pathname) return null;

  if (pathname.startsWith("/inventory")) {
    return {
      items: subNavConfig.inventory,
      title: "Inventory",
      module: "inventory",
    };
  }

  if (pathname.startsWith("/billing")) {
    return {
      items: subNavConfig.billing,
      title: "Billing",
      module: "billing",
    };
  }

  if (pathname.startsWith("/accounting")) {
    return {
      items: subNavConfig.accounting,
      title: "Accounting",
      module: "accounting",
    };
  }

  if (pathname.startsWith("/admin")) {
    return {
      items: subNavConfig.admin,
      title: "Administration",
      module: "admin", // Even if admin isn't togglable, good to have
    };
  }

  if (pathname.startsWith("/hr")) {
    return {
      items: subNavConfig.hr,
      title: "HR Management",
      module: "hr",
    };
  }

  if (pathname.startsWith("/sms")) {
    return {
      items: subNavConfig.sms,
      title: "Communications",
      module: "sms",
    };
  }

  if (pathname.startsWith("/technicians")) {
    return {
      items: subNavConfig.technicians,
      title: "Technicians",
      module: "technicians",
    };
  }

  if (pathname.startsWith("/fixed-assets")) {
    return {
      items: subNavConfig.fixedAssets,
      title: "Fixed Assets",
      module: "fixed-assets",
    };
  }

  if (pathname.startsWith("/reports")) {
    return {
      items: subNavConfig.reports,
      title: "Reports",
      module: "reports",
    };
  }

  return null;
}
