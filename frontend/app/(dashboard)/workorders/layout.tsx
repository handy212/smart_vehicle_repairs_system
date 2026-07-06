"use client";

import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";

export default function WorkOrdersLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionPageGuard
      permissions={["view_workorders", "view_own_workorders"]}
      deniedTitle="Work order access required"
      deniedDescription="You don't have permission to view work orders. Contact your administrator if you need access."
    >
      {children}
    </PermissionPageGuard>
  );
}
