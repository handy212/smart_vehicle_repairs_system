"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { revenueProductsApi, type RevenueClass } from "@/lib/api/revenue-products";

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
  placeholder = "Select revenue product",
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

  const selected = value != null ? String(value) : UNMAPPED;

  return (
    <Select
      value={selected}
      onValueChange={(next) => onChange(next === UNMAPPED ? null : Number(next))}
      disabled={disabled || isLoading}
    >
      <SelectTrigger className={className ?? "h-8 text-xs bg-card"}>
        <SelectValue placeholder={isLoading ? "Loading…" : placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNMAPPED}>Not mapped</SelectItem>
        {products.map((product) => (
          <SelectItem key={product.id} value={String(product.id)}>
            {product.name}
            {product.owner_account_code ? ` (${product.owner_account_code})` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
