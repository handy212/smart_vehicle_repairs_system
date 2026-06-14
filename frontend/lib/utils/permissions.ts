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
  CREATE_VEHICLES: "create_vehicles",
  EDIT_VEHICLES: "edit_vehicles",
  DELETE_VEHICLES: "delete_vehicles",
  EXPORT_VEHICLES: "export_vehicles",
  IMPORT_VEHICLES: "import_vehicles",

  // Appointments
  VIEW_APPOINTMENTS: "view_appointments",
  CREATE_APPOINTMENTS: "create_appointments",
  EDIT_APPOINTMENTS: "edit_appointments",
  DELETE_APPOINTMENTS: "delete_appointments",
  MANAGE_APPOINTMENTS: "manage_appointments",

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

  // Purchasing
  VIEW_PURCHASING: "view_purchasing",
  CREATE_PURCHASE_ORDERS: "create_purchase_orders",
  MANAGE_PURCHASING: "manage_purchasing",

  // Billing
  VIEW_BILLING: "view_billing",
  CREATE_INVOICES: "create_invoices",
  EDIT_INVOICES: "edit_invoices",
  PROCESS_PAYMENTS: "process_payments",
  CREATE_PAYMENTS: "create_payments",
  PRINT_INVOICES: "print_invoices",
  EXPORT_BILLING: "export_billing",

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
  SEND_SMS: "send_sms",

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
} as const;

/** Staff landing dashboard overview API and nav link. */
export const DASHBOARD_VIEW_PERMISSIONS = [
  PERMISSIONS.VIEW_DASHBOARD,
  PERMISSIONS.VIEW_REPORTS,
  PERMISSIONS.VIEW_ALL_REPORTS,
] as const;

/** Stores Workbench (/inventory/quotation-requests) — view quotation queue. */
export const STORES_QUOTATION_VIEW_PERMISSIONS = [
  PERMISSIONS.VIEW_DIAGNOSIS,
  PERMISSIONS.VIEW_INVENTORY,
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

/** Super-admin role still used only for module bypass; capabilities come from permissions list. */
export function isSuperAdminRole(role?: string | null): boolean {
  return role === "super-admin";
}
