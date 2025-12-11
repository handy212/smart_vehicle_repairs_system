"use client";

import { Button, ButtonProps } from "@/components/ui/button";
import { usePermissions } from "@/lib/hooks/usePermissions";

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

  let hasAccess = true;

  if (permission) {
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


