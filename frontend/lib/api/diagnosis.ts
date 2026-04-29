/* eslint-disable @typescript-eslint/no-explicit-any */

import apiClient from "./client";
import { WorkOrder } from "./workorders";

// ============================================================================
// Types
// ============================================================================

export interface RepairRecommendation {
  id: number;
  recommendation_type: "repair" | "replace" | "service" | "adjust" | "clean" | "inspect";
  recommendation_type_display?: string;
  description: string;
  priority: "critical" | "necessary" | "recommended" | "advisory";
  priority_display?: string;
  approval_status?: "pending_approval" | "approved" | "deferred" | "declined";
  approval_status_display?: string;
  decision_method?: string;
  decision_notes?: string;
  decision_at?: string | null;
  decision_by?: number | null;
  decision_by_name?: string | null;
  quotation_status?: "not_requested" | "requested" | "quoted";
  quotation_status_display?: string;
  quotation_requested_at?: string | null;
  quotation_requested_by?: number | null;
  quotation_requested_by_name?: string | null;
  quotation_estimate_id?: number | null;
  quotation_estimate_number?: string | null;
  quoted_at?: string | null;
  quoted_by?: number | null;
  quoted_by_name?: string | null;
  parts_needed?: Array<{
    part_id?: number;
    part_name: string;
    quantity: number;
    part_number?: string;
  }>;
  findings?: number[];
  linked_findings?: DiagnosisFinding[];
  estimated_parts_cost?: number | string;
  estimated_labor_cost?: number | string;
  estimated_total_cost?: number | string;
  customer_approved?: boolean;
  converted_to_task_id?: number | null;
  order?: number;
  created_at: string;
  updated_at?: string;
}

export interface QuotationQueueRecommendation extends RepairRecommendation {
  diagnosis_id: number;
  work_order_id: number;
  work_order_number: string;
  vehicle_display?: string | null;
  customer_name?: string | null;
  branch_name?: string | null;
}

// Phase 2: Structured Data Types

export interface DiagnosticCode {
  id: number;
  code_number: string;
  code_type: "obd_ii" | "manufacturer" | "abs" | "airbag" | "transmission" | "body" | "chassis" | "other";
  code_type_display?: string;
  description: string;
  severity: "critical" | "warning" | "info";
  severity_display?: string;

  freeze_frame_data?: Record<string, any>;
  status: "active" | "pending" | "resolved";
  status_display?: string;
  recorded_at: string;
  created_at: string;
  updated_at?: string;
}

export interface DiagnosticTest {
  id: number;
  test_name: string;
  category: "electrical" | "mechanical" | "performance" | "fluid" | "pressure" | "temperature" | "visual" | "road_test" | "other";
  category_display?: string;
  test_procedure?: string;
  expected_result?: string;
  actual_result?: string;

  measurements?: Record<string, any>;
  tools_used?: string;
  status: "pass" | "fail" | "inconclusive";
  status_display?: string;
  performed_at: string;
  performed_by?: number | {
    id: number;
    first_name: string;
    last_name: string;
  };
  performed_by_name?: string;
  created_at: string;
  updated_at?: string;
}

export interface DiagnosisFinding {
  id: number;
  finding_title: string;
  category: "engine" | "transmission" | "electrical" | "brakes" | "suspension" | "steering" | "exhaust" | "cooling" | "fuel" | "ac" | "body" | "interior" | "other";
  category_display?: string;
  description: string;
  severity: "critical" | "major" | "minor" | "advisory";
  severity_display?: string;
  diagnostic_codes?: DiagnosticCode[];
  diagnostic_tests?: DiagnosticTest[];
  photos?: DiagnosisPhoto[];
  root_cause?: string;
  contributing_factors?: string;
  status: "identified" | "confirmed" | "fixed";
  status_display?: string;
  created_at: string;
  updated_at?: string;
}

export interface DiagnosisPhoto {
  id: number;
  photo: string;
  photo_url?: string;
  caption?: string;
  photo_type: "problem" | "evidence" | "component" | "before" | "after" | "damage" | "test_result" | "other";
  photo_type_display?: string;
  finding?: number;
  taken_at: string;
  taken_by?: number | {
    id: number;
    first_name: string;
    last_name: string;
  };
  taken_by_name?: string;
  created_at: string;
}

