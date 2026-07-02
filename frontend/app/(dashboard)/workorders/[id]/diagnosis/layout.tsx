"use client";

import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { PERMISSIONS } from "@/lib/utils/permissions";

export default function WorkOrderDiagnosisLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionPageGuard
      permission={PERMISSIONS.VIEW_DIAGNOSIS}
      deniedTitle="Diagnosis access required"
      deniedDescription="You don't have permission to access work order diagnosis. Contact your administrator if you need access."
    >
      {children}
    </PermissionPageGuard>
  );
}
