import apiClient from "./client";

export interface User {
  id: number;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  phone?: string;
  role: string;
  profile_picture?: string;
  date_of_birth?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
  email_notifications: boolean;
  sms_notifications: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  branch?: number | null;
  managed_branches?: number[];
  branch_name?: string | null;
  managed_branches_names?: string[];
  employee_id?: string;
  hire_date?: string;
  hourly_rate?: string;
}

export interface UserCreate {
  email: string;
  username: string;
  password: string;
  password2: string;
  first_name: string;
  last_name: string;
  phone?: string;
  role: string;
  branch?: number | null;
  managed_branches?: number[];
  employee_id?: string;
  hire_date?: string;
  hourly_rate?: string;
  is_active?: boolean;
  send_welcome_email?: boolean;
}

export interface UserUpdate {
  first_name?: string;
  last_name?: string;
  phone?: string;
  profile_picture?: string;
  date_of_birth?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
  email_notifications?: boolean;
  sms_notifications?: boolean;
  is_active?: boolean;
  role?: string;
  branch?: number | null;
  managed_branches?: number[];
  employee_id?: string;
  hire_date?: string;
  hourly_rate?: string;
}

export interface UserListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: User[];
}

export interface SystemSetting {
  id: number;
  category: string;
  key: string;
  value: string;
  description: string;
  is_secret: boolean;
  is_active: boolean;
  updated_by?: number;
  updated_by_name?: string;
  created_at: string;
  updated_at: string;
  display_name?: string;
}

export interface AuditLog {
  id: number;
  user?: number;
  user_email?: string;
  user_name?: string;
  action: string;
  model_name: string;
  object_id: string;
  object_repr: string;
  changes: Record<string, any>;
  changes_display?: string;
  ip_address?: string;
  user_agent?: string;
  timestamp: string;
}

export interface SystemBackup {
  id: number;
  backup_type: string;
  status: string;
  file_path?: string;
  file_size?: number;
  file_size_display?: string;
  created_by?: number;
  created_by_name?: string;
  notes?: string;
  error_message?: string;
  started_at: string;
  completed_at?: string;
}

export interface AdminDashboardStats {
  total_users: number;
  active_users: number;
  total_settings: number;
  recent_logs: AuditLog[];
  user_by_role: Array<{ role: string; count: number }>;
  recent_backups: SystemBackup[];
}

export interface SystemSettingsListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: SystemSetting[];
}

export interface AuditLogListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: AuditLog[];
}

export interface Role {
  id: number;
  code: string;
  name: string;
  description?: string;
  is_system: boolean;
  is_active: boolean;
  priority: number;
  permission_ids?: number[];
  user_count?: number;
  created_at: string;
  updated_at: string;
}

export interface Permission {
  id: number;
  code: string;
  name: string;
  description?: string;
  category: string;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoleCreate {
  code: string;
  name: string;
  description?: string;
  priority?: number;
  is_active?: boolean;
  permission_ids?: number[];
}

export interface RoleUpdate {
  name?: string;
  description?: string;
  priority?: number;
  is_active?: boolean;
  permission_ids?: number[];
}

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
  full_address?: string;
  is_active: boolean;
  is_headquarters: boolean;
  opening_time?: string;
  closing_time?: string;
  timezone: string;
  next_workorder_number: number;
  next_estimate_number: number;
  next_invoice_number: number;
  next_diagnosis_number: number;
  next_inspection_number: number;
  staff_count?: number;
  manager_count?: number;
  created_by?: number;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface BranchCreate {
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
  country?: string;
  is_active?: boolean;
  is_headquarters?: boolean;
  opening_time?: string;
  closing_time?: string;
  timezone?: string;
}

export interface BranchUpdate extends Partial<BranchCreate> { }

export interface SystemBackupListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: SystemBackup[];
}

