"use client";

import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { PERMISSIONS } from "@/lib/utils/permissions";

export default function VehiclesLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionPageGuard
      permissions={[PERMISSIONS.VIEW_VEHICLES, PERMISSIONS.VIEW_OWN_VEHICLES]}
      deniedTitle="Vehicle access required"
      deniedDescription="You don't have permission to view vehicles. Contact your administrator if you need access."
    >
      {children}
    </PermissionPageGuard>
  );
}
