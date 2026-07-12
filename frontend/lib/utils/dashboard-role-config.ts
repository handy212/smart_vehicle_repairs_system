/** Role-specific dashboard layout for staff landing page. */

export type DashboardRoleVariant =
  | "manager"
  | "receptionist"
  | "parts_manager"
  | "accountant"
  | "technician"
  | "default";

export type DashboardSection =
  | "kpi"
  | "wo_status_breakdown"
  | "main_table"
  | "appointments"
  | "bottom_summary"
  | "technician_perf"
  | "low_stock"
  | "service_due";

export type DashboardMainTab = "workorders" | "invoices";
export type DashboardWoFilter = "all" | "pending" | "active" | "attention" | "completed";

export interface DashboardRoleConfig {
  variant: DashboardRoleVariant;
  title: string;
  subtitle?: string;
  /** KPI card labels to show, or "all" for the full set */
  kpiLabels: string[] | "all";
  sections: DashboardSection[];
  defaultMainTab?: DashboardMainTab;
  defaultWoFilter?: DashboardWoFilter;
  /** Show prominent check-in CTA in header */
  showCheckIn?: boolean;
}

const FULL_SECTIONS: DashboardSection[] = [
  "kpi",
  "wo_status_breakdown",
  "main_table",
  "appointments",
  "bottom_summary",
  "technician_perf",
  "low_stock",
  "service_due",
];

export function getDashboardRoleConfig(role: string | undefined | null): DashboardRoleConfig {
  switch (role) {
    case "receptionist":
    case "service_coordinator":
      return {
        variant: "receptionist",
        title: "Front Desk",
        subtitle: "Walk-ins, appointments, and intake queue",
        kpiLabels: ["Appointments", "Active Jobs", "Pending Estimates", "Customers"],
        sections: ["kpi", "wo_status_breakdown", "main_table", "appointments", "service_due"],
        defaultMainTab: "workorders",
        defaultWoFilter: "pending",
        showCheckIn: true,
      };
    case "parts_manager":
      return {
        variant: "parts_manager",
        title: "Parts & Inventory",
        subtitle: "Stock levels and parts demand",
        kpiLabels: ["Low Stock", "Active Jobs", "Pending Estimates"],
        sections: ["kpi", "low_stock", "main_table", "wo_status_breakdown"],
        defaultMainTab: "workorders",
        defaultWoFilter: "active",
      };
    case "accountant":
      return {
        variant: "accountant",
        title: "Billing Overview",
        subtitle: "Invoices, revenue, and receivables",
        kpiLabels: ["Revenue Today", "Overdue Invoices", "Pending Estimates", "Month Revenue"],
        sections: ["kpi", "main_table", "bottom_summary"],
        defaultMainTab: "invoices",
      };
    case "technician":
      return {
        variant: "technician",
        title: "My Workshop",
        subtitle: "Assigned jobs and today's schedule",
        kpiLabels: ["Active Jobs", "Appointments"],
        sections: ["kpi", "main_table", "appointments"],
        defaultMainTab: "workorders",
        defaultWoFilter: "active",
      };
    case "manager":
    case "admin":
      return {
        variant: "manager",
        title: "Dashboard",
        subtitle: "Shop performance at a glance",
        kpiLabels: "all",
        sections: FULL_SECTIONS,
      };
    default:
      return {
        variant: "default",
        title: "Dashboard",
        kpiLabels: "all",
        sections: FULL_SECTIONS,
      };
  }
}

export function dashboardShowsSection(
  config: DashboardRoleConfig,
  section: DashboardSection
): boolean {
  return config.sections.includes(section);
}
