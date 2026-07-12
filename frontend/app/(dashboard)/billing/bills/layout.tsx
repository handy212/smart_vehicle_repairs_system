"use client";

import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { BILLING_PAYABLES_VIEW_PERMISSIONS } from "@/lib/utils/permissions";

export default function BillsLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionPageGuard
      permissions={[...BILLING_PAYABLES_VIEW_PERMISSIONS]}
      deniedTitle="Vendor bills access required"
      deniedDescription="You need accounts payable permissions to view vendor bills."
    >
      {children}
    </PermissionPageGuard>
  );
}
