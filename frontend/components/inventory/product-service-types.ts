import { Box, Layers, Package, Wrench, type LucideIcon } from "lucide-react";

export type ProductServiceType = "inventory" | "non_inventory" | "service" | "bundle";

export interface ProductServiceTypeOption {
  id: ProductServiceType;
  urlSlug: string;
  title: string;
  description: string;
  icon: LucideIcon;
  apiItemType?: "inventory" | "non_inventory" | "service";
}

export const PRODUCT_SERVICE_TYPES: ProductServiceTypeOption[] = [
  {
    id: "inventory",
    urlSlug: "inventory",
    title: "Inventory",
    description:
      "Products you buy and/or sell and that you track quantities of.",
    icon: Package,
    apiItemType: "inventory",
  },
  {
    id: "non_inventory",
    urlSlug: "non-inventory",
    title: "Non-inventory",
    description:
      "Products you buy and/or sell but don't need to (or can't) track quantities of, for example, nuts and bolts used in an installation.",
    icon: Box,
    apiItemType: "non_inventory",
  },
  {
    id: "service",
    urlSlug: "service",
    title: "Service",
    description:
      "Services that you provide to customers, for example, landscaping or tax preparation services.",
    icon: Wrench,
    apiItemType: "service",
  },
  {
    id: "bundle",
    urlSlug: "bundle",
    title: "Bundle",
    description:
      "A collection of products and/or services that you sell together, for example, a gift basket of fruit, cheese, and wine.",
    icon: Layers,
  },
];

export function isProductServiceType(value: string): value is ProductServiceType {
  return PRODUCT_SERVICE_TYPES.some((t) => t.id === value);
}

export function getProductServiceTypeOption(type: ProductServiceType) {
  return PRODUCT_SERVICE_TYPES.find((t) => t.id === type);
}

export function getProductServiceTypeBySlug(slug: string) {
  return PRODUCT_SERVICE_TYPES.find((t) => t.urlSlug === slug);
}

export function productServiceTypeLabel(type: ProductServiceType | string | undefined) {
  switch (type) {
    case "inventory":
      return "Inventory";
    case "non_inventory":
      return "Non-inventory";
    case "service":
      return "Service";
    case "bundle":
      return "Bundle";
    default:
      return "Product";
  }
}
