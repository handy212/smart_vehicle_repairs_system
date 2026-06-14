import apiClient from "./client";

export interface TaxConfig {
  enabled: boolean;
  regime: string;
  vat_rate: string;
  nhil_rate: string;
  getfund_rate: string;
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
  discount_percentage?: string;
  discount_amount?: string;
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
  estimate?: number | { id: number };
  estimate_number?: string;
  work_order?: number | { id: number };
  work_order_number?: string;
  work_order_status?: string;
  invoice_date: string;
  due_date: string;
  status: string;
  title?: string;
  description?: string;
  subtotal?: string;
  discount_amount?: string;
  discount_percentage?: string;
  discount_reason?: string;
  reference_number?: string;
  sales_agent?: number;
  sales_agent_name?: string;
  tax_amount?: string;
  taxable_subtotal?: string;
  tax_nhil_amount?: string;
  tax_getfund_amount?: string;
  tax_hrl_amount?: string;
  tax_vat_amount?: string;
  tax_regime?: string;
  total: string;
  amount_paid?: string;
  amount_due?: string;
  balance_due?: string;
  payment_terms?: string;
  notes?: string;
  customer_notes?: string;
  internal_notes?: string;
  terms?: string;
  line_items?: InvoiceLineItem[];
  tax_breakdown?: TaxBreakdown;
  created_at?: string;
  sent_at?: string;
  paid_at?: string;
  // Django Ledger integration
  ledger_invoice?: string; // UUID of DL InvoiceModel
  ledger_invoice_url?: string; // URL to view in Django Ledger
  qbo_sync_status?: string;
  qbo_sync_error?: string;
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
  till?: number | null;
  till_account_name?: string | null;
  bank_account?: number | null;
  bank_account_name?: string | null;
  status: string;
  transaction_id?: string;
  reference_number?: string;
  check_number?: string;
  notes?: string;
  refund_amount?: string;
  created_at: string;
}

export interface PaymentAllocation {
  id: number;
  payment: number;
  payment_number: string;
  invoice: number;
  invoice_number: string;
  amount: string;
  allocated_at: string;
  allocated_by: number;
  allocated_by_name: string;
  notes?: string;
}

export interface AllocationInput {
  invoice_id: number;
  amount: string;
  notes?: string;
}

export interface AllocatePaymentRequest {
  payment_id: number;
  allocations: AllocationInput[];
}

export interface UnallocatedAmountResponse {
  payment_amount: string;
  allocated: string;
  unallocated: string;
}

export interface EstimateLineItem {
  id?: number;
  item_type: "labor" | "part" | "fee" | "discount" | "sublet" | "other";
  description: string;
  quantity?: number;
  unit_price?: string;
  discount_percentage?: string;
  discount_amount?: string;
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
  work_order_status?: string;
  work_order_quote_stage?: "waiting_for_stores_quotation" | "quotation_ready" | null;
  work_order_quote_stage_display?: string | null;
  can_mark_ready?: boolean;
  status: string;
  title?: string;
  description?: string;
  reference_number?: string;
  sales_agent?: number;
  sales_agent_name?: string;
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
  discount_type?: 'none' | 'before_tax' | 'after_tax';
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
  latest_invoice_summary?: {
    id: number;
    invoice_number: string;
    status: string;
    total: string;
    amount_paid?: string;
    amount_due?: string;
  } | null;
}

export interface EstimateListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Estimate[];
}


export interface CreditNoteLineItem {
  id?: number;
  description: string;
  quantity: number;
  unit_price: string;
  total?: string;
  is_taxable?: boolean;
}

export interface CreditNoteApplication {
  id: number;
  invoice: number;
  invoice_number?: string;
  amount: string;
  applied_by?: number | null;
  applied_at?: string;
}

export interface CreditNote {
  id: number;
  credit_note_number: string;
  customer: number | { id: number; full_name?: string };
  customer_name?: string;
  invoice?: number | { id: number; invoice_number?: string };
  invoice_number?: string;
  credit_date: string;
  status: 'draft' | 'issued' | 'applied' | 'refunded' | 'void';
  reason?: string;
  notes?: string;
  internal_notes?: string;
  subtotal?: string;
  tax_amount?: string;
  total: string;
  unused_amount: string;
  line_items?: CreditNoteLineItem[];
  applications?: CreditNoteApplication[];
  created_by?: number;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CreditNoteListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: CreditNote[];
}


