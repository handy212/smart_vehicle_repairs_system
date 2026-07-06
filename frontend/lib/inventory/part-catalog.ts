import { productServiceTypeLabel } from "@/components/inventory/product-service-types";

export type PartCatalogType = "inventory" | "non_inventory" | "service";

export type BillingLineItemType = "labor" | "part" | "fee" | "discount" | "sublet" | "other";

export function billingLineTypeForPart(part: {
  item_type?: PartCatalogType;
}): BillingLineItemType {
  if (part.item_type === "service") {
    return "other";
  }
  return "part";
}

export function partTracksStock(part?: { item_type?: PartCatalogType } | null): boolean {
  return part?.item_type === "inventory" || part?.item_type === undefined;
}

export function formatPartPickerMeta(
  part: {
    item_type?: PartCatalogType;
    quantity_on_hand?: number | string | null;
    quantity_in_stock?: number | string | null;
    selling_price?: string | number | null;
    cost_price?: string | number | null;
  },
  formatCurrency: (value: number) => string
): string {
  const typeLabel = part.item_type ? productServiceTypeLabel(part.item_type) : "Part";
  const price = parseFloat(String(part.selling_price || part.cost_price || "0"));
  const priceLabel = formatCurrency(price);
  if (!partTracksStock(part)) {
    return `${typeLabel} · ${priceLabel}`;
  }
  const stock = part.quantity_on_hand ?? part.quantity_in_stock ?? 0;
  return `${typeLabel} · Stock: ${stock} · ${priceLabel}`;
}
