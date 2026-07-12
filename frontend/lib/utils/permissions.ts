/**
 * Permission utility functions for checking user permissions
 */

/**
 * Check if user has a specific permission
 */
export function hasPermission(
  permissions: string[] | undefined,
  permission: string
): boolean {
  if (!permissions || permissions.length === 0) return false;
  return permissions.includes(permission);
}

/**
 * Check if user has any of the specified permissions
 */
export function hasAnyPermission(
  permissions: string[] | undefined,
  permissionList: string[]
): boolean {
  if (!permissions || permissions.length === 0) return false;
  return permissionList.some((perm) => permissions.includes(perm));
}

/**
 * Check if user has all of the specified permissions
 */
export function hasAllPermissions(
  permissions: string[] | undefined,
  permissionList: string[]
): boolean {
  if (!permissions || permissions.length === 0) return false;
  return permissionList.every((perm) => permissions.includes(perm));
}

/**
 * Check if user can perform an action on a resource
 * Automatically checks both general and "own" variants
 */
export function can(
  permissions: string[] | undefined,
  action: "view" | "create" | "edit" | "delete" | "manage",
  resource: string
): boolean {
  const generalPermission = `${action}_${resource}`;
  const ownPermission = `${action}_own_${resource}`;

  // Check general permission first
  if (hasPermission(permissions, generalPermission)) {
    return true;
  }

  // Check own permission
  return hasPermission(permissions, ownPermission);
}

/**
 * Permission constants for easy reference
 */
