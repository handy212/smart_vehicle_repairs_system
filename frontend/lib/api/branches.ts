import apiClient from "./client";
import type { User } from "./admin";

export interface Branch {
  id: number;
  name: string;
  code: string;
  description?: string;
  phone: string;
  email?: string;
  fax?: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  is_active: boolean;
  is_headquarters: boolean;
  opening_time?: string;
  closing_time?: string;
  timezone?: string;
  staff_count?: number;
  manager_count?: number;
  created_at?: string;
  updated_at?: string;
  qbo_department_id?: string | null;
  qbo_department_name?: string | null;
  qbo_sync_status?: string | null;
  qbo_sync_error?: string | null;
}

export interface QboDepartment {
  id: string;
  name: string;
  active: boolean;
  mapped_branch?: {
    id: number;
    name: string;
    code: string;
  } | null;
  sync_status?: string | null;
}

export interface QboDepartmentsResponse {
  departments: QboDepartment[];
  is_connected: boolean;
}

export interface BranchQboMappingResult {
  detail: string;
  branch_id: number;
  qbo_department_id?: string;
  qbo_department_name?: string;
}

export interface BranchSettlementAccount {
  id: number;
  code: string;
  name: string;
  account_subtype: string;
  is_till_enabled: boolean;
  is_active: boolean;
  branch_id: number | null;
  branch_name: string | null;
  qbo_mapped: boolean;
}

export interface BranchQboCoaMappingRow {
  mapping_kind: string;
  mapping_key: string;
  label: string;
  group: string;
  uses_item: boolean;
  control_field?: string | null;
  qbo_account_id: string;
  qbo_account_name: string;
  qbo_account_number: string;
  qbo_item_id: string;
  qbo_item_name: string;
  status: string;
  error_message: string;
  inherits_company_default?: boolean;
  company_default?: {
    qbo_account_id: string;
    qbo_account_name: string;
    qbo_account_number: string;
    qbo_item_id: string;
    qbo_item_name: string;
  } | null;
  effective_mapping?: {
    qbo_account_id: string;
    qbo_account_name: string;
    qbo_item_id: string;
    qbo_item_name: string;
    source: string;
  };
  qbo_account_hint?: string;
}

export interface BranchQboCoaMappingsOverview {
  is_connected: boolean;
  branch_id: number;
  branch_name: string;
  groups: Array<{ group: string; rows: BranchQboCoaMappingRow[] }>;
  rows: BranchQboCoaMappingRow[];
  updated?: number;
  errors?: Array<{ mapping_kind?: string; mapping_key?: string; detail: string }>;
}

export interface BranchSettlementAccountsOverview {
  branch_id: number;
  branch_name: string;
  assigned: BranchSettlementAccount[];
  available: BranchSettlementAccount[];
  shared: BranchSettlementAccount[];
  unassigned?: BranchSettlementAccount[];
  errors?: string[];
  provision?: {
    created?: string[];
    updated?: string[];
    mapped?: string[];
    skipped?: string[];
    errors?: string[];
  };
}

export interface BranchQboOnboardResult {
  branch_id: number;
  branch_name: string;
  dry_run: boolean;
  location?: {
    skipped?: boolean;
    dry_run?: boolean;
    action?: string;
    detail?: string;
    qbo_department_id?: string;
    qbo_department_name?: string | null;
  } | null;
  settlement?: {
    created?: string[];
    updated?: string[];
    mapped?: string[];
    skipped?: string[];
    errors?: string[];
  } | null;
  main_cash?: {
    created?: string[];
    updated?: string[];
    mapped?: string[];
    skipped?: string[];
    errors?: string[];
  } | null;
  settlement_overview?: BranchSettlementAccountsOverview | null;
  errors?: string[];
  warnings?: string[];
}

export interface BranchListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Branch[];
}

/** Normalize paginated or plain array branch list responses from the API. */
export function normalizeBranchList(data: unknown): Branch[] {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && typeof data === "object" && Array.isArray((data as BranchListResponse).results)) {
    return (data as BranchListResponse).results;
  }
  return [];
}

export interface BranchStats {
  branch_id: number;
  branch_name: string;
  work_orders: {
    total: number;
    active: number;
    completed: number;
    total_revenue: number;
  };
  appointments: {
    total: number;
    upcoming: number;
  };
  inventory: {
    total_parts: number;
    low_stock_parts: number;
  };
  customers: {
    total: number;
    active: number;
  };
  vehicles: {
    total: number;
  };
  staff: {
    total_staff: number;
    total_managers: number;
  };
}