export interface BillLineItem {
  id?: number;
  description: string;
  quantity: number;
  unit_price: string;
  total?: string;
  expense_category?: string;
  inventory_item?: number;
  created_at?: string;
  updated_at?: string;
}

export interface BillPayment {
  id: number;
  payment_number: string;
  bill: number;
  amount: string;
  payment_date: string;
  payment_method: "cash" | "check" | "bank_transfer" | "mobile_money" | "credit_card" | "other";
  till?: number | null;
  till_account_name?: string | null;
  bank_account?: number | null;
  bank_account_name?: string | null;
  reference_number?: string;
  notes?: string;
  paid_by?: number;
  paid_by_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface BillPaymentCreatePayload {
  amount: string;
  payment_date: string;
  payment_method: "cash" | "check" | "bank_transfer" | "mobile_money" | "credit_card" | "other";
  cash_account?: string;
  bank_account?: string;
  reference_number?: string;
  notes?: string;
}

export interface Bill {
  id: number;
  bill_number: string;
  vendor: number; // ID
  vendor_name?: string;
  branch: number; // ID
  purchase_order?: number | null;
  purchase_order_number?: string;
  reference_number?: string;
  bill_date: string;
  due_date: string;
  terms?: string;
  notes?: string;
  status: 'draft' | 'pending_approval' | 'rejected' | 'open' | 'partially_paid' | 'paid' | 'overdue' | 'void';
  currency: string;
  subtotal: string;
  tax_amount: string;
  total: string;
  amount_paid: string;
  amount_due: string;
  line_items?: BillLineItem[];
  payments?: BillPayment[];
  submitted_by?: number | null;
  submitted_by_name?: string;
  submitted_at?: string | null;
  assigned_approver?: number | null;
  assigned_approver_name?: string;
  approved_by?: number | null;
  approved_by_name?: string;
  approved_at?: string | null;
  rejected_by?: number | null;
  rejected_by_name?: string;
  rejected_at?: string | null;
  rejection_reason?: string;
  ledger_bill?: number; // ID of DL Bill
  ledger_bill_url?: string;
  created_by?: number;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface BillListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Bill[];
}

export interface BillApprover {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  role: string;
}

export const billingApi = {
  // ... existing methods ...
  bills: {
    list: async (params?: {
      page?: number;
      status?: string;
      vendor?: number;
      branch?: number;
      search?: string;
      date_from?: string;
      date_to?: string;
      due_date_from?: string;
      due_date_to?: string;
      ordering?: string;
    }): Promise<BillListResponse> => {
      const response = await apiClient.get("/billing/bills/", { params });
      return response.data;
    },

    get: async (id: number): Promise<Bill> => {
      const response = await apiClient.get(`/billing/bills/${id}/`);
      return response.data;
    },

    approvers: async (): Promise<BillApprover[]> => {
      const response = await apiClient.get("/billing/bills/approvers/");
      return response.data;
    },

    create: async (data: Partial<Bill>): Promise<Bill> => {
      const response = await apiClient.post("/billing/bills/", data);
      return response.data;
    },

    update: async (id: number, data: Partial<Bill>): Promise<Bill> => {
      const response = await apiClient.put(`/billing/bills/${id}/`, data);
      return response.data;
    },

    recordPayment: async (id: number, data: BillPaymentCreatePayload): Promise<BillPayment> => {
      const response = await apiClient.post(`/billing/bills/${id}/record_payment/`, data);
      return response.data;
    },

    submitForApproval: async (id: number, approverId: number): Promise<Bill> => {
      const response = await apiClient.post(`/billing/bills/${id}/submit-for-approval/`, { approver_id: approverId });
      return response.data;
    },

    openDraft: async (id: number): Promise<Bill> => {
      const response = await apiClient.post(`/billing/bills/${id}/open-draft/`);
      return response.data;
    },

    approve: async (id: number): Promise<Bill> => {
      const response = await apiClient.post(`/billing/bills/${id}/approve/`);
      return response.data;
    },

    reject: async (id: number, reason?: string): Promise<Bill> => {
      const response = await apiClient.post(`/billing/bills/${id}/reject/`, { reason });
      return response.data;
    },

    void: async (id: number): Promise<Bill> => {
      const response = await apiClient.post(`/billing/bills/${id}/void/`);
      return response.data;
    },

    delete: async (id: number): Promise<void> => {
      await apiClient.delete(`/billing/bills/${id}/`);
    },
  },

  invoices: {
    list: async (params?: {
      page?: number;
      page_size?: number;
      status?: string;
      customer?: number;
      search?: string;
      date_from?: string;
      date_to?: string;
      invoice_date__gte?: string;
      invoice_date__lte?: string;
      due_date__gte?: string;
      due_date__lte?: string;
      ordering?: string;
    }): Promise<InvoiceListResponse> => {
      const response = await apiClient.get("/billing/invoices/", { params });
      return response.data;
    },

    get: async (id: number): Promise<Invoice> => {
      const response = await apiClient.get(`/billing/invoices/${id}/`);
      return response.data;
    },

    history: async (id: number) => {
      const response = await apiClient.get(`/billing/invoices/${id}/history/`);
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

    convertToInvoice: async (id: number): Promise<Invoice> => {
      const response = await apiClient.post(`/billing/invoices/${id}/convert_to_invoice/`);
      return response.data.invoice || response.data;
    },

    overdue: async (): Promise<Invoice[]> => {
      const response = await apiClient.get("/billing/invoices/overdue/");
      return response.data.results || response.data;
    },

    bulkSend: async (ids: number[]): Promise<{ message: string; sent_count: number; errors?: string[] }> => {
      const response = await apiClient.post(`/billing/invoices/bulk_send/`, { ids });
      return response.data;
    },

    bulkUpdateStatus: async (ids: number[], status: string): Promise<{ message: string; updated_count: number; errors?: string[] }> => {
      const response = await apiClient.post(`/billing/invoices/bulk_update_status/`, { ids, status });
      return response.data;
    },

    stats: async (): Promise<{
      counts: { total: number; draft: number; paid: number; partially_paid: number; overdue: number; unpaid: number };
      financials: { total_paid: number; past_due_total: number; outstanding_total: number };
    }> => {
      const response = await apiClient.get("/billing/invoices/stats/");
      return response.data;
    },

    getSuggestedMessage: async (id: number, channel: "sms" | "email"): Promise<{ subject: string; message: string }> => {
      const response = await apiClient.get(`/billing/invoices/${id}/suggested_message/`, {
        params: { channel },
      });
      return response.data;
    },


    sendSms: async (id: number, message: string): Promise<unknown> => {
      const response = await apiClient.post(`/billing/invoices/${id}/send_customer_sms/`, { message });
      return response.data;
    },


    sendEmail: async (id: number, subject: string, message: string): Promise<unknown> => {
      const response = await apiClient.post(`/billing/invoices/${id}/send_customer_email/`, { subject, message });
      return response.data;
    },

    downloadAgingReport: async (): Promise<Blob> => {
      const response = await apiClient.get('/billing/invoices/aging_report_pdf/', {
        responseType: 'blob',
      });
      return response.data;
    },
  },

  creditNotes: {
    list: async (params?: {
      page?: number;
      status?: string;
      customer?: number;
      search?: string;
      date_from?: string;
      date_to?: string;
      ordering?: string;
    }): Promise<CreditNoteListResponse> => {
      const response = await apiClient.get("/billing/credit-notes/", { params });
      return response.data;
    },

    get: async (id: number): Promise<CreditNote> => {
      const response = await apiClient.get(`/billing/credit-notes/${id}/`);
      return response.data;
    },

    create: async (data: Partial<CreditNote>): Promise<CreditNote> => {
      const response = await apiClient.post("/billing/credit-notes/", data);
      return response.data;
    },

    update: async (id: number, data: Partial<CreditNote>): Promise<CreditNote> => {
      const response = await apiClient.put(`/billing/credit-notes/${id}/`, data);
      return response.data;
    },

    delete: async (id: number): Promise<void> => {
      await apiClient.delete(`/billing/credit-notes/${id}/`);
    },

    approve: async (id: number): Promise<void> => {
      await apiClient.post(`/billing/credit-notes/${id}/approve/`);
    },

    apply: async (
      id: number,
      data: { invoice: number; amount?: string | number }
    ): Promise<CreditNote> => {
      const response = await apiClient.post(`/billing/credit-notes/${id}/apply/`, data);
      return response.data;
    },
  },

    payments: {
    list: async (params?: {
      page?: number;
      invoice?: number;
      customer?: number;
      status?: string;
      payment_method?: string;
      search?: string;
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

    allocations: async (paymentId: number): Promise<PaymentAllocation[]> => {
      const response = await apiClient.get(`/billing/payments/${paymentId}/allocations/`);
      return response.data;
    },

    unallocatedAmount: async (paymentId: number): Promise<UnallocatedAmountResponse> => {
      const response = await apiClient.get(`/billing/payments/${paymentId}/unallocated_amount/`);
      return response.data;
    },
  },

  paymentAllocations: {
    list: async (params?: {
      payment?: number;
      invoice?: number;
      customer?: number;
    }): Promise<{ results: PaymentAllocation[] }> => {
      const response = await apiClient.get("/billing/payment-allocations/", { params });
      return response.data;
    },

    get: async (id: number): Promise<PaymentAllocation> => {
      const response = await apiClient.get(`/billing/payment-allocations/${id}/`);
      return response.data;
    },

    create: async (data: Partial<PaymentAllocation>): Promise<PaymentAllocation> => {
      const response = await apiClient.post("/billing/payment-allocations/", data);
      return response.data;
    },

    allocatePayment: async (data: AllocatePaymentRequest): Promise<PaymentAllocation[]> => {
      const response = await apiClient.post(
        "/billing/payment-allocations/allocate_payment/",
        data
      );
      return response.data;
    },

    autoAllocate: async (paymentId: number): Promise<{
      allocations: PaymentAllocation[];
      unallocated_amount: string;
    }> => {
      const response = await apiClient.post(
        "/billing/payment-allocations/auto_allocate/",
        { payment_id: paymentId }
      );
      return response.data;
    },

    byCustomer: async (customerId: number): Promise<PaymentAllocation[]> => {
      const response = await apiClient.get("/billing/payment-allocations/by_customer/", {
        params: { customer_id: customerId }
      });
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
      const data = response.data;
      if (data.invoice) return data.invoice;
      if (data.invoice_id) {
        return {
          ...data,
          id: data.invoice_id,
          invoice_number: data.invoice_number || "",
        } as Invoice;
      }
      return data;
    },

    history: async (id: number) => {
      const response = await apiClient.get(`/billing/estimates/${id}/history/`);
      return response.data.history || response.data;
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

    markReady: async (id: number): Promise<{
      message: string;
      estimate: Estimate;
      work_order?: {
        id: number;
        status: string;
        quote_stage?: string | null;
        quote_stage_display?: string | null;
      };
    }> => {
      const response = await apiClient.post(`/billing/estimates/${id}/mark_ready/`);
      return response.data;
    },

    pending: async (): Promise<Estimate[]> => {
      const response = await apiClient.get("/billing/estimates/pending/");
      return response.data.results || response.data;
    },

    expiringSoon: async (): Promise<Estimate[]> => {
      const response = await apiClient.get("/billing/estimates/expiring_soon/");
      return response.data.results || response.data;
    },

    stats: async (): Promise<{
      counts: { total: number; draft: number; sent: number; approved: number; declined: number; expired: number };
      financials: { total_approved: number; total_pending: number; total_declined: number };
    }> => {
      const response = await apiClient.get("/billing/estimates/stats/");
      return response.data;
    },

    nextNumber: async (): Promise<{ next_number: string }> => {
      const response = await apiClient.get("/billing/estimates/next_number/");
      return response.data;
    },
  },

  taxes: {
    config: async (): Promise<TaxConfig> => {
      const response = await apiClient.get("/billing/tax/config/");
      return response.data;
    },
  },
};
