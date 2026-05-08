import { useMemo } from "react";
import { useAuthStore } from "@/store/authStore";

/**
 * Hook to check user permissions
 * Returns utility functions to check if user has specific permissions
 */
export function usePermissions() {
  const { user } = useAuthStore();
  const permissions = useMemo(() => user?.permissions || [], [user?.permissions]);

  /**
   * Check if user has a specific permission
   */
  const hasPermission = useMemo(
    () => (permission: string) => {
      if (!permissions || permissions.length === 0) return false;
      return permissions.includes(permission);
    },
    [permissions]
  );

  /**
   * Check if user has any of the specified permissions
   */
  const hasAnyPermission = useMemo(
    () => (permissionList: string[]) => {
      if (!permissions || permissions.length === 0) return false;
      return permissionList.some((perm) => permissions.includes(perm));
    },
    [permissions]
  );

  /**
   * Check if user has all of the specified permissions
   */
  const hasAllPermissions = useMemo(
    () => (permissionList: string[]) => {
      if (!permissions || permissions.length === 0) return false;
      return permissionList.every((perm) => permissions.includes(perm));
    },
    [permissions]
  );

  /**
   * Check if user can perform an action on a resource
   * Automatically checks both general and "own" variants
   * e.g., 'view_customers' or 'view_own_customers'
   */
  const can = useMemo(
    () => (action: "view" | "create" | "edit" | "delete" | "manage", resource: string) => {
      const generalPermission = `${action}_${resource}`;
      const ownPermission = `${action}_own_${resource}`;

      // Check general permission first
      if (hasPermission(generalPermission)) {
        return true;
      }

      // Check own permission
      return hasPermission(ownPermission);
    },
    [hasPermission]
  );

  return {
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    can,
    isLoading: !user,
  };
}

// Note: HOC pattern - use PermissionGuard component instead for better TypeScript support
