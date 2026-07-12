"use client";

import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";

export default function BundlesLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionPageGuard
      permission="manage_inventory"
      deniedTitle="Service bundle access required"
      deniedDescription="You need inventory management permissions to view service bundles."
    >
      {children}
    </PermissionPageGuard>
  );
}