export const branchesApi = {
  list: async (params?: {
    page?: number;
    is_active?: boolean;
    is_headquarters?: boolean;
    search?: string;
    ordering?: string;
  }): Promise<Branch[]> => {
    const response = await apiClient.get("/branches/", { params });
    return normalizeBranchList(response.data);
  },

  get: async (id: number): Promise<Branch> => {
    const response = await apiClient.get(`/branches/${id}/`);
    return response.data;
  },

  create: async (data: Partial<Branch>): Promise<Branch> => {
    const response = await apiClient.post("/branches/", data);
    return response.data;
  },

  update: async (id: number, data: Partial<Branch>): Promise<Branch> => {
    const response = await apiClient.patch(`/branches/${id}/`, data);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/branches/${id}/`);
  },

  permanentDelete: async (
    id: number,
    confirmation: string,
  ): Promise<{ detail: string; fallback_branch?: { id: number; name: string; code: string } }> => {
    const response = await apiClient.post(`/branches/${id}/permanent-delete/`, { confirmation });
    return response.data;
  },

  forceDelete: async (id: number): Promise<{ detail: string }> => {
    const response = await apiClient.delete(`/branches/${id}/force_delete/`);
    return response.data;
  },

  getStats: async (id: number): Promise<BranchStats> => {
    const response = await apiClient.get(`/branches/${id}/stats/`);
    return response.data;
  },


  getStaff: async (id: number): Promise<User[]> => {
    const response = await apiClient.get(`/branches/${id}/staff/`);
    return response.data;
  },


  getManagers: async (id: number): Promise<User[]> => {
    const response = await apiClient.get(`/branches/${id}/managers/`);
    return response.data;
  },

  assignStaff: async (id: number, userId: number): Promise<void> => {
    await apiClient.post(`/branches/${id}/assign_staff/`, { user_id: userId });
  },

  assignManager: async (id: number, userId: number): Promise<void> => {
    await apiClient.post(`/branches/${id}/assign_manager/`, { user_id: userId });
  },

  removeManager: async (id: number, userId: number): Promise<void> => {
    await apiClient.post(`/branches/${id}/remove_manager/`, { user_id: userId });
  },

  getAccessible: async (): Promise<Branch[]> => {
    const response = await apiClient.get("/branches/accessible/");
    return response.data;
  },

  listQboDepartments: async (): Promise<QboDepartmentsResponse> => {
    const response = await apiClient.get("/branches/qbo-departments/");
    return response.data;
  },

  setQboMapping: async (
    id: number,
    payload: { department_id?: string; action?: "auto_sync" | "clear" },
  ): Promise<BranchQboMappingResult> => {
    const response = await apiClient.post(`/branches/${id}/qbo-mapping/`, payload);
    return response.data;
  },

  getSettlementAccounts: async (id: number): Promise<BranchSettlementAccountsOverview> => {
    const response = await apiClient.get(`/branches/${id}/settlement-accounts/`);
    return response.data;
  },

  updateSettlementAccounts: async (
    id: number,
    payload: { assign?: number[]; unassign?: number[]; provision_from_qbo?: boolean },
  ): Promise<BranchSettlementAccountsOverview> => {
    const response = await apiClient.patch(`/branches/${id}/settlement-accounts/`, payload);
    return response.data;
  },

  provisionSettlement: async (
    id: number,
    payload?: { dry_run?: boolean; no_map_qbo?: boolean },
  ): Promise<Record<string, unknown>> => {
    const response = await apiClient.post(`/branches/${id}/provision-settlement/`, payload ?? {});
    return response.data;
  },

  onboardQuickBooks: async (
    id: number,
    payload?: {
      location_action?: "auto_sync" | "map" | "skip";
      department_id?: string;
      provision_settlement?: boolean;
      provision_main_cash?: boolean;
      dry_run?: boolean;
    },
  ): Promise<BranchQboOnboardResult> => {
    const response = await apiClient.post(`/branches/${id}/qbo-onboard/`, payload ?? {});
    return response.data;
  },

  getQboAccountMappings: async (id: number): Promise<BranchQboCoaMappingsOverview> => {
    const response = await apiClient.get(`/branches/${id}/qbo-account-mappings/`);
    return response.data;
  },

  updateQboAccountMappings: async (
    id: number,
    mappings: Array<{
      mapping_kind: string;
      mapping_key: string;
      qbo_account_id?: string;
      qbo_item_id?: string;
      action?: "clear";
    }>,
  ): Promise<BranchQboCoaMappingsOverview> => {
    const response = await apiClient.patch(`/branches/${id}/qbo-account-mappings/`, { mappings });
    return response.data;
  },

  getDefault: async (): Promise<Branch | null> => {
    try {
      // Try to get headquarters branch first
      const response = await apiClient.get("/branches/", {
        params: { is_headquarters: true, is_active: true },
      });
      const branches = normalizeBranchList(response.data);
      if (branches.length > 0) {
        return branches[0];
      }

      // If no headquarters, get first active branch
      const activeResponse = await apiClient.get("/branches/", {
        params: { is_active: true },
      });
      const activeBranches = normalizeBranchList(activeResponse.data);
      if (activeBranches.length > 0) {
        return activeBranches[0];
      }

      return null;
    } catch (error) {
      console.error("Error fetching default branch:", error);
      return null;
    }
  },
};
