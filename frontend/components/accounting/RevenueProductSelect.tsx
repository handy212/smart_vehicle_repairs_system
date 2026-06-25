"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { revenueProductsApi, type RevenueClass } from "@/lib/api/revenue-products";
import {
  INCOME_CATEGORY_SELECT_PLACEHOLDER,
  INCOME_CATEGORY_UNMAPPED,
} from "@/lib/accounting/income-category-labels";

const UNMAPPED = "__none__";

type Props = {
  value?: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  placeholder?: string;
  revenueClass?: RevenueClass;
  className?: string;
};

export function RevenueProductSelect({
  value,
  onChange,
  disabled,
  placeholder = INCOME_CATEGORY_SELECT_PLACEHOLDER,
  revenueClass,
  className,
}: Props) {
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["revenue-products", revenueClass ?? "all"],
    queryFn: () =>
      revenueProductsApi.list({
        is_active: true,
        ...(revenueClass ? { revenue_class: revenueClass } : {}),
      }),
  });

  const selectedMissingFromList =
    value != null && !products.some((product) => product.id === value);

  const { data: selectedProduct, isLoading: selectedLoading } = useQuery({
    queryKey: ["revenue-products", "selected", value],
    queryFn: () => revenueProductsApi.get(value!),
    enabled: selectedMissingFromList,
  });

  const options = useMemo(() => {
    if (!selectedProduct || products.some((product) => product.id === selectedProduct.id)) {
      return products;
    }
    return [selectedProduct, ...products];
  }, [products, selectedProduct]);

  const selected = value != null ? String(value) : UNMAPPED;
  const loading = isLoading || (selectedMissingFromList && selectedLoading);

  return (
    <Select
      value={selected}
      onValueChange={(next) => onChange(next === UNMAPPED ? null : Number(next))}
      disabled={disabled || loading}
    >
      <SelectTrigger className={className ?? "h-8 text-xs bg-card"}>
        <SelectValue placeholder={loading ? "Loading…" : placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNMAPPED}>{INCOME_CATEGORY_UNMAPPED}</SelectItem>
        {options.map((product) => (
          <SelectItem key={product.id} value={String(product.id)}>
            {product.name}
            {product.owner_account_code ? ` (${product.owner_account_code})` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
