"use client";

import { ReactNode } from "react";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <PermissionPageGuard
      permissions={[
        "manage_settings",
        "manage_users",
        "view_users",
        "manage_roles",
        "manage_permissions",
        "view_audit_logs",
        "manage_backups",
        "manage_branches",
        "view_branches",
        "manage_modules",
        "view_modules",
      ]}
      deniedTitle="Admin access required"
      deniedDescription="You don't have permission to access system administration. Contact your administrator if you need access."
    >
      {children}
    </PermissionPageGuard>
  );
}
