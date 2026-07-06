"use client";

import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";

export default function GatePassLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionPageGuard
      permission="view_gatepass"
      deniedTitle="Gate pass access required"
      deniedDescription="You don't have permission to access gate passes. Contact your administrator if you need access."
    >
      {children}
    </PermissionPageGuard>
  );
}
