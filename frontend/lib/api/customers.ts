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
    gender?: "male" | "female" | "other" | "prefer_not_to_say";
    date_of_birth?: string;
    is_active?: boolean;
  };
  company_name?: string;
  customer_type: string;
  business_type?: string;
  tax_id?: string;
  vat_number?: string;
  currency?: string;
  default_language?: string;
  payment_terms: string;
  billing_address?: string;
  shipping_address?: string;
  current_balance: string;
  available_credit?: string;
  loyalty_points?: number;
  alternative_phone?: string;
  occupation?: string;
  contact_person_name?: string;
  company_email?: string;
  company_phone?: string;
  service_address?: string;
  service_city?: string;
  service_state?: string;
  service_zip_code?: string;
  default_payment_method?: string;
  customer_since: string;
  created_at: string;
  updated_at: string;
  status: string;
  last_visit_date?: string | null;
  days_since_last_visit?: number | null;
  is_inactive?: boolean | null;
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
    page_size?: number;
    inactive_period?: '3_months' | '6_months' | '1_year' | '2_years' | string; // string for custom_XXX
  }): Promise<CustomerListResponse> => {
    const response = await apiClient.get("/customers/customers/", { params });
    return response.data;
  },

  dashboardStats: async (): Promise<{
    total_customers: number;
    active_customers: number;
    inactive_customers: number;
    active_contacts: number;
    inactive_contacts: number;
  }> => {
    const response = await apiClient.get("/customers/customers/dashboard_stats/");
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
      const response = await apiClient.get(`/customers/customer-notes/`, {
        params: { customer: id }
      });
      return response.data.results || response.data;
    },

    create: async (customerId: number, data: { customer?: number; content: string; note_type: string; is_important?: boolean; }): Promise<any> => {
      const response = await apiClient.post(`/customers/customer-notes/`, {
        ...data,
        customer: customerId
      });
      return response.data;
    },
    update: async (customerId: number, noteId: number, data: {
      content: string;
      note_type: string;
      is_important?: boolean;

    }): Promise<any> => {
      const response = await apiClient.patch(`/customers/customer-notes/${noteId}/`, data);
      return response.data;
    },
    delete: async (customerId: number, noteId: number): Promise<void> => {
      await apiClient.delete(`/customers/customer-notes/${noteId}/`);
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

  checkEmail: async (email: string, customerId?: number): Promise<{
    success: boolean;
    exists?: boolean;
    user_id?: number;
    customer_id?: number;
    customer?: Customer;
    user?: {
      id: number;
      email: string;
      first_name: string;
      last_name: string;
      role: string;
    };
    message?: string;
    error?: string;
  }> => {
    const response = await apiClient.post("/customers/customers/check_email/", {
      email: email,
      customer_id: customerId
    });
    return response.data;
  },
  contacts: {

    list: async (customerId: number): Promise<any[]> => {
      const response = await apiClient.get("/customers/customer-contacts/", {
        params: { customer: customerId }
      });
      return response.data.results || response.data;
    },

    create: async (data: any): Promise<any> => {
      const response = await apiClient.post("/customers/customer-contacts/", data);
      return response.data;
    },

    update: async (id: number, data: any): Promise<any> => {
      const response = await apiClient.put(`/customers/customer-contacts/${id}/`, data);
      return response.data;
    },
    delete: async (id: number): Promise<void> => {
      await apiClient.delete(`/customers/customer-contacts/${id}/`);
    },
  },

  reminders: {

    list: async (customerId: number): Promise<any[]> => {
      const response = await apiClient.get("/customers/customer-reminders/", {
        params: { customer: customerId }
      });
      return response.data.results || response.data;
    },

    create: async (data: any): Promise<any> => {
      const response = await apiClient.post("/customers/customer-reminders/", data);
      return response.data;
    },

    update: async (id: number, data: any): Promise<any> => {
      const response = await apiClient.put(`/customers/customer-reminders/${id}/`, data);
      return response.data;
    },
    delete: async (id: number): Promise<void> => {
      await apiClient.delete(`/customers/customer-reminders/${id}/`);
    },
  },
  documents: {

    list: async (customerId: number): Promise<any[]> => {
      const response = await apiClient.get("/customers/customer-documents/", {
        params: { customer: customerId }
      });
      return response.data.results || response.data;
    },

    create: async (data: FormData): Promise<any> => {
      const response = await apiClient.post("/customers/customer-documents/", data, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      return response.data;
    },
    delete: async (id: number): Promise<void> => {
      await apiClient.delete(`/customers/customer-documents/${id}/`);
    },
  },
  contracts: {

    list: async (customerId: number): Promise<any[]> => {
      const response = await apiClient.get("/customers/customer-contracts/", {
        params: { customer: customerId }
      });
      return response.data.results || response.data;
    },

    create: async (data: any): Promise<any> => {
      const response = await apiClient.post("/customers/customer-contracts/", data);
      return response.data;
    },
    delete: async (id: number): Promise<void> => {
      await apiClient.delete(`/customers/customer-contracts/${id}/`);
    },
  },
};