export const PERMISSIONS = {
  // Users
  VIEW_USERS: "view_users",
  CREATE_USERS: "create_users",
  EDIT_USERS: "edit_users",
  DELETE_USERS: "delete_users",
  MANAGE_USERS: "manage_users",

  // Customers
  VIEW_CUSTOMERS: "view_customers",
  CREATE_CUSTOMERS: "create_customers",
  EDIT_CUSTOMERS: "edit_customers",
  DELETE_CUSTOMERS: "delete_customers",
  MANAGE_CUSTOMERS: "manage_customers",
  VIEW_OWN_CUSTOMERS: "view_own_customers",

  // Vehicles
  VIEW_VEHICLES: "view_vehicles",
  VIEW_OWN_VEHICLES: "view_own_vehicles",
  CREATE_VEHICLES: "create_vehicles",
  EDIT_VEHICLES: "edit_vehicles",
  DELETE_VEHICLES: "delete_vehicles",
  EXPORT_VEHICLES: "export_vehicles",
  IMPORT_VEHICLES: "import_vehicles",

  // Appointments
  VIEW_APPOINTMENTS: "view_appointments",
  VIEW_OWN_APPOINTMENTS: "view_own_appointments",
  CREATE_APPOINTMENTS: "create_appointments",
  EDIT_APPOINTMENTS: "edit_appointments",
  DELETE_APPOINTMENTS: "delete_appointments",
  MANAGE_APPOINTMENTS: "manage_appointments",

  // Inspections
  VIEW_INSPECTIONS: "view_inspections",
  CREATE_INSPECTIONS: "create_inspections",
  EDIT_INSPECTIONS: "edit_inspections",
  PERFORM_INSPECTIONS: "perform_inspections",

  // Roadside
  VIEW_ROADSIDE: "view_roadside",
  CREATE_ROADSIDE: "create_roadside",
  EDIT_ROADSIDE: "edit_roadside",
  MANAGE_ROADSIDE: "manage_roadside",

  // Work Orders
  VIEW_WORKORDERS: "view_workorders",
  CREATE_WORKORDERS: "create_workorders",
  EDIT_WORKORDERS: "edit_workorders",
  DELETE_WORKORDERS: "delete_workorders",
  MANAGE_WORKORDERS: "manage_workorders",
  PRINT_WORKORDERS: "print_workorders",
  EXPORT_WORKORDERS: "export_workorders",

  // Technicians
  VIEW_TECHNICIANS: "view_technicians",
  MANAGE_TECHNICIANS: "manage_technicians",

  // Inventory
  VIEW_INVENTORY: "view_inventory",
  MANAGE_INVENTORY: "manage_inventory",
  EXPORT_INVENTORY: "export_inventory",
  IMPORT_INVENTORY: "import_inventory",
  VIEW_INVENTORY_REPORTS: "view_inventory_reports",
  ADJUST_INVENTORY: "adjust_inventory",
  TRANSFER_INVENTORY: "transfer_inventory",
  VIEW_LOW_STOCK_ALERTS: "view_low_stock_alerts",
  VIEW_SUPPLIERS: "view_suppliers",
  MANAGE_SUPPLIERS: "manage_suppliers",
  EDIT_PURCHASE_ORDERS: "edit_purchase_orders",
  RECEIVE_PARTS: "receive_parts",

  // Purchasing
  VIEW_PURCHASING: "view_purchasing",
  CREATE_PURCHASE_ORDERS: "create_purchase_orders",
  MANAGE_PURCHASING: "manage_purchasing",

  // Billing
  VIEW_BILLING: "view_billing",
  VIEW_OWN_INVOICES: "view_own_invoices",
  CREATE_INVOICES: "create_invoices",
  EDIT_INVOICES: "edit_invoices",
  PROCESS_PAYMENTS: "process_payments",
  CREATE_PAYMENTS: "create_payments",
  VIEW_PAYMENT_HISTORY: "view_payment_history",
  PRINT_INVOICES: "print_invoices",
  EXPORT_BILLING: "export_billing",
  CREATE_ESTIMATES: "create_estimates",
  VIEW_BILLS: "view_bills",
  CREATE_BILLS: "create_bills",
  EDIT_BILLS: "edit_bills",
  DELETE_BILLS: "delete_bills",

  // Accounting
  VIEW_ACCOUNTING: "view_accounting",
  MANAGE_ACCOUNTING: "manage_accounting",
  CREATE_JOURNAL_ENTRIES: "create_journal_entries",

  // HR
  VIEW_HR: "view_hr",
  MANAGE_HR: "manage_hr",
  VIEW_PAYROLL: "view_payroll",
  MANAGE_PAYROLL: "manage_payroll",

  // Dashboard
  VIEW_DASHBOARD: "view_dashboard",

  // Reports
  VIEW_REPORTS: "view_reports",
  VIEW_ALL_REPORTS: "view_all_reports",
  GENERATE_REPORTS: "generate_reports",
  EXPORT_REPORTS: "export_reports",

  // Documents
  VIEW_DOCUMENTS: "view_documents",
  UPLOAD_DOCUMENTS: "upload_documents",
  DOWNLOAD_DOCUMENTS: "download_documents",
  DELETE_DOCUMENTS: "delete_documents",

  // Notifications
  VIEW_NOTIFICATIONS: "view_notifications",
  MANAGE_NOTIFICATIONS: "manage_notifications",
  SEND_NOTIFICATIONS: "send_notifications",
  /** @deprecated Use SEND_NOTIFICATIONS */
  SEND_SMS: "send_notifications",

  // Subscriptions
  VIEW_SUBSCRIPTIONS: "view_subscriptions",
  MANAGE_SUBSCRIPTIONS: "manage_subscriptions",

  // Settings
  VIEW_SETTINGS: "view_settings",
  MANAGE_SETTINGS: "manage_settings",
  MANAGE_ROLES: "manage_roles",
  MANAGE_PERMISSIONS: "manage_permissions",
  VIEW_AUDIT_LOGS: "view_audit_logs",
  MANAGE_BACKUPS: "manage_backups",
  MANAGE_SYSTEM_UPDATES: "manage_system_updates",

  // Gate pass
  VIEW_GATEPASS: "view_gatepass",
  CREATE_GATEPASS: "create_gatepass",
  ISSUE_GATEPASS: "issue_gatepass",

  // Work orders (extended)
  VIEW_OWN_WORKORDERS: "view_own_workorders",
  UPDATE_WORKORDER_STATUS: "update_workorder_status",
  ASSIGN_WORKORDERS: "assign_workorders",

  // Reports (extended)
  VIEW_FINANCIAL_REPORTS: "view_financial_reports",
  APPROVE_PURCHASE_ORDERS: "approve_purchase_orders",
  APPROVE_ESTIMATES: "approve_estimates",
  EDIT_ESTIMATES: "edit_estimates",
  APPROVE_PART_REQUESTS: "approve_part_requests",
  REQUEST_PARTS: "request_parts",
  VIEW_DIAGNOSIS: "view_diagnosis",
  MANAGE_DIAGNOSIS: "manage_diagnosis",
  REFUND_PAYMENTS: "refund_payments",
  MANAGE_BILLING: "manage_billing",
  EDIT_PAYMENTS: "edit_payments",
} as const;

