"use client";

import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import {
  INVENTORY_REPORTS_VIEW_PERMISSIONS,
  INVENTORY_TRANSFERS_VIEW_PERMISSIONS,
  PARTS_REQUESTS_VIEW_PERMISSIONS,
  PHYSICAL_COUNTS_VIEW_PERMISSIONS,
  PURCHASE_ORDERS_VIEW_PERMISSIONS,
  STORES_QUOTATION_VIEW_PERMISSIONS,
} from "@/lib/utils/permissions";

const INVENTORY_AREA_PERMISSIONS = Array.from(
  new Set([
    "view_inventory",
    "view_suppliers",
    "view_low_stock_alerts",
    "manage_inventory",
    ...STORES_QUOTATION_VIEW_PERMISSIONS,
    ...PARTS_REQUESTS_VIEW_PERMISSIONS,
    ...PURCHASE_ORDERS_VIEW_PERMISSIONS,
    ...INVENTORY_TRANSFERS_VIEW_PERMISSIONS,
    ...PHYSICAL_COUNTS_VIEW_PERMISSIONS,
    ...INVENTORY_REPORTS_VIEW_PERMISSIONS,
  ])
);

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionPageGuard
      permissions={INVENTORY_AREA_PERMISSIONS}
      deniedTitle="Inventory access required"
      deniedDescription="You need inventory or stores permissions to view this area. Contact your administrator if you need access."
    >
      {children}
    </PermissionPageGuard>
  );
}
