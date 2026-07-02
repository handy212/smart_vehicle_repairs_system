"use client";

import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { PERMISSIONS } from "@/lib/utils/permissions";

export default function InspectionsLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionPageGuard
      permission={PERMISSIONS.VIEW_INSPECTIONS}
      deniedTitle="Inspection access required"
      deniedDescription="You don't have permission to view inspections. Contact your administrator if you need access."
    >
      {children}
    </PermissionPageGuard>
  );
}
