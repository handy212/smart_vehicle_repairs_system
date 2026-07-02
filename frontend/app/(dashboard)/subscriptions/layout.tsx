"use client";

import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { PERMISSIONS } from "@/lib/utils/permissions";

export default function SubscriptionsLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionPageGuard
      permission={PERMISSIONS.VIEW_SUBSCRIPTIONS}
      deniedTitle="Subscription access required"
      deniedDescription="You don't have permission to view subscriptions. Contact your administrator if you need access."
    >
      {children}
    </PermissionPageGuard>
  );
}
