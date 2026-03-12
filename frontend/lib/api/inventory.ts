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
  qbo_sync_status?: string;
  qbo_sync_error?: string;
  open_balance?: string;
  overdue_payment?: string;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PurchaseOrder {
  id: number;
  po_number: string;
  supplier: number | Supplier;

  branch?: number | any;
  supplier_name?: string;
  order_date: string;
  expected_delivery_date?: string;
  due_date?: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'confirmed' | 'partially_received' | 'received' | 'cancelled';
  subtotal?: string;
  tax?: string;
  tax_amount?: string;
  shipping?: string;
  shipping_cost?: string;
  total?: string;
  notes?: string;
  internal_notes?: string;
  submitted_at?: string;
  submitted_by?: number;
  submitted_by_name?: string;
  approved_at?: string;
  approved_by?: number;
  approved_by_name?: string;
  received_date?: string;
  received_at?: string;
  received_by?: number;
  received_by_name?: string;
  created_by?: number;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
  items?: PurchaseOrderItem[];
  assigned_approver?: number;
  assigned_approver_name?: string;
  qbo_sync_status?: string;
  qbo_sync_error?: string;
}

export interface PurchaseOrderItem {
  id: number;
  purchase_order: number;
  part: number | Part;
  part_number?: string;
  part_name?: string;
  quantity: number;
  quantity_received?: number;
  remaining_quantity?: number;
  unit_cost?: string;
  total?: string;
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
  branch?: number | { id: number; name: string };
  branch_name?: string;
  manufacturer?: string;
  manufacturer_part_number?: string;
  barcode?: string;
  suppliers?: number[] | Supplier[];
  preferred_supplier?: number | Supplier;
  preferred_supplier_name?: string;
  quantity_in_stock: number;
  quantity_on_hand?: number;
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
  image?: string;
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

export interface InventoryTransaction {
  id: number;
  transaction_type: string;
  quantity: number;
  balance_after: number;
  reference_number?: string;
  notes?: string;
  created_at: string;
  created_by_name?: string;
  reason?: string;
}

export interface ServicePackagePart {
  id: number;
  part: number;
  part_name: string;
  part_number: string;
  quantity: number;
  unit: string;
  unit_price: string;
  notes: string;
}

export interface ServicePackage {
  id: number;
  name: string;
  description: string;
  category: number;
  category_name: string;
  estimated_labor_hours: string;
  parts: ServicePackagePart[];
  total_parts_cost: string;
  is_active: boolean;
  created_at: string;
}

export interface StockItem {
  id: number;
  part: number;
  branch: number;
  branch_name?: string;
  branch_code?: string;
  quantity_in_stock: number;
  quantity_reserved: number;
  quantity_on_order: number;
  available_quantity: number;
  reorder_point: number;
  reorder_quantity: number;
  minimum_stock: number;
  maximum_stock: number;
  bin_location?: string;
  shelf?: string;
  is_low_stock: boolean;
  is_out_of_stock: boolean;
  total_value: string;
  updated_at: string;
}

export interface TransferItem {
  id: number;
  transfer: number;
  part: number;
  part_number?: string;
  part_name?: string;
  quantity_requested: number;
  quantity_sent: number;
  quantity_received: number;
  notes?: string;
}

export interface Transfer {
  id: number;
  transfer_number: string;
  source_branch: number;
  source_branch_name?: string;
  destination_branch: number;
  destination_branch_name?: string;
  status: 'draft' | 'pending_approval' | 'requested' | 'approved' | 'in_transit' | 'received' | 'rejected' | 'cancelled';
  requested_date: string;
  approved_date?: string;
  shipped_date?: string;
  received_date?: string;
  notes?: string;
  rejection_reason?: string;
  created_by: number;
  created_by_name?: string;
  submitted_by?: number;
  submitted_by_name?: string;
  submitted_at?: string;
  assigned_approver?: number;
  assigned_approver_name?: string;
  approved_by?: number;
  approved_by_name?: string;
  rejected_by?: number;
  rejected_by_name?: string;
  rejected_at?: string;
  items: TransferItem[];
  created_at: string;
  updated_at: string;
}

export interface ServiceBundleItem {
  id: number;
  part: number;
  part_name: string;
  part_number: string;
  quantity: number;
  unit: string;
  unit_price: string;
}

export interface ServiceBundle {
  id: number;
  name: string;
  description: string;
  service_type: number;
  service_type_name: string;
  items: ServiceBundleItem[];
  is_active: boolean;
  created_by: number;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export const inventoryApi = {
  // Service Packages
  listPackages: async (params?: {
    search?: string;
    category?: number;
    is_active?: boolean;
  }): Promise<{ count: number; results: ServicePackage[] }> => {
    const response = await apiClient.get("/inventory/packages/", { params });
    return response.data;
  },

  getPackage: async (id: number): Promise<ServicePackage> => {
    const response = await apiClient.get(`/inventory/packages/${id}/`);
    return response.data;
  },

  // Parts
  list: async (params?: {
    page?: number;
    search?: string;
    category?: number;
    low_stock?: boolean;
    out_of_stock?: boolean;
    needs_reorder?: boolean;
    is_active?: boolean;
    branch?: number;
  }): Promise<PartListResponse> => {
    const response = await apiClient.get("/inventory/parts/", { params });
    return response.data;
  },

  get: async (id: number): Promise<Part> => {
    const response = await apiClient.get(`/inventory/parts/${id}/`);
    return response.data;
  },

  partsDashboardStats: async () => {
    const response = await apiClient.get("/inventory/parts/dashboard_stats/");
    return response.data;
  },

  create: async (data: Partial<Part> | FormData): Promise<Part> => {
    const response = await apiClient.post("/inventory/parts/", data, {
      headers: data instanceof FormData ? { "Content-Type": "multipart/form-data" } : undefined,
    });
    return response.data;
  },

  update: async (id: number, data: Partial<Part> | FormData): Promise<Part> => {
    const response = await apiClient.put(`/inventory/parts/${id}/`, data, {
      headers: data instanceof FormData ? { "Content-Type": "multipart/form-data" } : undefined,
    });
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

  getTransactions: async (id: number): Promise<InventoryTransaction[]> => {
    const response = await apiClient.get(`/inventory/parts/${id}/transaction_history/`);
    return response.data;
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

  categoriesDashboardStats: async () => {
    const response = await apiClient.get("/inventory/categories/dashboard_stats/");
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

  suppliersDashboardStats: async () => {
    const response = await apiClient.get("/inventory/suppliers/dashboard_stats/");
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

  purchaseOrdersDashboardStats: async () => {
    const response = await apiClient.get("/inventory/purchase-orders/dashboard_stats/");
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


  submitPurchaseOrderForApproval: async (id: number, approverId?: number): Promise<any> => {
    const response = await apiClient.post(`/inventory/purchase-orders/${id}/submit-for-approval/`, {
      approver_id: approverId
    });
    return response.data;
  },


  approvePurchaseOrder: async (id: number): Promise<any> => {
    const response = await apiClient.post(`/inventory/purchase-orders/${id}/approve/`);
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

  removePurchaseOrderItem: async (poId: number, itemId: number): Promise<void> => {
    await apiClient.post(`/inventory/purchase-orders/${poId}/remove_item/`, { item_id: itemId });
  },


  updatePurchaseOrderItem: async (poId: number, itemId: number, data: Partial<PurchaseOrderItem>): Promise<PurchaseOrderItem> => {
    const response = await apiClient.post(`/inventory/purchase-orders/${poId}/update_item/`, {
      item_id: itemId,
      ...data
    });
    return response.data;
  },


  receiveItem: async (itemId: number, quantityReceived: number, notes?: string): Promise<any> => {
    const response = await apiClient.post(`/inventory/po-items/${itemId}/receive/`, {
      quantity_received: quantityReceived,
      notes: notes || ''
    });
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

  // Stock Items (Branch Inventory)
  listStockItems: async (params?: {
    page?: number;
    search?: string;
    branch?: number;
    is_low_stock?: boolean;
    is_out_of_stock?: boolean;
  }): Promise<{ count: number; next: string | null; previous: string | null; results: StockItem[] }> => {
    const response = await apiClient.get("/inventory/stock-items/", { params });
    return response.data;
  },

  getStockItem: async (id: number): Promise<StockItem> => {
    const response = await apiClient.get(`/inventory/stock-items/${id}/`);
    return response.data;
  },

  updateStockItem: async (id: number, data: Partial<StockItem>): Promise<StockItem> => {
    const response = await apiClient.patch(`/inventory/stock-items/${id}/`, data);
    return response.data;
  },

  // Transfers
  listTransfers: async (params?: {
    page?: number;
    search?: string;
    status?: string;
    source_branch?: number;
    destination_branch?: number;
  }): Promise<{ count: number; next: string | null; previous: string | null; results: Transfer[] }> => {
    const response = await apiClient.get("/inventory/transfers/", { params });
    return response.data;
  },

  getTransfer: async (id: number): Promise<Transfer> => {
    const response = await apiClient.get(`/inventory/transfers/${id}/`);
    return response.data;
  },

  createTransfer: async (data: Partial<Transfer>): Promise<Transfer> => {
    const response = await apiClient.post("/inventory/transfers/", data);
    return response.data;
  },

  updateTransfer: async (id: number, data: Partial<Transfer>): Promise<Transfer> => {
    const response = await apiClient.patch(`/inventory/transfers/${id}/`, data);
    return response.data;
  },


  submitTransferForApproval: async (id: number, approverId?: number): Promise<any> => {
    const response = await apiClient.post(`/inventory/transfers/${id}/submit-for-approval/`, {
      approver_id: approverId
    });
    return response.data;
  },


  approveTransfer: async (id: number): Promise<any> => {
    const response = await apiClient.post(`/inventory/transfers/${id}/approve/`);
    return response.data;
  },


  rejectTransfer: async (id: number, reason?: string): Promise<any> => {
    const response = await apiClient.post(`/inventory/transfers/${id}/reject/`, { reason });
    return response.data;
  },


  shipTransfer: async (id: number): Promise<any> => {
    const response = await apiClient.post(`/inventory/transfers/${id}/ship/`);
    return response.data;
  },


  receiveTransfer: async (id: number, items: Record<number, number>): Promise<any> => {
    const response = await apiClient.post(`/inventory/transfers/${id}/receive/`, { items });
    return response.data;
  },

  // Service Bundles
  listBundles: async (params?: {
    search?: string;
    is_active?: boolean;
    service_type?: number;
  }): Promise<ServiceBundle[] | { count: number; results: ServiceBundle[] }> => {
    const response = await apiClient.get("/inventory/service-bundles/", { params });
    return response.data;
  },

  getBundle: async (id: number): Promise<ServiceBundle> => {
    const response = await apiClient.get(`/inventory/service-bundles/${id}/`);
    return response.data;
  },

  createBundle: async (data: Partial<ServiceBundle>): Promise<ServiceBundle> => {
    const response = await apiClient.post("/inventory/service-bundles/", data);
    return response.data;
  },

  updateBundle: async (id: number, data: Partial<ServiceBundle>): Promise<ServiceBundle> => {
    const response = await apiClient.patch(`/inventory/service-bundles/${id}/`, data);
    return response.data;
  },

  deleteBundle: async (id: number): Promise<void> => {
    await apiClient.delete(`/inventory/service-bundles/${id}/`);
  },


  getBundleForecast: async (branchId: number): Promise<any[]> => {
    const response = await apiClient.get(`/inventory/service-bundles/forecast/?branch=${branchId}`);
    return response.data;
  },
};