export interface Diagnosis {
  id: number;
  work_order: number | WorkOrder;
  work_order_number?: string;
  work_order_status?: string;
  technician?: number | {
    id: number;
    first_name: string;
    last_name: string;
  };
  technician_name?: string;
  customer_name?: string;
  vehicle_info?: {
    id: number;
    make: string;
    model: string;
    year: number;
    vin: string;
    license_plate?: string;
  };
  started_at?: string | null;
  paused_at?: string | null;
  resumed_at?: string | null;
  completed_at?: string | null;
  status: "not_started" | "in_progress" | "paused" | "awaiting_approval" | "completed" | "on_hold";
  status_display?: string;
  customer_complaint: string;
  initial_observations?: string;
  diagnostic_notes?: string;
  diagnostic_time_hours: number | string;
  diagnostic_time_formatted?: string;
  diagnostic_fee: number | string;
  root_cause?: string;
  root_cause_explanation?: string;
  is_completed: boolean;
  requires_approval: boolean;
  repair_recommendations?: RepairRecommendation[];
  total_estimated_cost?: number;
  // Phase 2: Structured data
  diagnostic_codes?: DiagnosticCode[];
  diagnostic_tests?: DiagnosticTest[];
  findings?: DiagnosisFinding[];
  photos?: DiagnosisPhoto[];
  time_logs?: Array<{
    id: number;
    stage: "started" | "paused" | "resumed" | "completed";
    stage_display?: string;
    started_at: string;
    ended_at?: string | null;
    duration_hours?: number | string;
    duration_formatted?: string;
    technician?: number;
    technician_name?: string;
    notes?: string;
  }>;
  created_at: string;
  updated_at?: string;
}

export interface DiagnosisListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Diagnosis[];
}

// ============================================================================
// API Client
// ============================================================================

