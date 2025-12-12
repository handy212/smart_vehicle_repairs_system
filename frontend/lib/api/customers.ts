import apiClient from "./client";

export interface Customer {
  id: number;
  customer_number: string;
  full_name?: string;
  email?: string;
  phone?: string;
  user?: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    address?: string;
    is_active?: boolean;
  };
  company_name?: string;
  customer_type: string;
  business_type?: string;
  tax_id?: string;
  status: string;
  payment_terms: string;
  current_balance: string;
  loyalty_points?: number;
  customer_since: string;
  created_at: string;
}

export interface CustomerListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Customer[];
}

export const customersApi = {
  list: async (params?: {
    page?: number;
    search?: string;
    status?: string;
    customer_type?: string;
    date_from?: string;
    date_to?: string;
    created_at__gte?: string;
    created_at__lte?: string;
    loyalty_tier?: string;
    ordering?: string;
  }): Promise<CustomerListResponse> => {
    const response = await apiClient.get("/customers/customers/", { params });
    return response.data;
  },

  get: async (id: number): Promise<Customer> => {
    const response = await apiClient.get(`/customers/customers/${id}/`);
    return response.data;
  },

  create: async (data: Partial<Customer>): Promise<Customer> => {
    const response = await apiClient.post("/customers/customers/", data);
    return response.data;
  },

  update: async (id: number, data: Partial<Customer>): Promise<Customer> => {
    const response = await apiClient.put(`/customers/customers/${id}/`, data);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/customers/customers/${id}/`);
  },

  import: async (file: File): Promise<{ imported: number; skipped: number; errors?: string[] }> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await apiClient.post("/customers/customers/import_csv/", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  },

  vehicles: async (id: number): Promise<any[]> => {
    const response = await apiClient.get(`/customers/customers/${id}/vehicles/`);
    return response.data;
  },

  history: async (id: number): Promise<any> => {
    const response = await apiClient.get(`/customers/customers/${id}/history/`);
    return response.data;
  },

  stats: async (id: number): Promise<{
    total_spent: number;
    total_visits: number;
    last_visit_date: string | null;
    average_invoice: number;
    vehicles_serviced: number;
  }> => {
    const response = await apiClient.get(`/customers/customers/${id}/stats/`);
    return response.data;
  },

  notes: {
    list: async (id: number): Promise<any[]> => {
      const response = await apiClient.get(`/customers/customers/${id}/notes/`);
      return response.data;
    },
    create: async (id: number, data: {
      note: string;
      note_type: string;
      is_important?: boolean;
    }): Promise<any> => {
      const response = await apiClient.post(`/customers/customers/${id}/add_note/`, data);
      return response.data;
    },
  },

  resetPassword: async (id: number, newPassword: string, sendEmail: boolean = false): Promise<{ detail: string; email_sent: boolean }> => {
    const response = await apiClient.post(`/customers/customers/${id}/reset_password/`, {
      new_password: newPassword,
      send_email: sendEmail,
    });
    return response.data;
  },

  sendPasswordResetLink: async (id: number): Promise<{ detail: string }> => {
    const response = await apiClient.post(`/customers/customers/${id}/send_password_reset_link/`);
    return response.data;
  },

  grantPortalAccess: async (id: number, password?: string, sendEmail: boolean = false): Promise<{ detail: string; email_sent: boolean; password?: string }> => {
    const response = await apiClient.post(`/customers/customers/${id}/grant_portal_access/`, {
      password,
      send_email: sendEmail,
    });
    return response.data;
  },

  revokePortalAccess: async (id: number): Promise<{ detail: string }> => {
    const response = await apiClient.post(`/customers/customers/${id}/revoke_portal_access/`);
    return response.data;
  },
};

