import { PremiumIcons } from "@/components/ui/icons";
import type { NavIcon } from "@/components/layout/nav-group-types";
import type { NavGroup } from "./nav-group-types";
import { DASHBOARD_VIEW_PERMISSIONS } from "@/lib/utils/permissions";

export const SIDEBAR_NAV_GROUPS: NavGroup[] = [
  {
    id: "main",
    label: "Main",
    icon: PremiumIcons.Dashboard as NavIcon,
    pinned: true,
    items: [
      {
        name: "Dashboard",
        href: "/dashboard",
        icon: PremiumIcons.Dashboard,
        permissions: [...DASHBOARD_VIEW_PERMISSIONS],
      },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    icon: PremiumIcons.Wrench,
    items: [
      {
        name: "Customers",
        href: "/customers",
        icon: PremiumIcons.Users,
        permission: "view_customers",
        module: "customers",
      },
      {
        name: "Vehicles",
        href: "/vehicles",
        icon: PremiumIcons.Car,
        permission: "view_vehicles",
        module: "vehicles",
      },
      {
        name: "Appointments",
        href: "/appointments",
        icon: PremiumIcons.Calendar,
        permissions: ["view_appointments", "view_own_appointments"],
        module: "appointments",
      },
      {
        name: "Work Orders",
        href: "/workorders",
        icon: PremiumIcons.Wrench,
        permissions: ["view_workorders", "view_own_workorders"],
        module: "workorders",
      },
      {
        name: "Gate Passes",
        href: "/gatepass",
        icon: PremiumIcons.FileText,
        permission: "view_gatepass",
        module: "gatepass",
      },
      {
        name: "Roadside",
        href: "/roadside",
        icon: PremiumIcons.Truck,
        permission: "view_roadside",
        module: "roadside",
      },
      {
        name: "Technicians",
        href: "/technicians",
        icon: PremiumIcons.UserCog,
        permission: "view_technicians",
        module: "technicians",
      },
      {
        name: "HR",
        href: "/hr",
        icon: PremiumIcons.Building2,
        permission: "view_hr",
        module: "hr",
      },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    icon: PremiumIcons.Calculator,
    items: [
      {
        name: "Inventory",
        href: "/inventory",
        icon: PremiumIcons.Package,
        permission: "view_inventory",
        module: "inventory",
      },
      {
        name: "Billing",
        href: "/billing",
        icon: PremiumIcons.Receipt,
        permission: "view_billing",
        module: "billing",
      },
      {
        name: "Accounting",
        href: "/accounting",
        icon: PremiumIcons.Calculator,
        permission: "view_accounting",
        module: "accounting",
      },
      {
        name: "Fixed Assets",
        href: "/fixed-assets",
        icon: PremiumIcons.Landmark,
        permission: "view_assets",
        module: "fixed-assets",
      },
      {
        name: "Subscriptions",
        href: "/subscriptions",
        icon: PremiumIcons.CreditCard,
        permission: "view_subscriptions",
        module: "subscriptions",
      },
    ],
  },
  {
    id: "tools-reports",
    label: "Tools",
    icon: PremiumIcons.BarChart,
    items: [
      {
        name: "Inspections",
        href: "/inspections",
        icon: PremiumIcons.FileText,
        permission: "view_inspections",
        module: "inspections",
      },
      {
        name: "Diagnosis",
        href: "/diagnosis",
        icon: PremiumIcons.Stethoscope,
        permission: "view_diagnosis",
        module: "diagnosis",
      },
      {
        name: "Reports",
        href: "/reports",
        icon: PremiumIcons.BarChart,
        permissions: ["view_reports", "view_all_reports"],
        module: "reports",
      },
    ],
  },
  {
    id: "communications",
    label: "Communications",
    icon: PremiumIcons.MessageSquare,
    items: [
      {
        name: "SMS Console",
        href: "/sms",
        icon: PremiumIcons.MessageSquare,
        permission: "send_notifications",
        module: "sms",
      },
    ],
  },
  {
    id: "system",
    label: "System",
    icon: PremiumIcons.Settings,
    items: [
      {
        name: "Configurations",
        href: "/admin/settings",
        icon: PremiumIcons.Settings,
        permission: "manage_settings",
        module: "settings",
      },
    ],
  },
];
