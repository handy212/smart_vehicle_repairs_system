"use client";

import { ReactNode } from "react";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { useAuthStore } from "@/store/authStore";

interface PermissionGuardProps {
  permission?: string;
  permissions?: string[];
  requireAll?: boolean;
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Component that conditionally renders children based on user permissions
 * 
 * @example
 * <PermissionGuard permission="create_customers">
 *   <Button>Create Customer</Button>
 * </PermissionGuard>
 * 
 * @example
 * <PermissionGuard permissions={["view_reports", "export_reports"]} requireAll>
 *   <ExportButton />
 * </PermissionGuard>
 */
export function PermissionGuard({
  permission,
  permissions,
  requireAll = false,
  fallback = null,
  children,
}: PermissionGuardProps) {
  const { hasPermission, hasAnyPermission, hasAllPermissions, isLoading } = usePermissions();
  const { user } = useAuthStore();

  // Check if user is admin or superuser - admins have all permissions

  const isAdmin = user?.role === 'admin' || user?.role === 'super-admin' || (user as any)?.is_superuser;

  // If user is admin/superuser, always allow (backend will verify)
  // This prevents UI blocking when permissions array is empty or not yet loaded
  if (isAdmin) {
    return <>{children}</>;
  }

  // Single permission check
  if (permission) {
    // Wait for auth/permissions to fully load before rendering
    if (isLoading) {
      return <>{fallback}</>;
    }
    return hasPermission(permission) ? <>{children}</> : <>{fallback}</>;
  }

  // Multiple permissions check
  if (permissions && permissions.length > 0) {
    // Wait for auth/permissions to fully load before rendering
    if (isLoading) {
      return <>{fallback}</>;
    }

    const hasAccess = requireAll
      ? hasAllPermissions(permissions)
      : hasAnyPermission(permissions);

    return hasAccess ? <>{children}</> : <>{fallback}</>;
  }

  // No permission specified - render children
  return <>{children}</>;
}
