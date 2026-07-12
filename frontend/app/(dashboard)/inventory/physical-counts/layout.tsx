"use client";

import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { PHYSICAL_COUNTS_VIEW_PERMISSIONS } from "@/lib/utils/permissions";

export default function PhysicalCountsLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionPageGuard
      permissions={[...PHYSICAL_COUNTS_VIEW_PERMISSIONS]}
      deniedTitle="Physical count access required"
      deniedDescription="You need stock adjustment permissions to view this area."
    >
      {children}
    </PermissionPageGuard>
  );
}
