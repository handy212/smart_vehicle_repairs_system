"use client";

import { ReactNode } from "react";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <PermissionPageGuard
      permission="manage_settings"
      deniedTitle="Admin access required"
      deniedDescription="You don't have permission to access system settings. Contact your administrator if you need access."
    >
      {children}
    </PermissionPageGuard>
  );
}
