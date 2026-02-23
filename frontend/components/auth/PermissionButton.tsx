"use client";

import { Button, ButtonProps } from "@/components/ui/button";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { useAuthStore } from "@/store/authStore";

interface PermissionButtonProps extends ButtonProps {
  permission?: string;
  permissions?: string[];
  requireAll?: boolean;
  hideIfNoPermission?: boolean;
}

/**
 * Button component that is disabled or hidden based on permissions
 * 
 * @example
 * <PermissionButton permission="create_customers" onClick={handleCreate}>
 *   Create Customer
 * </PermissionButton>
 */
export function PermissionButton({
  permission,
  permissions,
  requireAll = false,
  hideIfNoPermission = false,
  disabled,
  ...props
}: PermissionButtonProps) {
  const { hasPermission, hasAnyPermission, hasAllPermissions } = usePermissions();
  const { user } = useAuthStore();

  // Admin bypass — consistent with PermissionGuard
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isAdmin = user?.role === 'admin' || (user as any)?.is_superuser;

  let hasAccess = true;

  if (isAdmin) {
    hasAccess = true;
  } else if (permission) {
    hasAccess = hasPermission(permission);
  } else if (permissions && permissions.length > 0) {
    hasAccess = requireAll
      ? hasAllPermissions(permissions)
      : hasAnyPermission(permissions);
  }

  if (!hasAccess && hideIfNoPermission) {
    return null;
  }

  return (
    <Button
      {...props}
      disabled={disabled || !hasAccess}
      title={!hasAccess ? "You don't have permission to perform this action" : undefined}
    />
  );
}


