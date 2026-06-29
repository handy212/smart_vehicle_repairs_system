import apiClient from "./client";

export type RevenueClass =
  | "labor"
  | "service"
  | "part"
  | "aa_roadside"
  | "subscription"
  | "sublet_revenue"
  | "sublet_cost"
  | "fee"
  | "other";

export type BillingLineType = "labor" | "part" | "fee" | "sublet" | "other";

export interface RevenueProduct {
  id: number;
  code: string;
  name: string;
  owner_account_code?: string;
  owner_account_label?: string;
  revenue_class: RevenueClass;
  default_billing_line_type: BillingLineType;
  catalog_part?: number | null;
  catalog_part_number?: string | null;
  roadside_service_type?: string | null;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export type RevenueProductPayload = Partial<
  Pick<
    RevenueProduct,
    | "code"
    | "name"
    | "owner_account_code"
    | "owner_account_label"
    | "revenue_class"
    | "default_billing_line_type"
    | "catalog_part"
    | "roadside_service_type"
    | "is_active"
    | "sort_order"
  >
>;

export const REVENUE_CLASS_LABELS: Record<RevenueClass, string> = {
  labor: "Labour",
  service: "Workshop service",
  part: "Parts & materials",
  aa_roadside: "AA / roadside",
  subscription: "Subscription",
  sublet_revenue: "Sublet revenue",
  sublet_cost: "Sublet cost",
  fee: "Fee",
  other: "Other",
};

export type CatalogPartOption = {
  id: number;
  part_number: string;
  name: string;
};

export const revenueProductsApi = {
  listCatalogParts: async (): Promise<CatalogPartOption[]> => {
    const response = await apiClient.get("/accounting/revenue-products/catalog-parts/");
    return response.data;
  },

  list: async (params?: { is_active?: boolean; revenue_class?: string }): Promise<RevenueProduct[]> => {
    const response = await apiClient.get("/accounting/revenue-products/", { params });
    return response.data.results ?? response.data;
  },

  get: async (id: number): Promise<RevenueProduct> => {
    const response = await apiClient.get(`/accounting/revenue-products/${id}/`);
    return response.data;
  },

  create: async (payload: RevenueProductPayload): Promise<RevenueProduct> => {
    const response = await apiClient.post("/accounting/revenue-products/", payload);
    return response.data;
  },

  update: async (id: number, payload: RevenueProductPayload): Promise<RevenueProduct> => {
    const response = await apiClient.patch(`/accounting/revenue-products/${id}/`, payload);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/accounting/revenue-products/${id}/`);
  },
};
