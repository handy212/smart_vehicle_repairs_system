import { inventoryApi, type Part } from "@/lib/api/inventory";
import { revenueProductsApi } from "@/lib/api/revenue-products";
import type { LineIncomeCategoryPatch } from "@/components/billing/BillingLineIncomeCategorySelect";

export async function resolveIncomeCategoryForPart(part: Part): Promise<LineIncomeCategoryPatch> {
  let revenueProductId = part.revenue_product ?? undefined;

  if (!revenueProductId && part.category) {
    const categoryId =
      typeof part.category === "object" && part.category !== null
        ? part.category.id
        : part.category;
    if (categoryId) {
      try {
        const category = await inventoryApi.getCategory(categoryId);
        revenueProductId = category.revenue_product ?? undefined;
      } catch {
        revenueProductId = undefined;
      }
    }
  }

  if (!revenueProductId) {
    return {
      revenue_product: null,
      revenue_product_name: null,
      owner_account_code: null,
    };
  }

  try {
    const product = await revenueProductsApi.get(revenueProductId);
    return {
      revenue_product: product.id,
      revenue_product_name: product.name,
      owner_account_code: product.owner_account_code ?? null,
    };
  } catch {
    return {
      revenue_product: revenueProductId,
      revenue_product_name: null,
      owner_account_code: null,
    };
  }
}