/** Any permission that grants access to admin section pages. */
export const ADMIN_SECTION_PERMISSIONS = [
  PERMISSIONS.MANAGE_SETTINGS,
  PERMISSIONS.MANAGE_USERS,
  PERMISSIONS.VIEW_USERS,
  PERMISSIONS.MANAGE_ROLES,
  PERMISSIONS.MANAGE_PERMISSIONS,
  PERMISSIONS.VIEW_AUDIT_LOGS,
  PERMISSIONS.MANAGE_BACKUPS,
  PERMISSIONS.MANAGE_SYSTEM_UPDATES,
] as const;

/** Permissions that grant access to the mobile technician shell. */
export const MOBILE_APP_PERMISSIONS = [
  PERMISSIONS.VIEW_WORKORDERS,
  PERMISSIONS.VIEW_OWN_WORKORDERS,
  PERMISSIONS.VIEW_APPOINTMENTS,
  PERMISSIONS.VIEW_OWN_APPOINTMENTS,
  PERMISSIONS.VIEW_ROADSIDE,
  PERMISSIONS.VIEW_INSPECTIONS,
  PERMISSIONS.PERFORM_INSPECTIONS,
  PERMISSIONS.VIEW_DIAGNOSIS,
] as const;

/** Staff landing dashboard overview API and nav link. */
export const DASHBOARD_VIEW_PERMISSIONS = [
  PERMISSIONS.VIEW_DASHBOARD,
  PERMISSIONS.VIEW_REPORTS,
  PERMISSIONS.VIEW_ALL_REPORTS,
] as const;

/** Stores Workbench (/inventory/quotation-requests) — view quotation queue.
 * Intentionally excludes bare view_inventory so technicians (parts browse only)
 * do not see the stores workbench.
 */
export const STORES_QUOTATION_VIEW_PERMISSIONS = [
  PERMISSIONS.MANAGE_INVENTORY,
  PERMISSIONS.APPROVE_PART_REQUESTS,
  PERMISSIONS.EDIT_ESTIMATES,
  PERMISSIONS.APPROVE_ESTIMATES,
] as const;

/** Stores Workbench — mark recommendations as quotation-ready. */
export const STORES_QUOTATION_COMPLETE_PERMISSIONS = [
  PERMISSIONS.MANAGE_DIAGNOSIS,
  PERMISSIONS.MANAGE_INVENTORY,
  PERMISSIONS.APPROVE_PART_REQUESTS,
] as const;

/** Parts Requests page — list and fulfill work-order part requisitions. */
export const PARTS_REQUESTS_VIEW_PERMISSIONS = [
  PERMISSIONS.VIEW_WORKORDERS,
  PERMISSIONS.VIEW_OWN_WORKORDERS,
  PERMISSIONS.APPROVE_PART_REQUESTS,
  PERMISSIONS.MANAGE_INVENTORY,
  PERMISSIONS.REQUEST_PARTS,
] as const;

