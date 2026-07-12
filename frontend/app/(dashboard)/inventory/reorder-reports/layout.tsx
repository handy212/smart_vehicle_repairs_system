"use client";

import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { INVENTORY_REPORTS_VIEW_PERMISSIONS } from "@/lib/utils/permissions";

export default function ReorderReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionPageGuard
      permissions={[...INVENTORY_REPORTS_VIEW_PERMISSIONS]}
      deniedTitle="Inventory reports access required"
      deniedDescription="You need inventory report permissions to view this area."
    >
      {children}
    </PermissionPageGuard>
  );
}
