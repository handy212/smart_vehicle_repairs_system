import apiClient from "./client";

export interface TaxConfig {
  enabled: boolean;
  regime: string;
  vat_rate: string;
  nhil_rate: string;
  getfund_rate: string;
  covid_rate: string;
}

export interface TaxBreakdown {
  regime?: string;
  taxable_subtotal?: string;
  nhil_amount?: string;
  getfund_amount?: string;
  hrl_amount?: string;
  vat_amount?: string;
  total_tax?: string;
}

export interface InvoiceLineItem {
  id?: number;
  item_type: "labor" | "part" | "fee" | "discount" | "sublet" | "other";
  description: string;
  quantity?: number;
  unit_price?: string;
  total?: string;
  labor_hours?: number;
  labor_rate?: string;
  part?: number; // Link to inventory Part
  part_number?: string; // Part number for reference
  part_name?: string;
  is_taxable?: boolean;
  notes?: string;
  order?: number;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  customer: number | { id: number };
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
  vehicle?: number | { id: number };
  vehicle_display?: string;
  vehicle_vin?: string;
  work_order?: number | { id: number };
  work_order_number?: string;
  invoice_date: string;
  due_date: string;
  status: string;
  title?: string;
  description?: string;
  subtotal?: string;
  discount_amount?: string;
  discount_percentage?: string;
  discount_reason?: string;
  tax_amount?: string;
  taxable_subtotal?: string;
  tax_nhil_amount?: string;
  tax_getfund_amount?: string;
  tax_hrl_amount?: string;
  tax_vat_amount?: string;
  tax_regime?: string;
  total: string;
  amount_paid?: string;
  balance_due?: string;
  payment_terms?: string;
  notes?: string;
  customer_notes?: string;
  internal_notes?: string;
  line_items?: InvoiceLineItem[];
  tax_breakdown?: TaxBreakdown;
  created_at?: string;
  sent_at?: string;
  paid_at?: string;
  // Django Ledger integration
  ledger_invoice?: string; // UUID of DL InvoiceModel
  ledger_invoice_url?: string; // URL to view in Django Ledger
}

export interface InvoiceListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Invoice[];
}

export interface Payment {
  id: number;
  payment_number?: string;
  invoice: number;
  invoice_number?: string;
  customer?: number;
  customer_name?: string;
  payment_date: string;
  amount: string;
  payment_method: string;
  status: string;
  transaction_id?: string;
  reference_number?: string;
  check_number?: string;
  notes?: string;
  created_at: string;
}

export interface EstimateLineItem {
  id?: number;
  item_type: "labor" | "part" | "fee" | "discount" | "sublet" | "other";
  description: string;
  quantity?: number;
  unit_price?: string;
  total?: string;
  labor_hours?: number;
  labor_rate?: string;
  part?: number; // Link to inventory Part (ForeignKey)
  part_number?: string; // Part number for reference
  part_name?: string; // Part name (read-only from part)
  is_taxable?: boolean;
  notes?: string;
  order?: number;
}

export interface Estimate {
  id: number;
  estimate_number: string;
  customer: number | { id: number };
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
  vehicle: number | { id: number };
  vehicle_display?: string;
  vehicle_vin?: string;
  work_order?: number | { id: number };
  work_order_number?: string;
  status: string;
  title?: string;
  description?: string;
  notes?: string;
  customer_notes?: string;
  estimate_date: string;
  valid_until: string;
  labor_subtotal?: string;
  parts_subtotal?: string;
  sublet_subtotal?: string;
  subtotal?: string;
  discount_amount?: string;
  discount_percentage?: string;
  discount_reason?: string;
  tax_amount?: string;
  taxable_subtotal?: string;
  tax_nhil_amount?: string;
  tax_getfund_amount?: string;
  tax_hrl_amount?: string;
  tax_vat_amount?: string;
  tax_regime?: string;
  shop_supplies_fee?: string;
  environmental_fee?: string;
  total?: string;
  line_items?: EstimateLineItem[];
  tax_breakdown?: TaxBreakdown;
  is_expired?: boolean;
  days_until_expiration?: number;
  can_be_approved?: boolean;
  can_be_converted?: boolean;
  approved_date?: string;
  declined_date?: string;
  converted_date?: string;
  created_by?: number;
  created_by_name?: string;
  approved_by?: number;
  approved_by_name?: string;
  sent_by?: number;
  sent_by_name?: string;
  sent_at?: string;
  viewed_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface EstimateListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Estimate[];
}

