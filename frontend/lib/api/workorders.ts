import apiClient from "./client";
import { Customer } from "./customers";
import { Vehicle } from "./vehicles";

export interface CustomerContactSummary {
  id: number;
  customer: number;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  job_title?: string;
  is_primary?: boolean;
}

export interface WorkOrder {
  id: number;
  work_order_number: string;
  customer: number | Customer;
  customer_name?: string;
  vehicle: number | Vehicle;
  vehicle_info?: string;
  vehicle_display?: string;
  status: string;
  priority: string;
  /** Linked invoice total (billing); null when no invoice yet. */
  total_cost?: string | null;
  created_at: string;
  created_by?: number | { id: number; first_name: string; last_name: string } | string;
  completed_at?: string;
  started_at?: string;
  estimated_completion?: string;
  customer_concerns?: string;
  diagnosis_notes?: string;
  special_instructions?: string;
  diagnosis_status?: "not_started" | "in_progress" | "paused" | "awaiting_approval" | "completed" | "on_hold" | null;
  paused_from_status?: string | null;
  has_technician_assignment?: boolean;
  estimated_labor_hours?: number | string;
  estimated_labor_cost?: string;
  estimated_parts_cost?: string;
  estimated_total?: string;
  actual_labor_hours?: number | string;
  actual_labor_cost?: string;
  actual_parts_cost?: string;
  actual_total?: string;
  approved_by_customer?: boolean;
  approved_at?: string;
  approval_method?: string;
  approval_requested_at?: string;
  diagnosis_completed_at?: string;
  diagnosis_by?: number;
  primary_technician?: number | { id: number; first_name: string; last_name: string };
  primary_technician_name?: string;
  assigned_technicians?: Array<number | { id: number; first_name?: string; last_name?: string }>;
  assigned_technicians_detail?: Array<{ id: number; name: string; email?: string; role?: string }>;
  service_coordinator?: number | { id: number; first_name: string; last_name: string };
  service_coordinator_name?: string;
  brought_by_type?: "account_holder" | "saved_contact" | "third_party";
  brought_by_contact?: number | CustomerContactSummary | null;
  brought_by_name?: string;
  brought_by_phone?: string;
  brought_by_email?: string;
  brought_by_relationship?: string;
  requires_approval?: boolean;
  estimate_summary?: {
    id: number;
    estimate_number: string;
    status: string;
    total: string;
    reference_number?: string;
    estimate_date?: string | null;
    approved_date?: string | null;
    created_at?: string | null;
  } | null;
  invoice_summary?: {
    id: number;
    invoice_number: string;
    status: string;
    total: string;
    amount_paid?: string;
    amount_due?: string;
    is_paid?: boolean;
    is_void?: boolean;
    invoice_date?: string | null;
    paid_at?: string | null;
    created_at?: string | null;
  } | null;
  /** Prior revisions when a voided invoice was re-issued (detail API). */
  related_invoices?: Array<{
    id: number;
    invoice_number: string;
    status: string;
    total: string;
    amount_paid?: string;
    amount_due?: string;
    is_paid?: boolean;
    is_void?: boolean;
    is_primary?: boolean;
    invoice_date?: string | null;
    paid_at?: string | null;
    created_at?: string | null;
  }>;
  gate_pass_status?: string;
  quality_check_required?: boolean;
  quality_check_completed?: boolean;
  quality_check_passed?: boolean;
  quality_check_at?: string;
  quality_check_notes?: string;
  odometer_in?: number;
  odometer_out?: number;
  is_overdue?: boolean;
  days_in_shop?: number;
  is_approved?: boolean;
  is_warranty_rework?: boolean;
  has_completed_inspection?: boolean;
  current_inspection_status?: "draft" | "in_progress" | "completed" | "approved" | "rejected" | null;
  current_inspection_status_display?: string | null;
  current_inspection_completion_percentage?: number | null;
  current_quote_stage?:
    | "waiting_for_stores_quotation"
    | "waiting_for_customer_approval"
    | "quotation_ready"
    | "approved_waiting_for_parts"
    | "parts_ready_waiting_for_repairs"
    | "approved_waiting_for_repairs"
    | null;
  current_quote_stage_display?: string | null;
  related_work_order?: number | {
    id: number;
    work_order_number: string;
    completed_at?: string;
    status: string;
  };
  related_work_order_detail?: {
    id: number;
    work_order_number: string;
    completed_at?: string;
    status: string;
  };
  rework_work_orders?: Array<{
    id: number;
    work_order_number: string;
    created_at: string;
    status: string;
  }>;
  warranty_reason?: string;
  branch?: number | {
    id: number;
    name: string;
  };
  maintenance_type?: 'general' | 'routine';
  service_type?: number | { id: number; name: string };
  service_bundle?: number | { id: number; name: string };
  customer_discontinuation_reason?: string;
  customer_discontinuation_notes?: string;
  customer_discontinued_at?: string | null;
  customer_discontinued_by?: number | { id: number; first_name: string; last_name: string } | null;
  customer_rating?: number | null;
  customer_feedback?: string;
}

