import apiClient from "./client";

export interface PartCategory {
  id: number;
  name: string;
  description?: string;
  parent?: number;
  parent_name?: string;
  full_path?: string;
  is_active: boolean;
  subcategories_count?: number;
  parts_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Supplier {
  id: number;
  name: string;
  supplier_code: string;
  supplier_type?: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  fax?: string;
  website?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  tax_id?: string;
  payment_terms?: string;
  credit_limit?: string;
  is_active: boolean;
  is_preferred?: boolean;
  notes?: string;
  parts_count?: number;
  active_po_count?: number;
  total_po_count?: number;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PurchaseOrder {
  id: number;
  po_number: string;
  supplier: number | Supplier;
  supplier_name?: string;
  order_date: string;
  expected_delivery_date?: string;
  status: string;
  subtotal?: string;
  tax?: string;
  shipping?: string;
  total?: string;
  notes?: string;
  submitted_at?: string;
  submitted_by?: number;
  received_at?: string;
  received_by?: number;
  created_by?: number;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
  items?: PurchaseOrderItem[];
}

export interface PurchaseOrderItem {
  id: number;
  purchase_order: number;
  part: number | Part;
  part_number?: string;
  part_name?: string;
  quantity_ordered: number;
  quantity_received?: number;
  remaining_quantity?: number;
  unit_cost?: string;
  total_cost?: string;
  received_at?: string;
}

export interface Part {
  id: number;
  part_number: string;
  name: string;
  description?: string;
  category?: number | { id: number; name: string; full_path?: string };
  category_name?: string;
  category_path?: string;
  manufacturer?: string;
  manufacturer_part_number?: string;
  suppliers?: number[] | Supplier[];
  preferred_supplier?: number | Supplier;
  preferred_supplier_name?: string;
  quantity_in_stock: number;
  quantity_reserved?: number;
  quantity_on_order?: number;
  available_quantity?: number;
  reorder_point: number;
  reorder_quantity?: number;
  minimum_stock: number;
  maximum_stock?: number;
  unit: string;
  cost_price?: string;
  selling_price?: string;
  markup_percentage?: string;
  list_price?: string;
  profit_margin?: string;
  bin_location?: string;
  shelf?: string;
  weight?: string;
  dimensions?: string;
  compatible_makes?: string;
  compatible_models?: string;
  compatible_years?: string;
  warranty_months?: number;
  warranty_notes?: string;
  is_active: boolean;
  is_taxable?: boolean;
  is_core?: boolean;
  core_charge?: string;
  is_low_stock?: boolean;
  is_out_of_stock?: boolean;
  needs_reorder?: boolean;
  total_value?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PartListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Part[];
}

export interface StockAdjustment {
  quantity: number;
  reason: string;
  notes?: string;
}

export const inventoryApi = {
  // Parts
  list: async (params?: {
    page?: number;
    search?: string;
    category?: number;
    low_stock?: boolean;
    out_of_stock?: boolean;
    needs_reorder?: boolean;
    is_active?: boolean;
  }): Promise<PartListResponse> => {
    const response = await apiClient.get("/inventory/parts/", { params });
    return response.data;
  },

  get: async (id: number): Promise<Part> => {
    const response = await apiClient.get(`/inventory/parts/${id}/`);
    return response.data;
  },

  create: async (data: Partial<Part>): Promise<Part> => {
    const response = await apiClient.post("/inventory/parts/", data);
    return response.data;
  },

  update: async (id: number, data: Partial<Part>): Promise<Part> => {
    const response = await apiClient.put(`/inventory/parts/${id}/`, data);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/inventory/parts/${id}/`);
  },

  import: async (file: File): Promise<{ imported: number; skipped: number; errors?: string[] }> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await apiClient.post("/inventory/parts/import_csv/", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  },

  adjustStock: async (id: number, adjustment: StockAdjustment): Promise<Part> => {
    const response = await apiClient.post(`/inventory/parts/${id}/adjust/`, adjustment);
    return response.data;
  },

  lowStock: async (): Promise<Part[]> => {
    const response = await apiClient.get("/inventory/parts/low_stock/");
    return response.data.results || response.data;
  },

  // Categories
  listCategories: async (params?: {
    is_active?: boolean;
    parent?: number;
    search?: string;
  }): Promise<PartCategory[]> => {
    const response = await apiClient.get("/inventory/categories/", { params });
    return response.data.results || response.data;
  },

  getCategory: async (id: number): Promise<PartCategory> => {
    const response = await apiClient.get(`/inventory/categories/${id}/`);
    return response.data;
  },

  createCategory: async (data: Partial<PartCategory>): Promise<PartCategory> => {
    const response = await apiClient.post("/inventory/categories/", data);
    return response.data;
  },

  updateCategory: async (id: number, data: Partial<PartCategory>): Promise<PartCategory> => {
    const response = await apiClient.put(`/inventory/categories/${id}/`, data);
    return response.data;
  },

  deleteCategory: async (id: number): Promise<void> => {
    await apiClient.delete(`/inventory/categories/${id}/`);
  },

  rootCategories: async (): Promise<PartCategory[]> => {
    const response = await apiClient.get("/inventory/categories/root_categories/");
    return response.data;
  },

  getCategorySubcategories: async (id: number): Promise<PartCategory[]> => {
    const response = await apiClient.get(`/inventory/categories/${id}/subcategories/`);
    return response.data;
  },

  // Suppliers
  listSuppliers: async (params?: {
    page?: number;
    search?: string;
    supplier_type?: string;
    is_active?: boolean;
    is_preferred?: boolean;
  }): Promise<{ count: number; next: string | null; previous: string | null; results: Supplier[] } | Supplier[]> => {
    const response = await apiClient.get("/inventory/suppliers/", { params });
    return response.data;
  },

  getSupplier: async (id: number): Promise<Supplier> => {
    const response = await apiClient.get(`/inventory/suppliers/${id}/`);
    return response.data;
  },

  createSupplier: async (data: Partial<Supplier>): Promise<Supplier> => {
    const response = await apiClient.post("/inventory/suppliers/", data);
    return response.data;
  },

  updateSupplier: async (id: number, data: Partial<Supplier>): Promise<Supplier> => {
    const response = await apiClient.put(`/inventory/suppliers/${id}/`, data);
    return response.data;
  },

  deleteSupplier: async (id: number): Promise<void> => {
    await apiClient.delete(`/inventory/suppliers/${id}/`);
  },

  preferredSuppliers: async (): Promise<Supplier[]> => {
    const response = await apiClient.get("/inventory/suppliers/preferred/");
    return response.data;
  },

  getSupplierParts: async (id: number): Promise<Part[]> => {
    const response = await apiClient.get(`/inventory/suppliers/${id}/parts_list/`);
    return response.data;
  },

  // Purchase Orders
  listPurchaseOrders: async (params?: {
    page?: number;
    search?: string;
    status?: string;
    supplier?: number;
    order_date?: string;
  }): Promise<{ count: number; next: string | null; previous: string | null; results: PurchaseOrder[] } | PurchaseOrder[]> => {
    const response = await apiClient.get("/inventory/purchase-orders/", { params });
    return response.data;
  },

  getPurchaseOrder: async (id: number): Promise<PurchaseOrder> => {
    const response = await apiClient.get(`/inventory/purchase-orders/${id}/`);
    return response.data;
  },

  createPurchaseOrder: async (data: Partial<PurchaseOrder>): Promise<PurchaseOrder> => {
    const response = await apiClient.post("/inventory/purchase-orders/", data);
    return response.data;
  },

  updatePurchaseOrder: async (id: number, data: Partial<PurchaseOrder>): Promise<PurchaseOrder> => {
    const response = await apiClient.patch(`/inventory/purchase-orders/${id}/`, data);
    return response.data;
  },

  deletePurchaseOrder: async (id: number): Promise<void> => {
    await apiClient.delete(`/inventory/purchase-orders/${id}/`);
  },

  submitPurchaseOrder: async (id: number): Promise<any> => {
    const response = await apiClient.post(`/inventory/purchase-orders/${id}/submit/`);
    return response.data;
  },

  confirmPurchaseOrder: async (id: number): Promise<any> => {
    const response = await apiClient.post(`/inventory/purchase-orders/${id}/confirm/`);
    return response.data;
  },

  cancelPurchaseOrder: async (id: number): Promise<any> => {
    const response = await apiClient.post(`/inventory/purchase-orders/${id}/cancel/`);
    return response.data;
  },

  addPurchaseOrderItem: async (id: number, item: Partial<PurchaseOrderItem>): Promise<PurchaseOrderItem> => {
    const response = await apiClient.post(`/inventory/purchase-orders/${id}/add_item/`, item);
    return response.data;
  },

  pendingPurchaseOrders: async (): Promise<PurchaseOrder[]> => {
    const response = await apiClient.get("/inventory/purchase-orders/pending/");
    return response.data.results || response.data;
  },

  overduePurchaseOrders: async (): Promise<PurchaseOrder[]> => {
    const response = await apiClient.get("/inventory/purchase-orders/overdue/");
    return response.data;
  },
};
