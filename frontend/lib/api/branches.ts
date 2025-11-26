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
}

export interface BranchListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Branch[];
}

export const branchesApi = {
  list: async (params?: {
    page?: number;
    is_active?: boolean;
    is_headquarters?: boolean;
  }): Promise<BranchListResponse | Branch[]> => {
    const response = await apiClient.get("/branches/branches/", { params });
    return response.data;
  },

  get: async (id: number): Promise<Branch> => {
    const response = await apiClient.get(`/branches/branches/${id}/`);
    return response.data;
  },

  getDefault: async (): Promise<Branch | null> => {
    try {
      // Try to get headquarters branch first
      const response = await apiClient.get("/branches/branches/", {
        params: { is_headquarters: true, is_active: true },
      });
      const data = response.data;
      const branches = Array.isArray(data) ? data : data?.results || [];
      if (branches.length > 0) {
        return branches[0];
      }
      
      // If no headquarters, get first active branch
      const activeResponse = await apiClient.get("/branches/branches/", {
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