export interface WorkOrderListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: WorkOrder[];
}

export const workordersApi = {
  list: async (params?: {
    page?: number;
    status?: string;
    customer?: number;
    priority?: string;
    primary_technician?: number;
    search?: string;
    vehicle?: number;
    date_from?: string;
    date_to?: string;
    created_at__gte?: string;
    created_at__lte?: string;
    ordering?: string;
  }): Promise<WorkOrderListResponse> => {
    const response = await apiClient.get("/workorders/work-orders/", { params });
    return response.data;
  },

  exportExcel: async (params?: {
    status?: string;
    priority?: string;
    search?: string;
    created_at__gte?: string;
    created_at__lte?: string;
    ordering?: string;
  }): Promise<Blob> => {
    const response = await apiClient.get("/workorders/work-orders/export/", {
      params: { ...params, export_format: "xlsx" },
      responseType: "blob",
    });
    return response.data;
  },

  dashboardStats: async (): Promise<{
    total_workorders: number;
    in_progress: number;
    pending: number;
    completed: number;
    cancelled: number;
  }> => {
    const response = await apiClient.get("/workorders/work-orders/dashboard_stats/");
    return response.data;
  },

  get: async (id: number): Promise<WorkOrder> => {
    const response = await apiClient.get(`/workorders/work-orders/${id}/`);
    return response.data;
  },

  create: async (data: Partial<WorkOrder>): Promise<WorkOrder> => {
    const response = await apiClient.post("/workorders/work-orders/", data);
    return response.data;
  },

  update: async (id: number, data: Partial<WorkOrder>): Promise<WorkOrder> => {
    try {
      // Use PATCH for partial updates (only send the fields that are being updated)
      const response = await apiClient.patch(`/workorders/work-orders/${id}/`, data);
      return response.data;

    } catch (error: any) {
      console.error("Work order update error:", error);
      console.error("Update data:", data);
      console.error("Error response:", error.response?.data);
      throw error;
    }
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/workorders/work-orders/${id}/`);
  },

  checkUnapprovedRecommendations: async (vehicleId: number): Promise<{
    vehicle_id: number;
    vehicle_display: string;
    count: number;
    recommendations: Array<{
      id: number;
      description: string;
      priority: string;
      priority_display: string;
      recommendation_type: string;
      recommendation_type_display: string;
      approval_status: string;
      approval_status_display: string;
      quotation_status: string;
      quotation_status_display: string;
      parts_needed: Array<{
        part_name: string;
        part_number?: string;
        quantity: number;
      }>;
      work_order_id: number;
      work_order_number: string;
      work_order_completed_at: string | null;
      diagnosis_id: number;
    }>;
  }> => {
    const response = await apiClient.get(`/workorders/work-orders/check_unapproved_recommendations/`, {
      params: { vehicle_id: vehicleId },
    });
    return response.data;
  },

  getRecentWorkOrders: async (
    vehicleId: number,
    params?: {
      days?: number;
      status?: string;
      limit?: number;
    }
  ): Promise<{
    results: Array<{
      id: number;
      work_order_number: string;
      status: string;
      completed_at: string | null;
      customer_concerns: string;
      technician_name: string;
      branch_name: string;
      days_ago: number | null;
    }>;
  }> => {
    const response = await apiClient.get("/workorders/work-orders/get_recent_work_orders/", {
      params: {
        vehicle: vehicleId,
        ...params,
      },
    });
    return response.data;
  },

  active: async (): Promise<WorkOrder[]> => {
    const response = await apiClient.get("/workorders/work-orders/active/");
    return response.data;
  },

  updateStatus: async (id: number, status: string): Promise<WorkOrder> => {
    const response = await apiClient.patch(`/workorders/work-orders/${id}/`, { status });
    return response.data;
  },

  rateService: async (id: number, data: { rating: number; customer_feedback?: string }): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/rate_service/`, data);
    return response.data;
  },

  bulkUpdateStatus: async (ids: number[], status: string): Promise<{
    updated: number[];
    updated_count: number;
    errors: Array<{ work_order_id: number; work_order_number: string; error: string }>;
    error_count: number;
  }> => {
    const response = await apiClient.post(`/workorders/work-orders/bulk_update_status/`, {
      work_order_ids: ids,
      status,
    });
    return response.data;
  },

  // Workflow Actions
  startIntake: async (id: number, data?: { service_coordinator?: number }): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/start_intake/`, data || {});
    return response.data;
  },

  startDiagnosis: async (id: number): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/start_diagnosis/`);
    return response.data;
  },

  completeDiagnosis: async (
    id: number,
    data: {
      diagnosis_notes?: string;
      requires_approval?: boolean;
      estimated_labor_hours?: number;
      estimated_labor_cost?: string;
      estimated_parts_cost?: string;
    }
  ): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/complete_diagnosis/`, data);
    return response.data;
  },

  requestApproval: async (id: number): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/request_approval/`);
    return response.data;
  },

  approve: async (
    id: number,
    data?: {
      approval_method?: string;
      approval_notes?: string;
    }
  ): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/approve/`, data || {});
    return response.data;
  },

  startWork: async (id: number): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/start_work/`);
    return response.data;
  },

  pause: async (id: number, reason?: string): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/pause/`, { reason });
    return response.data;
  },

  resume: async (id: number): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/resume/`);
    return response.data;
  },

  flagAdditionalWork: async (id: number, data?: { reason?: string; notes?: string }): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/flag_additional_work/`, data || {});
    return response.data;
  },

  requestQualityCheck: async (id: number): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/request_quality_check/`);
    return response.data;
  },

  qualityCheck: async (
    id: number,
    data: {
      passed: boolean;
      notes?: string;
      checklist?: any;
      signature?: string | null;
      odometer_out?: number;
    }
  ): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/quality_check/`, data);
    return response.data;
  },

  complete: async (
    id: number,
    data?: {
      odometer_out?: number;
      completion_notes?: string;
    }
  ): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/complete/`, data || {});
    return response.data;
  },

  markInvoiced: async (id: number, data?: { odometer_out?: number }): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/mark_invoiced/`, data || {});
    return response.data;
  },

  close: async (id: number, data?: { payment_received?: boolean; closing_notes?: string }): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/close/`, data || {});
    return response.data;
  },

  discontinueJob: async (
    id: number,
    data: { reason_code: string; notes?: string }
  ): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/discontinue_job/`, data);
    return response.data;
  },

  reopen: async (id: number): Promise<WorkOrder> => {
    const response = await apiClient.post(`/workorders/work-orders/${id}/reopen/`);
    return response.data;
  },

  predictService: async (id: number): Promise<{
    latest_odometer: number;
    predicted_odometer: number;
    predicted_date: string;
    km_per_day: number;
    confidence_score: number;
    recommendation: string;
    message?: string;
  }> => {
    const response = await apiClient.get(`/workorders/work-orders/${id}/predict_service/`);
    return response.data;
  },

  suggestObservations: async (id: number): Promise<{ observations: string }> => {
    const response = await apiClient.get(`/workorders/work-orders/${id}/suggest_observations/`);
    return response.data;
  },

  suggestQCNotes: async (id: number): Promise<{ notes: string }> => {
    const response = await apiClient.get(`/workorders/work-orders/${id}/suggest_qc_notes/`);
    return response.data;
  },

  checkReadiness: async (id: number): Promise<{
    can_start: boolean;
    errors: string[];
    unavailable_parts: Array<{ part_name: string; reason: string }>;
  }> => {
    const response = await apiClient.get(`/workorders/work-orders/${id}/check_readiness/`);
    return response.data;
  },

  printRecommendations: async (id: number): Promise<{
    work_order: {
      id: number;
      work_order_number: string;
      created_at: string;
      completed_at?: string;
      status: string;
    };
    vehicle: {
      id: number;
      year: number;
      make: string;
      model: string;
      vin: string;
      license_plate?: string;
      display_name: string;
    };
    customer: {
      id: number;
      customer_number: string;
      full_name: string;
      company_name?: string;
    };
    recommendations: Array<{
      id: number;
      recommendation_type: string;
      description: string;
      priority: string;
      estimated_total_cost: string;

      parts_needed?: Array<any>;
    }>;
    count: number;
  }> => {
    const response = await apiClient.get(`/workorders/work-orders/${id}/print_recommendations/`);
    return response.data;
  },

  downloadRecommendationsPDF: async (id: number): Promise<Blob> => {
    // Use the API endpoint for PDF generation
    const response = await apiClient.get(
      `/workorders/work-orders/${id}/recommendations_pdf/`,
      { responseType: 'blob' }
    );
    return response.data;
  },

  checkRepeatVisit: async (data: {
    vehicle: number;
    customer_concerns: string;
  }): Promise<{
    has_repeat: boolean;
    matches: Array<{
      work_order_id: number;
      work_order_number: string;
      completed_at: string;
      days_ago: number;
      customer_concerns: string;
      similarity: number;
      technician: string;
      branch_name: string;
    }>;
  }> => {
    const response = await apiClient.post("/workorders/work-orders/check_repeat_visit/", data);
    return response.data;
  },

  parts: {
    list: async (params: number | { work_order?: number; status?: string }): Promise<WorkOrderPart[]> => {
      const queryParams = typeof params === 'number' ? { work_order: params } : params;
      const response = await apiClient.get('/workorders/parts/', { params: queryParams });
      return response.data;
    },
    dashboardStats: async () => {
      const response = await apiClient.get("/workorders/parts/dashboard_stats/");
      return response.data;
    },
    create: async (data: Partial<WorkOrderPart>): Promise<WorkOrderPart> => {
      const response = await apiClient.post("/workorders/parts/", data);
      return response.data;
    },
    approve: async (id: number): Promise<WorkOrderPart> => {
      const response = await apiClient.post(`/workorders/parts/${id}/approve/`);
      return response.data;
    },
    update: async (id: number, data: Partial<WorkOrderPart>): Promise<WorkOrderPart> => {
      const response = await apiClient.patch(`/workorders/parts/${id}/`, data);
      return response.data;
    },
    delete: async (id: number): Promise<void> => {
      await apiClient.delete(`/workorders/parts/${id}/`);
    },
    allocate: async (id: number): Promise<WorkOrderPart> => {
      const response = await apiClient.post(`/workorders/parts/${id}/allocate/`);
      return response.data;
    },
    markReturned: async (id: number, reason: string): Promise<WorkOrderPart> => {
      const response = await apiClient.post(`/workorders/parts/${id}/mark_returned/`, { reason });
      return response.data;
    },
    order: async (id: number): Promise<{ status: string; po_number: string; po_id: number; message: string }> => {
      const response = await apiClient.post(`/workorders/parts/${id}/order/`);
      return response.data;
    },

    createAndOrder: async (
      id: number,
      inventoryData: {
        part_name: string;
        part_number: string;
        description: string;
        cost_price: string;
        selling_price?: string;
        supplier_id: number;
        minimum_stock_level?: number;
      }
    ): Promise<{ status: string; po_number: string; po_id: number; part_id: number; message: string }> => {
      const response = await apiClient.post(`/workorders/parts/${id}/create_and_order/`, inventoryData);
      return response.data;
    },
    bulkOrder: async (ids: number[]): Promise<{ status: string; processed: number; po_numbers: string[]; errors: string[] }> => {
      const response = await apiClient.post(`/workorders/parts/bulk_order/`, { ids });
      return response.data;
    },
  },

  // Public/Customer Portal APIs (unauthenticated)
  public: {

    get: async (token: string): Promise<any> => {
      const response = await apiClient.get(`/workorders/public/${token}/`);
      return response.data;
    },

    approve: async (token: string, data: { notes?: string }): Promise<any> => {
      const response = await apiClient.post(`/workorders/public/${token}/approve/`, data);
      return response.data;
    },

    decline: async (token: string, data: { reason: string }): Promise<any> => {
      const response = await apiClient.post(`/workorders/public/${token}/decline/`, data);
      return response.data;
    },
  },
};

export interface WorkOrderPart {
  id: number;
  work_order: number;
  task?: number;
  part_number?: string;
  part_name: string;
  description?: string;
  quantity: number;
  unit_cost?: string;
  markup_percentage?: string;
  selling_price?: string;
  status: 'draft' | 'pending' | 'po_created' | 'awaiting_stock' | 'received' | 'ready' | 'installed' | 'returned';
  installed_at?: string;
  installed_by?: number;
  installed_by_name?: string;
  resolution_notes?: string;
  warranty_months?: number;
  warranty_notes?: string;
  inventory_part?: number;
  inventory_status?: {
    available: boolean;
    quantity: number;
    part_id: number | null;
    message?: string;
  };
  approved_by?: number | null;
  approved_by_name?: string | null;
  approved_at?: string | null;
  // Enriched fields
  work_order_number?: string;
  work_order_status?: string;
  work_order_is_approved?: boolean;
  customer_name?: string;
  vehicle_info?: string;
  purchase_order_number?: string;
}
