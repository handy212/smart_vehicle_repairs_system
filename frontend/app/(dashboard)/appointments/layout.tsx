"use client";

import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { PERMISSIONS } from "@/lib/utils/permissions";

export default function AppointmentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionPageGuard
      permissions={[PERMISSIONS.VIEW_APPOINTMENTS, PERMISSIONS.VIEW_OWN_APPOINTMENTS]}
      deniedTitle="Appointment access required"
      deniedDescription="You don't have permission to view appointments. Contact your administrator if you need access."
    >
      {children}
    </PermissionPageGuard>
  );
}
