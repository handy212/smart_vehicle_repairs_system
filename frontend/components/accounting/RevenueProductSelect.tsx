"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  revenueProductsApi,
  type RevenueClass,
  type RevenueProduct,
} from "@/lib/api/revenue-products";
import {
  QboSearchableSelect,
  type QboSearchableOption,
} from "@/components/integrations/QboSearchableSelect";
import {
  INCOME_CATEGORY_SELECT_PLACEHOLDER,
  INCOME_CATEGORY_UNMAPPED,
} from "@/lib/accounting/income-category-labels";

const UNMAPPED = "__none__";

type Props = {
  value?: number | null;
  onChange: (value: number | null) => void;
  onProductSelect?: (product: RevenueProduct | null) => void;
  disabled?: boolean;
  placeholder?: string;
  revenueClass?: RevenueClass;
  branchId?: number | null;
  className?: string;
};

export function RevenueProductSelect({
  value,
  onChange,
  onProductSelect,
  disabled,
  placeholder = INCOME_CATEGORY_SELECT_PLACEHOLDER,
  revenueClass,
  branchId,
  className,
}: Props) {
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["revenue-products", revenueClass ?? "all", branchId ?? "company"],
    queryFn: () =>
      revenueProductsApi.list({
        is_active: true,
        ...(revenueClass ? { revenue_class: revenueClass } : {}),
        ...(branchId ? { branch: branchId } : {}),
      }),
  });

  const selectedMissingFromList =
    value != null && !products.some((product) => product.id === value);

  const { data: selectedProduct, isLoading: selectedLoading } = useQuery({
    queryKey: ["revenue-products", "selected", value],
    queryFn: () => revenueProductsApi.get(value!),
    enabled: selectedMissingFromList,
  });

  const productRows = useMemo(() => {
    if (selectedProduct && !products.some((product) => product.id === selectedProduct.id)) {
      return [selectedProduct, ...products];
    }
    return products;
  }, [products, selectedProduct]);

  const options = useMemo<QboSearchableOption[]>(() => {
    return [
      {
        value: UNMAPPED,
        label: INCOME_CATEGORY_UNMAPPED,
        searchText: "unmapped none",
      },
      ...productRows.map((product) => ({
        value: String(product.id),
        label: product.owner_account_code
          ? `${product.owner_account_code} · ${product.name}`
          : product.name,
        searchText: [
          product.code,
          product.name,
          product.owner_account_code,
          product.owner_account_label,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
        hint: product.revenue_class,
      })),
    ];
  }, [productRows]);

  const selectedValue = value != null ? String(value) : UNMAPPED;
  const loading = isLoading || (selectedMissingFromList && selectedLoading);

  const handleSelect = (next: string) => {
    const id = next === UNMAPPED ? null : Number(next);
    onChange(id);
    if (!onProductSelect) {
      return;
    }
    if (id == null) {
      onProductSelect(null);
      return;
    }
    const product = productRows.find((row) => row.id === id) ?? null;
    onProductSelect(product);
  };

  return (
    <QboSearchableSelect
      value={selectedValue}
      onValueChange={handleSelect}
      options={options}
      placeholder={loading ? "Loading…" : placeholder}
      emptyMessage="No income categories match your search."
      className={className ?? "h-8 text-xs bg-card"}
    />
  );
}
