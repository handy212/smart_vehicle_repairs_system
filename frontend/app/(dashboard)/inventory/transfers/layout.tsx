"use client";

import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { INVENTORY_TRANSFERS_VIEW_PERMISSIONS } from "@/lib/utils/permissions";

export default function TransfersLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionPageGuard
      permissions={[...INVENTORY_TRANSFERS_VIEW_PERMISSIONS]}
      deniedTitle="Transfer access required"
      deniedDescription="You need inventory transfer permissions to view this area."
    >
      {children}
    </PermissionPageGuard>
  );
}
