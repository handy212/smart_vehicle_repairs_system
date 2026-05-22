import apiClient from "./client";

export interface AuditLog {
  id: number;
  user?: number;
  user_email?: string;
  user_name?: string;
  action: string;
  model_name?: string;
  model_label?: string;
  object_id?: string;
  object_repr?: string;

  changes?: Record<string, unknown>;
  changes_display?: string;
  ip_address?: string;
  user_agent?: string;
  timestamp: string;
}

export interface AuditLogFilterOptionModel {
  value: string;
  label: string;
}

export interface AuditLogFilterOptionUser {
  id: number;
  label: string;
  email: string;
}

export interface AuditLogFilterOptions {
  models: AuditLogFilterOptionModel[];
  users: AuditLogFilterOptionUser[];
}

export interface AuditLogStats {
  total: number;
  by_action: Array<{ action: string; count: number }>;
  top_users: Array<{
    user_email: string;
    user_username: string;
    user_name: string;
    count: number;
  }>;
  top_models: Array<{
    model_name: string;
    model_label: string;
    count: number;
  }>;
}

export interface AuditLogListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: AuditLog[];
}

export const auditLogsApi = {
  list: async (params?: {
    page?: number;
    action?: string;
    model_name?: string;  // Bug 6 fix: backend supports this filter
    user?: number;
    search?: string;
    date_from?: string;   // Bug 6 fix: expose date range filters too
    date_to?: string;
  }): Promise<AuditLogListResponse> => {
    const response = await apiClient.get("/accounts/admin/audit-logs/", { params });
    return response.data;
  },

  importHistory: async (params?: {
    page?: number;
    model_name?: string;
    user?: number;
    search?: string;
    date_from?: string;
    date_to?: string;
  }): Promise<AuditLogListResponse> => {
    const response = await apiClient.get("/accounts/admin/audit-logs/import_history/", { params });
    return response.data;
  },

  stats: async (params?: {
    action?: string;
    model_name?: string;
    user?: number;
    search?: string;
    date_from?: string;
    date_to?: string;
  }): Promise<AuditLogStats> => {
    const response = await apiClient.get("/accounts/admin/audit-logs/stats/", { params });
    return response.data;
  },

  filterOptions: async (): Promise<AuditLogFilterOptions> => {
    const response = await apiClient.get("/accounts/admin/audit-logs/filter_options/");
    return response.data;
  },
};