export const diagnosisApi = {
  // Diagnoses
  list: async (params?: {
    page?: number;
    status?: string;
    is_completed?: boolean;
    technician?: number;
    work_order?: number;
    search?: string;
    ordering?: string;
  }): Promise<DiagnosisListResponse> => {
    const response = await apiClient.get("/diagnosis/diagnoses/", { params });
    return response.data;
  },

  get: async (id: number): Promise<Diagnosis> => {
    const response = await apiClient.get(`/diagnosis/diagnoses/${id}/`);
    return response.data;
  },

  getByWorkOrder: async (workOrderId: number): Promise<Diagnosis | null> => {
    try {
      const response = await diagnosisApi.list({ work_order: workOrderId });
      if (response.results && response.results.length > 0) {
        // Get the full detail using the detail endpoint to include nested arrays
        const diagnosis = response.results[0];
        return await diagnosisApi.get(diagnosis.id);
      }
      return null;

    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  create: async (data: {
    work_order: number;
    technician?: number;
    customer_complaint: string;
    initial_observations?: string;
    diagnostic_fee?: number | string;
  }): Promise<Diagnosis> => {
    const response = await apiClient.post("/diagnosis/diagnoses/", data);
    return response.data;
  },

  update: async (id: number, data: Partial<Diagnosis>): Promise<Diagnosis> => {
    const response = await apiClient.patch(`/diagnosis/diagnoses/${id}/`, data);
    return response.data;
  },

  start: async (id: number): Promise<{ diagnosis: Diagnosis; message: string }> => {
    const response = await apiClient.post(`/diagnosis/diagnoses/${id}/start/`);
    return response.data;
  },

  pause: async (id: number, reason?: string): Promise<{ diagnosis: Diagnosis; message: string }> => {
    const response = await apiClient.post(`/diagnosis/diagnoses/${id}/pause/`, {
      reason,
    });
    return response.data;
  },

  resume: async (id: number): Promise<{ diagnosis: Diagnosis; message: string }> => {
    const response = await apiClient.post(`/diagnosis/diagnoses/${id}/resume/`);
    return response.data;
  },

  submitForApproval: async (id: number): Promise<{ diagnosis: Diagnosis; work_order?: { id: number; status: string; requires_approval: boolean; approval_requested_at: string | null }; message: string }> => {
    const response = await apiClient.post(`/diagnosis/diagnoses/${id}/submit_for_approval/`);
    return response.data;
  },

  complete: async (id: number, requiresApproval?: boolean): Promise<{ diagnosis: Diagnosis; work_order?: { id: number; status: string; requires_approval: boolean; diagnosis_completed_at: string | null } }> => {
    const response = await apiClient.post(`/diagnosis/diagnoses/${id}/complete/`, {
      requires_approval: requiresApproval,
    });
    return response.data;
  },

  reopen: async (id: number, reason?: string): Promise<{ diagnosis: Diagnosis; work_order?: { id: number; status: string; requires_approval: boolean; diagnosis_completed_at: string | null }; message: string }> => {
    const response = await apiClient.post(`/diagnosis/diagnoses/${id}/reopen/`, {
      reason,
    });
    return response.data;
  },

  convertRecommendationsToTasks: async (
    id: number,
    data?: {
      recommendation_ids?: number[];
      assign_to_technician?: boolean;
    }
  ): Promise<{
    message: string;
    tasks_created: Array<{ id: number; description: string; task_type: string; recommendation_id: number; sequence_order?: number }>;
    parts_linked?: number;
  }> => {
    const response = await apiClient.post(`/diagnosis/diagnoses/${id}/convert_recommendations_to_tasks/`, data);
    return response.data;
  },

  getAiSuggestions: async (
    id: number
  ): Promise<Partial<RepairRecommendation>[]> => {
    const response = await apiClient.get(
      `/diagnosis/diagnoses/${id}/suggest_recommendations/`
    );
    return response.data;
  },

  approveRecommendations: async (
    id: number,
    data: {
      recommendation_ids: number[];
      decision: "approved" | "deferred" | "declined";
      decision_method?: string;
      decision_notes?: string;
    }
  ): Promise<{
    message: string;
    recommendations: RepairRecommendation[];
  }> => {
    const response = await apiClient.post(`/diagnosis/diagnoses/${id}/approve_recommendations/`, data);
    return response.data;
  },

  submitRecommendationsForQuote: async (
    id: number,
    data?: { recommendation_ids?: number[] }
  ): Promise<{
    message: string;
    quotation_estimate_id?: number | null;
    quotation_estimate_number?: string | null;
    parts_synced?: number;
    recommendations: RepairRecommendation[];
  }> => {
    const response = await apiClient.post(`/diagnosis/diagnoses/${id}/submit_recommendations_for_quote/`, data || {});
    return response.data;
  },

  markRecommendationsQuoted: async (
    id: number,
    data?: { recommendation_ids?: number[] }
  ): Promise<{
    message: string;
    recommendations: RepairRecommendation[];
  }> => {
    const response = await apiClient.post(`/diagnosis/diagnoses/${id}/mark_recommendations_quoted/`, data || {});
    return response.data;
  },

  quotationQueue: async (params?: { search?: string; page?: number }): Promise<{
    count: number;
    next: string | null;
    previous: string | null;
    results: QuotationQueueRecommendation[];
  }> => {
    const response = await apiClient.get(`/diagnosis/recommendations/quotation_queue/`, { params });
    return response.data;
  },

  markRecommendationQuoted: async (id: number): Promise<{ message: string; recommendation: RepairRecommendation }> => {
    const response = await apiClient.post(`/diagnosis/recommendations/${id}/mark_quoted/`);
    return response.data;
  },

  // Recommendations
  getRecommendations: async (diagnosisId: number): Promise<RepairRecommendation[]> => {
    const response = await apiClient.get(`/diagnosis/diagnoses/${diagnosisId}/recommendations/`);
    return response.data;
  },

  addRecommendation: async (
    diagnosisId: number,
    data: {
      recommendation_type: RepairRecommendation["recommendation_type"];
      description: string;
      priority: RepairRecommendation["priority"];
      parts_needed?: RepairRecommendation["parts_needed"];
      findings?: number[];
      order?: number;
    }
  ): Promise<RepairRecommendation> => {
    const response = await apiClient.post(
      `/diagnosis/diagnoses/${diagnosisId}/add_recommendation/`,
      data
    );
    return response.data;
  },

  // Repair Recommendations CRUD
  updateRecommendation: async (
    id: number,
    data: Partial<RepairRecommendation>
  ): Promise<RepairRecommendation> => {
    const response = await apiClient.patch(`/diagnosis/recommendations/${id}/`, data);
    return response.data;
  },

  deleteRecommendation: async (id: number): Promise<void> => {
    await apiClient.delete(`/diagnosis/recommendations/${id}/`);
  },

  approveRecommendation: async (id: number): Promise<RepairRecommendation> => {
    const response = await apiClient.post(`/diagnosis/recommendations/${id}/approve/`);
    return response.data.recommendation || response.data;
  },

  // Create Estimate from Diagnosis
  createEstimate: async (
    diagnosisId: number,
    data?: {
      title?: string;
      description?: string;
      notes?: string;
      customer_notes?: string;
      valid_until_days?: number;
      labor_rate?: number;
    }

  ): Promise<{ message: string; estimate: any }> => {
    const response = await apiClient.post(`/diagnosis/diagnoses/${diagnosisId}/create_estimate/`, data || {});
    return response.data;
  },

  requestPartsEstimate: async (diagnosisId: number): Promise<{ message: string; parts_count: number; notified_count: number }> => {
    const response = await apiClient.post(`/diagnosis/diagnoses/${diagnosisId}/request_parts_estimate/`);
    return response.data;
  },

  // Phase 2: Structured Data API Methods

  // Diagnostic Codes
  codes: {
    list: async (params?: {
      diagnosis?: number;
      code_type?: string;
      severity?: string;
      status?: string;
      search?: string;
    }): Promise<DiagnosticCode[]> => {
      const response = await apiClient.get("/diagnosis/codes/", { params });
      return response.data.results || response.data;
    },
    get: async (id: number): Promise<DiagnosticCode> => {
      const response = await apiClient.get(`/diagnosis/codes/${id}/`);
      return response.data;
    },
    create: async (diagnosisId: number, data: Partial<DiagnosticCode>): Promise<DiagnosticCode> => {
      const response = await apiClient.post("/diagnosis/codes/", { ...data, diagnosis: diagnosisId });
      return response.data;
    },
    update: async (id: number, data: Partial<DiagnosticCode>): Promise<DiagnosticCode> => {
      const response = await apiClient.patch(`/diagnosis/codes/${id}/`, data);
      return response.data;
    },
    delete: async (id: number): Promise<void> => {
      await apiClient.delete(`/diagnosis/codes/${id}/`);
    },
    resolve: async (id: number): Promise<DiagnosticCode> => {
      const response = await apiClient.post(`/diagnosis/codes/${id}/resolve/`);
      return response.data.code || response.data;
    },
    decode: async (code: string): Promise<any> => {
      const response = await apiClient.get('/diagnosis/codes/decode/', { params: { code } });
      return response.data;
    },
  },

  syncObdCodes: async (id: number, codes: Array<{ code: string; description?: string; status?: string }>): Promise<{ message: string; synced_codes: string[]; codes: DiagnosticCode[] }> => {
    const response = await apiClient.post(`/diagnosis/diagnoses/${id}/sync_obd_codes/`, { codes });
    return response.data;
  },

  // Diagnostic Tests
  tests: {
    list: async (params?: {
      diagnosis?: number;
      category?: string;
      status?: string;
      search?: string;
    }): Promise<DiagnosticTest[]> => {
      const response = await apiClient.get("/diagnosis/tests/", { params });
      return response.data.results || response.data;
    },
    get: async (id: number): Promise<DiagnosticTest> => {
      const response = await apiClient.get(`/diagnosis/tests/${id}/`);
      return response.data;
    },
    create: async (diagnosisId: number, data: Partial<DiagnosticTest>): Promise<DiagnosticTest> => {
      const response = await apiClient.post("/diagnosis/tests/", { ...data, diagnosis: diagnosisId });
      return response.data;
    },
    update: async (id: number, data: Partial<DiagnosticTest>): Promise<DiagnosticTest> => {
      const response = await apiClient.patch(`/diagnosis/tests/${id}/`, data);
      return response.data;
    },
    delete: async (id: number): Promise<void> => {
      await apiClient.delete(`/diagnosis/tests/${id}/`);
    },
  },

  // Diagnosis Findings
  findings: {
    list: async (params?: {
      diagnosis?: number;
      category?: string;
      severity?: string;
      status?: string;
      search?: string;
    }): Promise<DiagnosisFinding[]> => {
      const response = await apiClient.get("/diagnosis/findings/", { params });
      return response.data.results || response.data;
    },
    get: async (id: number): Promise<DiagnosisFinding> => {
      const response = await apiClient.get(`/diagnosis/findings/${id}/`);
      return response.data;
    },
    create: async (diagnosisId: number, data: Partial<DiagnosisFinding>): Promise<DiagnosisFinding> => {
      const response = await apiClient.post("/diagnosis/findings/", { ...data, diagnosis: diagnosisId });
      return response.data;
    },
    update: async (id: number, data: Partial<DiagnosisFinding>): Promise<DiagnosisFinding> => {
      const response = await apiClient.patch(`/diagnosis/findings/${id}/`, data);
      return response.data;
    },
    delete: async (id: number): Promise<void> => {
      await apiClient.delete(`/diagnosis/findings/${id}/`);
    },
  },

  // Code Library
  codeLibrary: {
    list: async (params?: {
      code_type?: string;
      severity?: string;
      is_active?: boolean;
      search?: string;

    }): Promise<any[]> => {
      const response = await apiClient.get("/diagnosis/code-library/", { params });
      return response.data.results || response.data;
    },

    lookup: async (codeNumber: string, codeType: string = "obd_ii"): Promise<any> => {
      // Trim and uppercase code number, lowercase code type for consistency
      const cleanCodeNumber = codeNumber.trim().toUpperCase();
      const cleanCodeType = codeType.trim().toLowerCase();
      const response = await apiClient.get("/diagnosis/code-library/lookup/", {
        params: { code_number: cleanCodeNumber, code_type: cleanCodeType },
      });
      return response.data;
    },

    search: async (query: string, codeType?: string): Promise<any[]> => {

      const params: any = { search: query, is_active: true };
      if (codeType) params.code_type = codeType;
      const response = await apiClient.get("/diagnosis/code-library/", { params });
      return response.data.results || response.data;
    },
  },

  // Test Procedure Library
  testProcedureLibrary: {
    list: async (params?: {
      category?: string;
      is_active?: boolean;
      search?: string;

    }): Promise<any[]> => {
      const response = await apiClient.get("/diagnosis/test-procedures/", { params });
      return response.data.results || response.data;
    },

    get: async (id: number): Promise<any> => {
      const response = await apiClient.get(`/diagnosis/test-procedures/${id}/`);
      return response.data;
    },

    search: async (query: string, category?: string): Promise<any[]> => {

      const params: any = { search: query, is_active: true };
      if (category) params.category = category;
      const response = await apiClient.get("/diagnosis/test-procedures/", { params });
      return response.data.results || response.data;
    },

    use: async (id: number): Promise<any> => {
      const response = await apiClient.post(`/diagnosis/test-procedures/${id}/use/`);
      return response.data;
    },
  },

  // Diagnosis Photos
  photos: {
    list: async (params?: {
      diagnosis?: number;
      finding?: number;
      photo_type?: string;
    }): Promise<DiagnosisPhoto[]> => {
      const response = await apiClient.get("/diagnosis/photos/", { params });
      return response.data.results || response.data;
    },
    get: async (id: number): Promise<DiagnosisPhoto> => {
      const response = await apiClient.get(`/diagnosis/photos/${id}/`);
      return response.data;
    },
    create: async (diagnosisId: number, data: FormData): Promise<DiagnosisPhoto> => {
      const response = await apiClient.post("/diagnosis/photos/", data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return response.data;
    },
    delete: async (id: number): Promise<void> => {
      await apiClient.delete(`/diagnosis/photos/${id}/`);
    },
    analyzeDamage: async (id: number): Promise<{
      detected_issues: string[];
      confidence_score: number;
      summary: string;
      suggested_severity: string;
    }> => {
      const response = await apiClient.post(`/diagnosis/photos/${id}/analyze_damage/`);
      return response.data;
    },
  },
};
