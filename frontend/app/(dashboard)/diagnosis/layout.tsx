"use client";

import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";

export default function DiagnosisLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionPageGuard
      permission="view_diagnosis"
      deniedTitle="Diagnosis access required"
      deniedDescription="You don't have permission to access diagnosis. Contact your administrator if you need access."
    >
      {children}
    </PermissionPageGuard>
  );
}
