"use client";

import { RevenueProductSelect } from "@/components/accounting/RevenueProductSelect";
import type { RevenueClass } from "@/lib/api/revenue-products";

export type LineIncomeCategoryPatch = {
  revenue_product: number | null;
  revenue_product_name?: string | null;
  owner_account_code?: string | null;
};

export function lineTypeToRevenueClass(itemType: string): RevenueClass | undefined {
  switch (itemType) {
    case "labor":
      return "labor";
    case "part":
      return "part";
    case "sublet":
      return "sublet_revenue";
    case "fee":
      return "fee";
    default:
      return undefined;
  }
}

type Props = {
  itemType: string;
  value?: number | null;
  branchId?: number | null;
  onResolvedChange: (patch: LineIncomeCategoryPatch) => void;
  className?: string;
};

export function BillingLineIncomeCategorySelect({
  itemType,
  value,
  branchId,
  onResolvedChange,
  className,
}: Props) {
  return (
    <RevenueProductSelect
      value={value}
      branchId={branchId}
      revenueClass={lineTypeToRevenueClass(itemType)}
      className={className}
      onChange={() => {}}
      onProductSelect={(product) => {
        onResolvedChange({
          revenue_product: product?.id ?? null,
          revenue_product_name: product?.name ?? null,
          owner_account_code: product?.owner_account_code ?? null,
        });
      }}
    />
  );
}
