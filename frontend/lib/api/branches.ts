import apiClient from "./client";

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
}

export interface BranchListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Branch[];
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
  }): Promise<BranchListResponse | Branch[]> => {
    const response = await apiClient.get("/branches/", { params });
    return response.data;
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

  getStats: async (id: number): Promise<BranchStats> => {
    const response = await apiClient.get(`/branches/${id}/stats/`);
    return response.data;
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
getStaff: async (id: number): Promise<any[]> => {
  const response = await apiClient.get(`/branches/${id}/staff/`);
  return response.data;
},

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
getManagers: async (id: number): Promise<any[]> => {
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

          getDefault: async (): Promise<Branch | null> => {
            try {
              // Try to get headquarters branch first
              const response = await apiClient.get("/branches/", {
                params: { is_headquarters: true, is_active: true },
              });
              const data = response.data;
              const branches = Array.isArray(data) ? data : data?.results || [];
              if (branches.length > 0) {
                return branches[0];
              }

              // If no headquarters, get first active branch
              const activeResponse = await apiClient.get("/branches/", {
                params: { is_active: true },
              });
              const activeData = activeResponse.data;
              const activeBranches = Array.isArray(activeData) ? activeData : activeData?.results || [];
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

