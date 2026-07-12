"use client";

import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";

export default function SuppliersLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionPageGuard
      permissions={["view_suppliers", "manage_suppliers", "manage_inventory"]}
      deniedTitle="Supplier access required"
      deniedDescription="You need supplier permissions to view this area."
    >
      {children}
    </PermissionPageGuard>
  );
}
