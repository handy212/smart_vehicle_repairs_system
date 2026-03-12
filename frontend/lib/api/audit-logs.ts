import apiClient from "./client";

export interface AuditLog {
  id: number;
  user?: number;
  user_email?: string;
  user_name?: string;
  action: string;
  model_name?: string;
  object_id?: string;
  object_repr?: string;

  changes?: Record<string, any>;
  changes_display?: string;
  ip_address?: string;
  user_agent?: string;
  timestamp: string;
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
    date_from?: string;
    date_to?: string;
  }): Promise<AuditLogListResponse> => {
    const response = await apiClient.get("/accounts/admin/audit-logs/import_history/", { params });
    return response.data;
  },

  stats: async (params?: {
    date_from?: string;
    date_to?: string;
  }): Promise<{
    total: number;
    by_action: Array<{ action: string; count: number }>;
    top_users: Array<{ user__email: string; user__username: string; count: number }>;
    top_models: Array<{ model_name: string; count: number }>;
  }> => {
    const response = await apiClient.get("/accounts/admin/audit-logs/stats/", { params });
    return response.data;
  },
};