export const billingApi = {
  invoices: {
    list: async (params?: {
      page?: number;
      status?: string;
      customer?: number;
      search?: string;
      date_from?: string;
      date_to?: string;
      invoice_date__gte?: string;
      invoice_date__lte?: string;
      ordering?: string;
    }): Promise<InvoiceListResponse> => {
      const response = await apiClient.get("/billing/invoices/", { params });
      return response.data;
    },

    get: async (id: number): Promise<Invoice> => {
      const response = await apiClient.get(`/billing/invoices/${id}/`);
      return response.data;
    },

    create: async (data: Partial<Invoice>): Promise<Invoice> => {
      const response = await apiClient.post("/billing/invoices/", data);
      return response.data;
    },

    update: async (id: number, data: Partial<Invoice>): Promise<Invoice> => {
      const response = await apiClient.put(`/billing/invoices/${id}/`, data);
      return response.data;
    },

    delete: async (id: number): Promise<void> => {
      await apiClient.delete(`/billing/invoices/${id}/`);
    },

    send: async (id: number): Promise<void> => {
      await apiClient.post(`/billing/invoices/${id}/send/`);
    },

    overdue: async (): Promise<Invoice[]> => {
      const response = await apiClient.get("/billing/invoices/overdue/");
      return response.data.results || response.data;
    },
  },

  payments: {
    list: async (params?: {
      page?: number;
      invoice?: number;
      customer?: number;
      status?: string;
      payment_method?: string;
      ordering?: string;
    }): Promise<Payment[]> => {
      const response = await apiClient.get("/billing/payments/", { params });
      return response.data.results || response.data;
    },

    get: async (id: number): Promise<Payment> => {
      const response = await apiClient.get(`/billing/payments/${id}/`);
      return response.data;
    },

    create: async (data: Partial<Payment>): Promise<Payment> => {
      const response = await apiClient.post("/billing/payments/", data);
      return response.data;
    },
    refund: async (id: number, data: { refund_amount: string; refund_reason: string }): Promise<Payment> => {
      const response = await apiClient.post(`/billing/payments/${id}/refund/`, data);
      return response.data;
    },
  },

  estimates: {
    list: async (params?: {
      page?: number;
      status?: string;
      customer?: number;
      search?: string;
      estimate_date?: string;
      date_from?: string;
      date_to?: string;
      estimate_date__gte?: string;
      estimate_date__lte?: string;
      ordering?: string;
    }): Promise<EstimateListResponse> => {
      const response = await apiClient.get("/billing/estimates/", { params });
      return response.data;
    },

    get: async (id: number): Promise<Estimate> => {
      const response = await apiClient.get(`/billing/estimates/${id}/`);
      return response.data;
    },

    create: async (data: Partial<Estimate>): Promise<Estimate> => {
      const response = await apiClient.post("/billing/estimates/", data);
      return response.data;
    },

    update: async (id: number, data: Partial<Estimate>): Promise<Estimate> => {
      const response = await apiClient.put(`/billing/estimates/${id}/`, data);
      return response.data;
    },

    delete: async (id: number): Promise<void> => {
      await apiClient.delete(`/billing/estimates/${id}/`);
    },

    send: async (id: number): Promise<void> => {
      await apiClient.post(`/billing/estimates/${id}/send/`);
    },

    approve: async (id: number): Promise<Estimate> => {
      const response = await apiClient.post(`/billing/estimates/${id}/approve/`);
      return response.data;
    },

    decline: async (id: number, reason?: string): Promise<Estimate> => {
      const response = await apiClient.post(`/billing/estimates/${id}/decline/`, { reason });
      return response.data;
    },

    convertToInvoice: async (id: number): Promise<Invoice> => {
      const response = await apiClient.post(`/billing/estimates/${id}/convert_to_invoice/`);
      // Backend returns { "message": "...", "invoice": {...} }
      return response.data.invoice || response.data;
    },

    convertToWorkOrder: async (id: number): Promise<{ work_order_id: number; work_order_number: string }> => {
      const response = await apiClient.post(`/billing/estimates/${id}/convert_to_work_order/`);
      return response.data;
    },

    bulkSend: async (ids: number[]): Promise<{ message: string; sent_count: number; errors?: string[] }> => {
      const response = await apiClient.post(`/billing/estimates/bulk_send/`, { ids });
      return response.data;
    },

    bulkUpdateStatus: async (ids: number[], status: string): Promise<{ message: string; updated_count: number; errors?: string[] }> => {
      const response = await apiClient.post(`/billing/estimates/bulk_update_status/`, { ids, status });
      return response.data;
    },

    duplicate: async (id: number): Promise<Estimate> => {
      const response = await apiClient.post(`/billing/estimates/${id}/duplicate/`);
      // Backend returns { message: "...", estimate: {...} }
      return response.data.estimate || response.data;
    },

    pending: async (): Promise<Estimate[]> => {
      const response = await apiClient.get("/billing/estimates/pending/");
      return response.data.results || response.data;
    },

    expiringSoon: async (): Promise<Estimate[]> => {
      const response = await apiClient.get("/billing/estimates/expiring_soon/");
      return response.data.results || response.data;
    },
  },

  taxes: {
    config: async (): Promise<TaxConfig> => {
      const response = await apiClient.get("/billing/tax/config/");
      return response.data;
    },
  },
};
