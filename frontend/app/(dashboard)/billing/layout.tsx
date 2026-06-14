"use client";

import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionPageGuard
      permission="view_billing"
      deniedTitle="Billing access required"
      deniedDescription="You don't have permission to access billing. Contact your administrator if you need access."
    >
      {children}
    </PermissionPageGuard>
  );
}