export const adminApi = {
  // User Management
  users: {
    list: async (params?: {
      page?: number;
      role?: string;
      is_active?: boolean;
      search?: string;
      branch?: number;
    }): Promise<UserListResponse> => {
      const response = await apiClient.get("/accounts/users/", { params });
      return response.data;
    },

    get: async (id: number): Promise<User> => {
      const response = await apiClient.get(`/accounts/users/${id}/`);
      return response.data;
    },

    create: async (data: UserCreate): Promise<User> => {
      const response = await apiClient.post("/accounts/users/", data);
      return response.data;
    },

    update: async (id: number, data: Partial<UserUpdate>): Promise<User> => {
      const response = await apiClient.patch(`/accounts/users/${id}/`, data);
      return response.data;
    },

    delete: async (id: number): Promise<void> => {
      await apiClient.delete(`/accounts/users/${id}/`);
    },

    resetPassword: async (id: number, newPassword: string, sendEmail: boolean = false): Promise<{ detail: string; email_sent: boolean }> => {
      const response = await apiClient.post(`/accounts/users/${id}/reset_password/`, {
        new_password: newPassword,
        send_email: sendEmail,
      });
      return response.data;
    },

    sendPasswordResetLink: async (id: number): Promise<{ detail: string }> => {
      const response = await apiClient.post(`/accounts/users/${id}/send_password_reset_link/`);
      return response.data;
    },

    staffList: async (): Promise<User[]> => {
      const response = await apiClient.get("/accounts/users/staff_list/");
      return response.data;
    },

    technicians: async (): Promise<User[]> => {
      const response = await apiClient.get("/accounts/users/technicians/");
      return response.data;
    },

    serviceCoordinators: async (): Promise<User[]> => {
      const response = await apiClient.get("/accounts/users/service_coordinators/");
      return response.data;
    },
  },

  // Dashboard Stats
  dashboardStats: async (): Promise<AdminDashboardStats> => {
    const response = await apiClient.get("/accounts/admin/dashboard-stats/");
    return response.data;
  },

  // System Settings
  settings: {
    list: async (params?: {
      page?: number;
      category?: string;
      is_active?: boolean;
      search?: string;
    }): Promise<SystemSettingsListResponse> => {
      const response = await apiClient.get("/accounts/admin/settings/", { params });
      return response.data;
    },

    get: async (id: number): Promise<SystemSetting> => {
      const response = await apiClient.get(`/accounts/admin/settings/${id}/`);
      return response.data;
    },

    create: async (data: Partial<SystemSetting>): Promise<SystemSetting> => {
      const response = await apiClient.post("/accounts/admin/settings/", data);
      return response.data;
    },

    update: async (id: number, data: Partial<SystemSetting>): Promise<SystemSetting> => {
      const response = await apiClient.patch(`/accounts/admin/settings/${id}/`, data);
      return response.data;
    },

    delete: async (id: number): Promise<void> => {
      await apiClient.delete(`/accounts/admin/settings/${id}/`);
    },

    byCategory: async (category?: string): Promise<SystemSetting[]> => {
      const response = await apiClient.get("/accounts/admin/settings/by_category/", {
        params: category ? { category } : {},
      });
      return response.data;
    },
    publicBranding: async (): Promise<SystemSetting[]> => {
      // Public endpoint that doesn't require authentication
      const response = await apiClient.get("/accounts/admin/settings/public/branding/");
      return response.data;
    },
    publicFirebase: async (): Promise<{
      enabled: boolean;
      apiKey: string;
      projectId: string;
      messagingSenderId: string;
      appId: string;
    }> => {
      // Public endpoint that doesn't require authentication
      const response = await apiClient.get("/accounts/admin/settings/public/firebase/");
      return response.data;
    },
    publicIntegrations: async (): Promise<{
      google_analytics_id?: string;
      facebook_pixel_id?: string;
      recaptcha_enabled?: string;
      recaptcha_site_key?: string;
      firebase_api_key?: string;
      firebase_project_id?: string;
      firebase_messaging_sender_id?: string;
      firebase_app_id?: string;
    }> => {
      // Public endpoint that doesn't require authentication
      const response = await apiClient.get("/accounts/admin/settings/public/integrations/");
      return response.data;
    },

    bulkUpdate: async (settings: Array<{ id: number; value?: string; description?: string; is_active?: boolean }>): Promise<{ message: string; updated_ids: number[] }> => {
      const response = await apiClient.post("/accounts/admin/settings/bulk_update/", {
        settings,
      });
      return response.data;
    },

    uploadFile: async (settingId: number, file: File): Promise<{ message: string; file_path: string; file_url: string; setting: SystemSetting }> => {
      const formData = new FormData();
      formData.append('file', file);

      // Request interceptor will handle FormData Content-Type automatically
      const response = await apiClient.post(
        `/accounts/admin/settings/${settingId}/upload_file/`,
        formData
      );
      return response.data;
    },
  },

  // Audit Logs
  auditLogs: {
    list: async (params?: {
      page?: number;
      action?: string;
      model_name?: string;
      user?: number;
      search?: string;
      date_from?: string;
      date_to?: string;
    }): Promise<AuditLogListResponse> => {
      const response = await apiClient.get("/accounts/admin/audit-logs/", { params });
      return response.data;
    },

    get: async (id: number): Promise<AuditLog> => {
      const response = await apiClient.get(`/accounts/admin/audit-logs/${id}/`);
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

    archive: async (days: number): Promise<{
      message: string;
      archived_count: number;
      cutoff_date: string;
    }> => {
      const response = await apiClient.post("/accounts/admin/audit-logs/archive/", { days });
      return response.data;
    },

    download: async (params?: {
      format?: 'csv' | 'json';
      action?: string;
      model_name?: string;
      user?: number;
      search?: string;
      date_from?: string;
      date_to?: string;
    }): Promise<Blob> => {
      const format = params?.format || 'csv';
      // Map format to file_format for backend to avoid DRF content negotiation issues
      const { format: _, ...rest } = params || {};
      const queryParams = { ...rest, file_format: format };
      try {
        const response = await apiClient.get("/accounts/admin/audit-logs/download/", {
          params: queryParams,
          responseType: 'blob',
        });

        // Check if the response is actually an error (JSON error in blob format)
        if (response.data.type === 'application/json') {
          const text = await response.data.text();
          const errorData = JSON.parse(text);
          throw new Error(errorData.error || errorData.detail || 'Failed to download logs');
        }

        return response.data;
      } catch (error: any) {
        // If it's already an Error, rethrow it
        if (error instanceof Error) {
          throw error;
        }
        // If it's an axios error with blob response, try to parse it
        if (error.response?.data instanceof Blob && error.response.data.type === 'application/json') {
          const text = await error.response.data.text();
          const errorData = JSON.parse(text);
          throw new Error(errorData.error || errorData.detail || 'Failed to download logs');
        }
        // Otherwise, throw the original error
        throw error;
      }
    },
  },

  // System Backups
  backups: {
    list: async (params?: {
      page?: number;
      backup_type?: string;
      status?: string;
    }): Promise<SystemBackupListResponse> => {
      const response = await apiClient.get("/accounts/admin/backups/", { params });
      return response.data;
    },

    get: async (id: number): Promise<SystemBackup> => {
      const response = await apiClient.get(`/accounts/admin/backups/${id}/`);
      return response.data;
    },

    create: async (data: {
      backup_type: string;
      notes?: string;
    }): Promise<SystemBackup> => {
      const response = await apiClient.post("/accounts/admin/backups/", data);
      return response.data;
    },

    download: async (id: number): Promise<{ file_path: string; file_size: number; download_url: string }> => {
      const response = await apiClient.post(`/accounts/admin/backups/${id}/download/`);
      return response.data;
    },

    restore: async (id: number): Promise<{ message: string; backup_id: number }> => {
      const response = await apiClient.post(`/accounts/admin/backups/${id}/restore/`);
      return response.data;
    },

    delete: async (id: number): Promise<void> => {
      await apiClient.delete(`/accounts/admin/backups/${id}/`);
    },
  },
};

// Branches API (separate from admin)
export const branchesApi = {
  list: async (params?: {
    page?: number;
    is_active?: boolean;
  }): Promise<{ count: number; next: string | null; previous: string | null; results: Branch[] }> => {
    const response = await apiClient.get("/branches/", { params });
    return response.data;
  },

  get: async (id: number): Promise<Branch> => {
    const response = await apiClient.get(`/branches/${id}/`);
    return response.data;
  },

  create: async (data: BranchCreate): Promise<Branch> => {
    const response = await apiClient.post("/branches/", data);
    return response.data;
  },

  update: async (id: number, data: BranchUpdate): Promise<Branch> => {
    const response = await apiClient.patch(`/branches/${id}/`, data);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/branches/${id}/`);
  },

  accessible: async (): Promise<Branch[]> => {
    const response = await apiClient.get("/branches/accessible/");
    return response.data;
  },

  staff: async (id: number): Promise<User[]> => {
    const response = await apiClient.get(`/branches/${id}/staff/`);
    return response.data;
  },

  assignStaff: async (id: number, data: { user_id: number }): Promise<{ detail: string }> => {
    const response = await apiClient.post(`/branches/${id}/assign_staff/`, data);
    return response.data;
  },

  assignManager: async (id: number, data: { user_id: number }): Promise<{ detail: string }> => {
    const response = await apiClient.post(`/branches/${id}/assign_manager/`, data);
    return response.data;
  },
};

// Roles API
export const rolesApi = {
  list: async (params?: {
    is_active?: boolean;
    is_system?: boolean;
    search?: string;
  }): Promise<Role[]> => {
    const response = await apiClient.get("/accounts/admin/roles/", { params });
    return response.data.results || response.data;
  },

  get: async (id: number): Promise<Role> => {
    const response = await apiClient.get(`/accounts/admin/roles/${id}/`);
    return response.data;
  },

  create: async (data: RoleCreate): Promise<Role> => {
    const response = await apiClient.post("/accounts/admin/roles/", data);
    return response.data;
  },

  update: async (id: number, data: RoleUpdate): Promise<Role> => {
    const response = await apiClient.patch(`/accounts/admin/roles/${id}/`, data);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/accounts/admin/roles/${id}/`);
  },

  permissions: async (id: number): Promise<Permission[]> => {
    const response = await apiClient.get(`/accounts/admin/roles/${id}/permissions/`);
    return response.data;
  },

  assignPermissions: async (id: number, permissionIds: number[]): Promise<{ detail: string }> => {
    const response = await apiClient.post(`/accounts/admin/roles/${id}/assign_permissions/`, {
      permission_ids: permissionIds,
    });
    return response.data;
  },
};

// Permissions API
export const permissionsApi = {
  list: async (params?: {
    category?: string;
    is_active?: boolean;
    is_system?: boolean;
    search?: string;
  }): Promise<Permission[]> => {
    // Fetch all pages to avoid missing categories when pagination is applied
    let page = 1;
    const allPermissions: Permission[] = [];
    while (true) {
      const response = await apiClient.get("/accounts/admin/permissions/", {
        params: { ...params, page },
      });
      const data = response.data;

      if (data?.results) {
        allPermissions.push(...data.results);
        if (!data.next) break;
        page += 1;
        continue;
      }

      // Non-paginated response fallback
      if (Array.isArray(data)) {
        return data;
      }

      break;
    }

    return allPermissions;
  },

  get: async (id: number): Promise<Permission> => {
    const response = await apiClient.get(`/accounts/admin/permissions/${id}/`);
    return response.data;
  },
};

