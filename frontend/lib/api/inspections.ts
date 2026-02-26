import apiClient from "./client";

// ============================================================================
// Types
// ============================================================================

export interface InspectionTemplate {
  id: number;
  name: string;
  description?: string;
  is_active: boolean;
  is_default: boolean;
  requires_odometer: boolean;
  requires_technician_signature: boolean;
  requires_customer_signature: boolean;
  allows_photos: boolean;
  allows_video: boolean;
  category_count?: number;
  total_items?: number;
  created_by_name?: string;
  created_at: string;
  updated_at?: string;
  categories?: InspectionCategory[];
}

export interface InspectionCategory {
  id: number;
  name: string;
  description?: string;
  order: number;
  items?: InspectionItem[];
  item_count?: number;
}

export interface InspectionItem {
  id: number;
  name: string;
  description?: string;
  item_type: "pass_fail" | "yes_no" | "measurement" | "percentage" | "rating" | "condition" | "text";
  item_type_display?: string;
  measurement_unit?: string;
  min_acceptable?: number;
  max_acceptable?: number;
  order: number;
  is_critical: boolean;
}

export interface InspectionPhoto {
  id: number;
  image: string;
  caption?: string;
  order: number;
  created_at: string;
}

export interface InspectionResult {
  id: number;
  inspection_item: number;
  item_name?: string;
  category_name?: string;
  item_type?: string;
  is_critical?: boolean;
  result?: "pass" | "fail" | "advisory" | "not_applicable" | "not_checked" | "na";
  result_display?: string;
  measurement_value?: number;
  percentage_value?: number;
  rating_value?: number;
  condition?: "excellent" | "good" | "fair" | "poor" | "critical";
  condition_display?: string;
  text_note?: string;
  needs_immediate_attention?: boolean;
  recommendation?: string;
  estimated_cost?: string;
  notes?: string;
  photos?: InspectionPhoto[];
  created_at: string;
  updated_at: string;
}

export interface VehicleInspection {
  id: number;
  inspection_number: string;
  vehicle: number | { id: number; year?: number; make?: string; model?: string; vin?: string; license_plate?: string; color?: string };
  vehicle_info?: string;
  work_order?: number | { id: number; wo_number?: string };
  work_order_number?: string;
  template: number | InspectionTemplate;
  template_name?: string;
  inspection_date: string;
  odometer_reading?: number;
  status: "in_progress" | "completed" | "approved" | "rejected";
  status_display?: string;
  overall_result?: "pass" | "pass_with_advisory" | "fail" | "needs_attention";
  overall_result_display?: string;
  performed_by: number;
  performed_by_name?: string;
  approved_by?: number;
  approved_by_name?: string;
  technician_signature?: string;
  customer_signature?: string;
  notes?: string;
  recommendations?: string;

  vehicle_damage?: any[];
  completed_at?: string;
  sent_to_customer_at?: string;
  results?: InspectionResult[];
  result_counts?: {
    pass: number;
    fail: number;
    advisory: number;
    total: number;
  };
  completion_percentage?: number;
  has_critical_issues?: boolean;
  pass_count?: number;
  fail_count?: number;
  advisory_count?: number;
  total_items?: number;
  created_at: string;
  updated_at?: string;
}

export interface InspectionListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: VehicleInspection[];
}

export interface TemplateListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: InspectionTemplate[];
}

// ============================================================================
// API Client
// ============================================================================

