import apiClient from "./client";

export interface LoginCredentials {
  email: string;
  password: string;
  recaptcha_token?: string;
}

export interface AuthResponse {
  access?: string;
  refresh?: string;
  requires_2fa?: boolean;
  user_id?: number;
  temp_token?: string;
  user?: User;
}

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  phone?: string;
  profile_picture?: string;
  date_of_birth?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
  employee_id?: string;
  hire_date?: string;
  branch_name?: string;
  permissions?: string[];
  customer_profile?: {
    id: number;
  };
  customer?: {
    id: number;
  };
}

export interface UpdateProfileData {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  date_of_birth?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
}

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const response = await apiClient.post("/auth/token/", credentials);
    return response.data;
  },

  verify2FALogin: async (tempToken: string, code: string): Promise<AuthResponse> => {
    const response = await apiClient.post("/auth/2fa/verify_login/", {
      temp_token: tempToken,
      code,
    });
    return response.data;
  },

  setup2FA: async (): Promise<{ secret: string; qr_code: string }> => {
    const response = await apiClient.post("/auth/2fa/setup/");
    return response.data;
  },

  verify2FASetup: async (code: string): Promise<{ detail: string; user: User }> => {
    const response = await apiClient.post("/auth/2fa/verify_setup/", { code });
    return response.data;
  },

  disable2FA: async (password: string): Promise<{ detail: string; user: User }> => {
    const response = await apiClient.post("/auth/2fa/disable/", { password });
    return response.data;
  },

  refreshToken: async (refresh: string): Promise<{ access: string }> => {
    const response = await apiClient.post("/auth/token/refresh/", { refresh });
    return response.data;
  },

  forgotPassword: async (email: string, recaptcha_token?: string): Promise<{ detail: string }> => {
    const response = await apiClient.post("/auth/users/forgot_password/", {
      email,
      recaptcha_token
    });
    return response.data;
  },


  confirmResetPassword: async (data: any): Promise<{ detail: string }> => {
    const response = await apiClient.post("/auth/users/confirm_reset_password/", data);
    return response.data;
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await apiClient.get("/auth/users/me/");
    return response.data;
  },

  getPermissions: async (): Promise<string[]> => {
    const response = await apiClient.get("/auth/users/permissions/");
    return response.data.permissions || [];
  },

  updateProfile: async (data: UpdateProfileData): Promise<User> => {
    const response = await apiClient.patch("/auth/users/me/", data);
    return response.data;
  },

  register: {

    initiate: async (data: any): Promise<any> => {
      const response = await apiClient.post("/auth/register/initiate/", data);
      return response.data;
    },

    verify: async (data: any): Promise<any> => {
      const response = await apiClient.post("/auth/register/verify/", data);
      return response.data;
    }
  },

  logout: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
    }
  },
};

