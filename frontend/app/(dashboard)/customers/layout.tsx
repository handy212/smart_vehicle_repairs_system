"use client";

import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";

export default function CustomersLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionPageGuard
      permission="view_customers"
      deniedTitle="Customer access required"
      deniedDescription="You don't have permission to view customers. Contact your administrator if you need access."
    >
      {children}
    </PermissionPageGuard>
  );
}
