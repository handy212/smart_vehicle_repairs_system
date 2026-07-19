import type { NavGroup } from "./nav-group-types";
import {
  INVENTORY_REPORTS_VIEW_PERMISSIONS,
  INVENTORY_TRANSFERS_VIEW_PERMISSIONS,
  PARTS_REQUESTS_VIEW_PERMISSIONS,
  PHYSICAL_COUNTS_VIEW_PERMISSIONS,
  PURCHASE_ORDERS_VIEW_PERMISSIONS,
  STORES_QUOTATION_VIEW_PERMISSIONS,
} from "@/lib/utils/permissions";
import { ACCOUNTING_NAV_GROUPS } from "./accounting-nav-config";
import {
  Activity,
  AlertCircle,
  Banknote,
  BarChart3,
  BookOpen,
  Boxes,
  Briefcase,
  Building2,
  Calculator,
  Calendar,
  ClipboardList,
  Clock,
  CreditCard,
  Database,
  FileCheck,
  FileText,
  GraduationCap,
  HandCoins,
  History,
  Inbox,
  Landmark,
  LayoutDashboard,
  ListChecks,
  Mail,
  MessageSquare,
  MinusSquare,
  Package,
  PieChart,
  Puzzle,
  Receipt,
  Settings,
  Settings2,
  ShieldCheck,
  Star,
  Tags,
  Target,
  Truck,
  Undo2,
  UserCheck,
  Users,
  Wallet,
  ArrowLeftRight,
} from "lucide-react";

