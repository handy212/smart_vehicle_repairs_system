"use client";

import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";

export default function PayBillsLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionPageGuard
      permissions={["edit_bills", "manage_billing"]}
      deniedTitle="Pay bills access required"
      deniedDescription="You need permission to pay vendor bills."
    >
      {children}
    </PermissionPageGuard>
  );
}
