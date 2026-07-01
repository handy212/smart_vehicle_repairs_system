import apiClient from "./client";

export interface WorkflowProfile {
  id: number;
  code: string;
  name: string;
  description?: string;
  is_active?: boolean;
  is_predefined?: boolean;
  sort_order?: number;
  skip_inspection: boolean;
  skip_diagnosis: boolean;
  skip_customer_approval: boolean;
  skip_quality_check: boolean;
  auto_approve_on_create: boolean;
  apply_service_bundle_on_create: boolean;
  allows_fast_track_to_approved: boolean;
}

export interface JobTypeWriteInput {
  code?: string;
  name: string;
  category: string;
  description?: string;
  workflow_profile: number;
  is_active?: boolean;
  sort_order?: number;
  requires_inspection?: boolean;
  requires_diagnosis?: boolean;
  requires_approval?: boolean;
  quality_check_required?: boolean;
  allows_bundle?: boolean;
  sets_warranty_flag?: boolean;
  sets_insurance_flag?: boolean;
  default_revenue_product?: number | null;
  default_service_fee?: string | null;
}

export interface JobType {
  id: number;
  code: string;
  name: string;
  category: string;
  category_display?: string;
  description?: string;
  workflow_profile: WorkflowProfile;
  is_active: boolean;
  sort_order: number;
  requires_inspection: boolean;
  requires_diagnosis: boolean;
  requires_approval: boolean;
  quality_check_required: boolean;
  allows_bundle: boolean;
  sets_warranty_flag: boolean;
  sets_insurance_flag: boolean;
  default_revenue_product?: number | null;
  default_revenue_product_name?: string | null;
  default_revenue_product_code?: string | null;
  default_service_fee?: string | null;
}

export interface JobTypeListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: JobType[];
}

export const jobTypesApi = {
  list: async (params?: {
    category?: string;
    allows_bundle?: boolean;
    active_only?: boolean;
    workflow_profile?: number;
  }): Promise<JobTypeListResponse> => {
    const response = await apiClient.get("/workorders/job-types/", { params });
    return response.data;
  },

  get: async (code: string): Promise<JobType> => {
    const response = await apiClient.get(`/workorders/job-types/${code}/`);
    return response.data;
  },

  create: async (data: JobTypeWriteInput): Promise<JobType> => {
    const response = await apiClient.post("/workorders/job-types/", data);
    return response.data;
  },

  update: async (code: string, data: Partial<JobTypeWriteInput>): Promise<JobType> => {
    const response = await apiClient.patch(`/workorders/job-types/${code}/`, data);
    return response.data;
  },

  remove: async (code: string): Promise<void> => {
    await apiClient.delete(`/workorders/job-types/${code}/`);
  },
};

export const workflowProfilesApi = {
  list: async (): Promise<WorkflowProfile[]> => {
    const response = await apiClient.get("/workorders/workflow-profiles/");
    const data = response.data;
    return Array.isArray(data) ? data : data.results ?? [];
  },
};

export function isFastTrackJobType(jobType?: JobType | null): boolean {
  return Boolean(jobType?.workflow_profile?.allows_fast_track_to_approved);
}

export function jobTypeRequiresBundle(jobType?: JobType | null): boolean {
  return Boolean(
    jobType?.allows_bundle && jobType?.workflow_profile?.apply_service_bundle_on_create
  );
}

export function getJobTypeDisplayName(
  workOrder?: {
    job_type_detail?: JobType | null;
    job_type?: number | JobType | null;
    maintenance_type?: string | null;
  } | null
): string {
  if (!workOrder) return "General repair";
  if (workOrder.job_type_detail?.name) return workOrder.job_type_detail.name;
  if (typeof workOrder.job_type === "object" && workOrder.job_type?.name) {
    return workOrder.job_type.name;
  }
  if (workOrder.maintenance_type === "routine") return "Routine service";
  return "General repair";
}
