"use client";

import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { BILLING_AREA_PERMISSIONS } from "@/lib/utils/permissions";

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionPageGuard
      permissions={[...BILLING_AREA_PERMISSIONS]}
      deniedTitle="Billing access required"
      deniedDescription="You don't have permission to access billing. Contact your administrator if you need access."
    >
      {children}
    </PermissionPageGuard>
  );
}