/** Purchase Orders list — procurement staff only. */
export const PURCHASE_ORDERS_VIEW_PERMISSIONS = [
  PERMISSIONS.CREATE_PURCHASE_ORDERS,
  PERMISSIONS.EDIT_PURCHASE_ORDERS,
  PERMISSIONS.APPROVE_PURCHASE_ORDERS,
  PERMISSIONS.MANAGE_INVENTORY,
  PERMISSIONS.VIEW_PURCHASING,
] as const;

/** Inventory transfers. */
export const INVENTORY_TRANSFERS_VIEW_PERMISSIONS = [
  PERMISSIONS.TRANSFER_INVENTORY,
  PERMISSIONS.MANAGE_INVENTORY,
] as const;

/** Physical counts / stocktakes. */
export const PHYSICAL_COUNTS_VIEW_PERMISSIONS = [
  PERMISSIONS.ADJUST_INVENTORY,
  PERMISSIONS.MANAGE_INVENTORY,
] as const;

/** Inventory reports (compliance, standard, GL, reorder). */
export const INVENTORY_REPORTS_VIEW_PERMISSIONS = [
  PERMISSIONS.VIEW_INVENTORY_REPORTS,
  PERMISSIONS.MANAGE_INVENTORY,
] as const;

/** Inventory dashboard stats / low-stock report actions (not bare browse). */
export const INVENTORY_STATS_PERMISSIONS = [
  PERMISSIONS.VIEW_INVENTORY_REPORTS,
  PERMISSIONS.VIEW_LOW_STOCK_ALERTS,
  PERMISSIONS.MANAGE_INVENTORY,
] as const;

/** List technicians for assignment (matches UserViewSet.technicians). */
export const LIST_TECHNICIANS_PERMISSIONS = [
  PERMISSIONS.VIEW_TECHNICIANS,
  PERMISSIONS.ASSIGN_WORKORDERS,
  PERMISSIONS.MANAGE_WORKORDERS,
] as const;

/** List service coordinators for assignment (matches UserViewSet.service_coordinators). */
export const LIST_SERVICE_COORDINATORS_PERMISSIONS = [
  PERMISSIONS.VIEW_USERS,
  PERMISSIONS.ASSIGN_WORKORDERS,
  PERMISSIONS.MANAGE_WORKORDERS,
] as const;

/** QuickBooks connection status / sync UI. */
export const QBO_STATUS_PERMISSIONS = [
  PERMISSIONS.MANAGE_SETTINGS,
  PERMISSIONS.VIEW_BILLING,
  PERMISSIONS.MANAGE_BILLING,
  PERMISSIONS.VIEW_ACCOUNTING,
  PERMISSIONS.MANAGE_INVENTORY,
] as const;

/** Accounts payable / vendor billing area. */
export const BILLING_PAYABLES_VIEW_PERMISSIONS = [
  PERMISSIONS.VIEW_BILLS,
  PERMISSIONS.CREATE_BILLS,
  PERMISSIONS.EDIT_BILLS,
  PERMISSIONS.MANAGE_BILLING,
] as const;

/** Any billing area entry (AR or AP). */
export const BILLING_AREA_PERMISSIONS = [
  PERMISSIONS.VIEW_BILLING,
  PERMISSIONS.VIEW_OWN_INVOICES,
  PERMISSIONS.CREATE_INVOICES,
  PERMISSIONS.CREATE_ESTIMATES,
  PERMISSIONS.EDIT_ESTIMATES,
  PERMISSIONS.APPROVE_ESTIMATES,
  PERMISSIONS.PROCESS_PAYMENTS,
  PERMISSIONS.VIEW_PAYMENT_HISTORY,
  PERMISSIONS.MANAGE_BILLING,
  ...BILLING_PAYABLES_VIEW_PERMISSIONS,
] as const;

/** Super-admin role still used only for module bypass; capabilities come from permissions list. */
export function isSuperAdminRole(role?: string | null): boolean {
  return role === "super-admin";
}
