"use client";

import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { BILLING_PAYABLES_VIEW_PERMISSIONS } from "@/lib/utils/permissions";

export default function ExpensesLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionPageGuard
      permissions={[...BILLING_PAYABLES_VIEW_PERMISSIONS]}
      deniedTitle="Vendor expenses access required"
      deniedDescription="You need accounts payable permissions to view vendor expenses."
    >
      {children}
    </PermissionPageGuard>
  );
}
