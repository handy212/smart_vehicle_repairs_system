"use client";

import { ReactNode } from "react";
import { PermissionGuard } from "./PermissionGuard";
import { PermissionDenied } from "./PermissionDenied";

interface PermissionPageGuardProps {
  permission?: string;
  permissions?: string[];
  requireAll?: boolean;
  children: ReactNode;
  deniedTitle?: string;
  deniedDescription?: string;
}

/** Page-level permission guard with an accessible denied-state UI. */
export function PermissionPageGuard({
  permission,
  permissions,
  requireAll,
  children,
  deniedTitle,
  deniedDescription,
}: PermissionPageGuardProps) {
  return (
    <PermissionGuard
      permission={permission}
      permissions={permissions}
      requireAll={requireAll}
      fallback={
        <PermissionDenied
          permission={permission}
          permissions={permissions}
          title={deniedTitle}
          description={deniedDescription}
        />
      }
    >
      {children}
    </PermissionGuard>
  );
}
