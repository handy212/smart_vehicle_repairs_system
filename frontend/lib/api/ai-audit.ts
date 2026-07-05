import apiClient from './client';

export interface AIAuditLog {
  id: number;
  feature: string;
  prompt_summary: string;
  output_summary: string;
  user: number | null;
  user_email: string | null;
  branch_id: number | null;
  success: boolean;
  error_message: string;
  created_at: string;
}

type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export const aiAuditApi = {
  list: async (params?: {
    page?: number;
    feature?: string;
    success?: boolean;
    search?: string;
    ordering?: string;
  }): Promise<Paginated<AIAuditLog>> => {
    const response = await apiClient.get('/reporting/ai-audit-logs/', { params });
    return response.data;
  },

  get: async (id: number): Promise<AIAuditLog> => {
    const response = await apiClient.get(`/reporting/ai-audit-logs/${id}/`);
    return response.data;
  },
};