export const SUB_NAV_GROUPS: Record<string, NavGroup[]> = {
  inventory: [
    {
      id: "catalog",
      label: "Catalog",
      icon: Package,
      items: [
        { name: "Inventory", href: "/inventory", permission: "view_inventory", icon: Package },
        { name: "Suppliers", href: "/inventory/suppliers", permission: "view_suppliers", icon: Truck },
        {
          name: "Service Bundles",
          href: "/inventory/bundles",
          permission: "manage_inventory",
          icon: Boxes,
        },
      ],
    },
    {
      id: "procurement",
      label: "Procurement",
      icon: ListChecks,
      items: [
        {
          name: "Stores Workbench",
          href: "/inventory/quotation-requests",
          permissions: [...STORES_QUOTATION_VIEW_PERMISSIONS, ...PARTS_REQUESTS_VIEW_PERMISSIONS],
          icon: ListChecks,
        },
        {
          name: "Purchase Orders",
          href: "/inventory/purchase-orders",
          permissions: [...PURCHASE_ORDERS_VIEW_PERMISSIONS],
          icon: FileText,
        },
        {
          name: "Transfers",
          href: "/inventory/transfers",
          permissions: [...INVENTORY_TRANSFERS_VIEW_PERMISSIONS],
          icon: ArrowLeftRight,
        },
        {
          name: "Physical Counts",
          href: "/inventory/physical-counts",
          permissions: [...PHYSICAL_COUNTS_VIEW_PERMISSIONS],
          icon: ClipboardList,
        },
        { name: "Stock Alerts", href: "/inventory/alerts", permission: "view_low_stock_alerts", icon: AlertCircle },
      ],
    },
    {
      id: "reports",
      label: "Reports",
      icon: BarChart3,
      items: [
        {
          name: "Compliance Reports",
          href: "/inventory/reports/compliance",
          permissions: [...INVENTORY_REPORTS_VIEW_PERMISSIONS],
          icon: BarChart3,
        },
        {
          name: "Inventory Reports",
          href: "/inventory/reports/standard",
          permissions: [...INVENTORY_REPORTS_VIEW_PERMISSIONS],
          icon: ClipboardList,
        },
        {
          name: "Inventory GL Report",
          href: "/inventory/reports/accounting",
          permissions: [...INVENTORY_REPORTS_VIEW_PERMISSIONS],
          icon: PieChart,
        },
        {
          name: "Reorder Reports",
          href: "/inventory/reorder-reports",
          permissions: [...INVENTORY_REPORTS_VIEW_PERMISSIONS],
          icon: AlertCircle,
        },
      ],
    },
  ],
  billing: [
    {
      id: "receivables",
      label: "Receivables",
      icon: Receipt,
      items: [
        {
          name: "Invoices",
          href: "/billing/invoices",
          permissions: ["view_billing", "view_own_invoices", "create_invoices", "manage_billing"],
          icon: Receipt,
        },
        {
          name: "Estimates",
          href: "/billing/estimates",
          permissions: ["view_billing", "create_estimates", "edit_estimates", "approve_estimates", "manage_billing"],
          icon: Calculator,
        },
        {
          name: "Payments",
          href: "/billing/payments",
          permissions: ["view_billing", "process_payments", "view_payment_history", "manage_billing"],
          icon: Wallet,
        },
        {
          name: "Credit Notes",
          href: "/billing/credit-notes",
          permissions: ["view_billing", "manage_billing"],
          icon: MinusSquare,
        },
        {
          name: "Receivables",
          href: "/billing/receivables",
          permissions: ["view_billing", "manage_billing", "view_payment_history"],
          icon: HandCoins,
        },
      ],
    },
    {
      id: "payables",
      label: "Payables",
      icon: CreditCard,
      items: [
        { name: "Bills", href: "/billing/bills", permissions: ["view_bills", "create_bills", "edit_bills", "manage_billing"], icon: CreditCard },
        { name: "Pay Bills", href: "/billing/pay-bills", permissions: ["edit_bills", "manage_billing"], icon: HandCoins },
        { name: "Vendor Expenses", href: "/billing/expenses", permissions: ["view_bills", "manage_billing"], icon: Receipt },
        { name: "Vendor Credits", href: "/billing/vendor-credits", permissions: ["view_bills", "create_bills", "edit_bills", "manage_billing"], icon: MinusSquare },
        { name: "Payment History", href: "/billing/vendor-payments", permissions: ["view_bills", "manage_billing"], icon: Clock },
        { name: "Payables", href: "/billing/payables", permissions: ["view_bills", "manage_billing"], icon: Building2 },
      ],
    },
  ],
  accounting: ACCOUNTING_NAV_GROUPS.map((group) => ({
    ...group,
    pinned: group.id === "overview",
  })),
  admin: [
    {
      id: "organization",
      label: "Organization",
      icon: Users,
      items: [
        { name: "Users", href: "/admin/users", permission: "view_users", icon: Users },
        { name: "Roles", href: "/admin/roles", permission: "manage_roles", icon: ShieldCheck },
        { name: "Branches", href: "/admin/branches", permission: "view_branches", icon: Building2 },
      ],
    },
    {
      id: "configuration",
      label: "Configuration",
      icon: Settings,
      items: [
        { name: "Settings", href: "/admin/settings", permission: "manage_settings", icon: Settings },
        { name: "Job Types", href: "/admin/settings/job-types", permission: "manage_workorders", icon: Tags },
        { name: "Modules", href: "/admin/modules", superAdminOnly: true, icon: Puzzle },
        { name: "Integrations", href: "/admin/integrations", permission: "manage_settings", icon: Puzzle },
        { name: "Email Templates", href: "/admin/settings/email-templates", permission: "manage_notification_templates", icon: Mail },
      ],
    },
    {
      id: "data-audit",
      label: "Data & Audit",
      icon: Database,
      items: [
        { name: "Backups", href: "/admin/backups", permission: "manage_backups", icon: Database },
        {
          name: "Import / Export",
          href: "/admin/import-export",
          permission: "manage_data_exchange",
          icon: ArrowLeftRight,
        },
        { name: "Audit Log", href: "/admin/audit-log", permission: "view_audit_logs", icon: History },
        { name: "Import History", href: "/admin/import-history", permission: "view_audit_logs", icon: Inbox },
        { name: "Feedback", href: "/admin/feedback", permission: "view_settings", icon: MessageSquare },
      ],
    },
  ],
  hr: [
    {
      id: "overview",
      label: "Overview",
      icon: LayoutDashboard,
      pinned: true,
      items: [
        { name: "Dashboard", href: "/hr", permission: "view_hr", icon: LayoutDashboard },
      ],
    },
    {
      id: "people",
      label: "People",
      icon: Users,
      items: [
        { name: "My HR", href: "/hr/me", icon: UserCheck },
        { name: "Staff", href: "/hr/staff", permission: "view_staff", icon: Users },
        { name: "Departments", href: "/hr/departments", permission: "view_departments", icon: Building2 },
        { name: "Recruitment", href: "/hr/recruitment", permission: "view_recruitment", icon: Briefcase },
      ],
    },
    {
      id: "workforce",
      label: "Time & Pay",
      icon: Clock,
      items: [
        { name: "Leave", href: "/hr/leave", permission: "view_leave", icon: Calendar },
        { name: "Leave Balances", href: "/hr/leave/balances", permission: "view_leave", icon: Calendar },
        { name: "HR Attendance", href: "/hr/attendance", permission: "view_attendance", icon: Clock },
        { name: "Payroll", href: "/hr/payroll", permission: "view_payroll", icon: Banknote },
        { name: "Statutory Filing", href: "/hr/payroll/statutory-filing", permission: "view_payroll", icon: FileCheck },
      ],
    },
    {
      id: "development",
      label: "Development",
      icon: Star,
      items: [
        { name: "Performance", href: "/hr/performance", permission: "view_performance", icon: Star },
        { name: "Training", href: "/hr/training", permission: "view_training", icon: GraduationCap },
        { name: "Compliance", href: "/hr/compliance", permission: "view_compliance", icon: FileCheck },
      ],
    },
  ],
  sms: [
    {
      id: "communications",
      label: "Communications",
      icon: MessageSquare,
      items: [
        { name: "Console", href: "/sms", permission: "send_notifications", icon: MessageSquare },
        { name: "Templates", href: "/sms/templates", permission: "send_notifications", icon: Settings2 },
      ],
    },
  ],
  technicians: [
    {
      id: "workforce",
      label: "Workforce",
      icon: Users,
      items: [
        { name: "Technicians", href: "/technicians", permission: "view_technicians", icon: Users },
        { name: "Skills", href: "/technicians/skills", permission: "manage_technician_skills", icon: GraduationCap },
      ],
    },
  ],
  fixedAssets: [
    {
      id: "assets",
      label: "Asset Management",
      icon: Landmark,
      items: [
        { name: "Assets", href: "/fixed-assets", permission: "view_assets", icon: Landmark },
        { name: "Acquisitions", href: "/fixed-assets/acquisitions", permission: "view_assets", icon: ClipboardList },
        { name: "Depreciation", href: "/fixed-assets/depreciation", permission: "view_assets", icon: Calculator },
        { name: "Disposals", href: "/fixed-assets/disposals", permission: "edit_assets", icon: Undo2 },
        { name: "Transfers", href: "/fixed-assets/transfers", permission: "edit_assets", icon: ArrowLeftRight },
        { name: "Valuation", href: "/fixed-assets/reports/valuation", permission: "view_assets", icon: PieChart },
      ],
    },
  ],
  reports: [
    {
      id: "hub",
      label: "Hub",
      icon: LayoutDashboard,
      pinned: true,
      items: [
        { name: "Reports Hub", href: "/reports", permission: "view_reports", icon: LayoutDashboard },
      ],
    },
    {
      id: "analytics",
      label: "Analytics",
      icon: Activity,
      items: [
        { name: "Operations Intelligence", href: "/reports/operations", permission: "view_reports", icon: Activity },
        { name: "Technician Efficiency", href: "/reports/efficiency", permission: "view_technician_reports", icon: Target },
        { name: "Service Bundles", href: "/reports/bundles", permission: "view_reports", icon: Boxes },
      ],
    },
  ],
};

export const SUB_NAV_TITLES: Record<string, string> = {
  inventory: "Inventory",
  billing: "Billing",
  accounting: "Accounting",
  admin: "Administration",
  hr: "HR Management",
  sms: "Communications",
  technicians: "Technicians",
  fixedAssets: "Fixed Assets",
  reports: "Reports",
};

export const SUB_NAV_MODULES: Record<string, string> = {
  inventory: "inventory",
  billing: "billing",
  accounting: "accounting",
  admin: "admin",
  hr: "hr",
  sms: "sms",
  technicians: "technicians",
  fixedAssets: "fixed-assets",
  reports: "reports",
};

export function getSubNavGroupKey(pathname: string | null): string | null {
  if (!pathname) return null;
  if (pathname.startsWith("/inventory")) return "inventory";
  if (pathname.startsWith("/billing")) return "billing";
  if (pathname.startsWith("/accounting")) return "accounting";
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/hr")) return "hr";
  if (pathname.startsWith("/sms")) return "sms";
  if (pathname.startsWith("/technicians")) return "technicians";
  if (pathname.startsWith("/fixed-assets")) return "fixedAssets";
  if (pathname.startsWith("/reports")) return "reports";
  return null;
}
