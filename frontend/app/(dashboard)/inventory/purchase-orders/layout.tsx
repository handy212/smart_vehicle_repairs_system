"use client";

import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { PURCHASE_ORDERS_VIEW_PERMISSIONS } from "@/lib/utils/permissions";

export default function PurchaseOrdersLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionPageGuard
      permissions={[...PURCHASE_ORDERS_VIEW_PERMISSIONS]}
      deniedTitle="Purchase order access required"
      deniedDescription="You need purchasing permissions to view this area."
    >
      {children}
    </PermissionPageGuard>
  );
}
