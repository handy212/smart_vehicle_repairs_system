"use client";

import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { PERMISSIONS } from "@/lib/utils/permissions";

export default function RoadsideLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionPageGuard
      permission={PERMISSIONS.VIEW_ROADSIDE}
      deniedTitle="Roadside access required"
      deniedDescription="You don't have permission to view roadside assistance. Contact your administrator if you need access."
    >
      {children}
    </PermissionPageGuard>
  );
}