export const inspectionsApi = {
  // Templates
  templates: {
    list: async (params?: {
      page?: number;
      is_active?: boolean;
      is_default?: boolean;
      search?: string;
    }): Promise<TemplateListResponse> => {
      const response = await apiClient.get("/inspections/templates/", { params });
      return response.data;
    },
    get: async (id: number): Promise<InspectionTemplate> => {
      const response = await apiClient.get(`/inspections/templates/${id}/`);
      return response.data;
    },
    create: async (data: Partial<InspectionTemplate>): Promise<InspectionTemplate> => {
      const response = await apiClient.post("/inspections/templates/", data);
      return response.data;
    },
    update: async (id: number, data: Partial<InspectionTemplate>): Promise<InspectionTemplate> => {
      const response = await apiClient.patch(`/inspections/templates/${id}/`, data);
      return response.data;
    },
    delete: async (id: number): Promise<void> => {
      await apiClient.delete(`/inspections/templates/${id}/`);
    },
    active: async (): Promise<InspectionTemplate[]> => {
      const response = await apiClient.get("/inspections/templates/active/");
      return response.data;
    },
    setDefault: async (id: number): Promise<InspectionTemplate> => {
      const response = await apiClient.post(`/inspections/templates/${id}/set_default/`);
      return response.data.template;
    },

    addCategory: async (id: number, data: { name: string; description?: string; order?: number }): Promise<any> => {
      const response = await apiClient.post(`/inspections/templates/${id}/add_category/`, data);
      return response.data;
    },

    updateCategory: async (templateId: number, categoryId: number, data: any): Promise<any> => {
      const response = await apiClient.patch(
        `/inspections/templates/${templateId}/update_category/`,
        { ...data, category_id: categoryId }
      );
      return response.data;
    },
    deleteCategory: async (templateId: number, categoryId: number): Promise<void> => {
      await apiClient.delete(`/inspections/templates/${templateId}/delete_category/`, {
        data: { category_id: categoryId }
      });
    },

    addItem: async (templateId: number, categoryId: number, data: any): Promise<any> => {
      const response = await apiClient.post(
        `/inspections/templates/${templateId}/add_item/`,
        { ...data, category_id: categoryId }
      );
      return response.data;
    },

    updateItem: async (templateId: number, itemId: number, data: any): Promise<any> => {
      const response = await apiClient.patch(
        `/inspections/templates/${templateId}/update_item/`,
        { ...data, item_id: itemId }
      );
      return response.data;
    },
    deleteItem: async (templateId: number, itemId: number): Promise<void> => {
      await apiClient.delete(`/inspections/templates/${templateId}/delete_item/`, {
        data: { item_id: itemId }
      });
    },
  },

  // Vehicle Inspections
  list: async (params?: {
    page?: number;
    status?: string;
    overall_result?: string;
    vehicle?: number;
    work_order?: number;
    template?: number;
    performed_by?: number;
    search?: string;
    ordering?: string;
  }): Promise<InspectionListResponse> => {
    const response = await apiClient.get("/inspections/inspections/", { params });
    return response.data;
  },
  get: async (id: number): Promise<VehicleInspection> => {
    const response = await apiClient.get(`/inspections/inspections/${id}/`);
    return response.data;
  },
  create: async (data: Partial<VehicleInspection>): Promise<VehicleInspection> => {
    const response = await apiClient.post("/inspections/inspections/", data);
    return response.data;
  },
  update: async (id: number, data: Partial<VehicleInspection>): Promise<VehicleInspection> => {
    const response = await apiClient.patch(`/inspections/inspections/${id}/`, data);
    return response.data;
  },
  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/inspections/inspections/${id}/`);
  },
  complete: async (id: number, data?: { technician_signature?: string }): Promise<VehicleInspection> => {
    const response = await apiClient.post(`/inspections/inspections/${id}/complete/`, data || {});
    return response.data.inspection;
  },
  approve: async (id: number, data?: { customer_signature?: string }): Promise<VehicleInspection> => {
    const response = await apiClient.post(`/inspections/inspections/${id}/approve/`, data || {});
    return response.data;
  },
  reject: async (id: number): Promise<VehicleInspection> => {
    const response = await apiClient.post(`/inspections/inspections/${id}/reject/`);
    return response.data;
  },
  sendToCustomer: async (id: number, data?: { customer_signature?: string }): Promise<VehicleInspection> => {
    const response = await apiClient.post(`/inspections/inspections/${id}/send_to_customer/`, data || {});
    return response.data;
  },
  byVehicle: async (vehicleId: number): Promise<VehicleInspection[]> => {
    const response = await apiClient.get(`/inspections/inspections/by_vehicle/`, {
      params: { vehicle: vehicleId },
    });
    return response.data;
  },

  generateSummary: async (id: number): Promise<{ message: string; notes: string; recommendations: string }> => {
    const response = await apiClient.post(`/inspections/inspections/${id}/generate_summary/`);
    return response.data;
  },

  saveResults: async (id: number, results: Partial<InspectionResult>[]): Promise<any> => {
    const response = await apiClient.post(`/inspections/inspections/${id}/save_results/`, {
      results,
    });
    return response.data;
  },

  // Results
  results: {
    create: async (data: Partial<InspectionResult>): Promise<InspectionResult> => {
      const response = await apiClient.post("/inspections/results/", data);
      return response.data;
    },
    update: async (id: number, data: Partial<InspectionResult>): Promise<InspectionResult> => {
      const response = await apiClient.patch(`/inspections/results/${id}/`, data);
      return response.data;
    },
    delete: async (id: number): Promise<void> => {
      await apiClient.delete(`/inspections/results/${id}/`);
    },
    addPhoto: async (resultId: number, formData: FormData): Promise<InspectionPhoto> => {
      const response = await apiClient.post(
        `/inspections/results/${resultId}/add_photo/`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      return response.data;
    },
  },
  // Photos
  photos: {
    delete: async (id: number): Promise<void> => {
      await apiClient.delete(`/inspections/photos/${id}/`);
    },
  },
};

