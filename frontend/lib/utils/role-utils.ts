/** Frontend helpers for dynamic role assignment (mirrors backend role_utils). */

export const MANAGER_ROLE_CODE = "manager";
export const ADMIN_ROLE_CODE = "admin";
export const CUSTOMER_ROLE_CODE = "customer";

const SINGLE_BRANCH_ROLE_CODES = new Set([
  "receptionist",
  "technician",
  "parts_manager",
  "service_coordinator",
  "accountant",
  "hr_manager",
]);

export function roleUsesManagedBranches(roleCode?: string | null): boolean {
  return roleCode === MANAGER_ROLE_CODE;
}

export function roleRequiresSingleBranch(roleCode?: string | null): boolean {
  if (!roleCode || roleCode === CUSTOMER_ROLE_CODE || roleCode === ADMIN_ROLE_CODE) {
    return false;
  }
  if (roleUsesManagedBranches(roleCode)) {
    return false;
  }
  return SINGLE_BRANCH_ROLE_CODES.has(roleCode) || !SINGLE_BRANCH_ROLE_CODES.has(roleCode);
}

export function isAdminRoleCode(roleCode?: string | null): boolean {
  return roleCode === ADMIN_ROLE_CODE;
}
