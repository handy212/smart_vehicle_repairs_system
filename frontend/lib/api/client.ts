import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { useBranchStore } from "@/store/branchStore";

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor for auth token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== "undefined") {
      // If sending FormData, remove Content-Type header to let browser set it with boundary
      if (config.data instanceof FormData && config.headers) {
        delete config.headers['Content-Type'];
      }
      
      const token = localStorage.getItem("access_token");
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      const branchId =
        useBranchStore.getState().activeBranchId ??
        (() => {
          try {
            const data = localStorage.getItem("branch-storage");
            if (data) {
              const parsed = JSON.parse(data);
              return parsed?.state?.activeBranchId ?? null;
            }
          } catch {
            return null;
          }
          return null;
        })();
      if (branchId && config.headers) {
        config.headers["X-Branch-ID"] = branchId.toString();
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (typeof window !== "undefined") {
        const refreshToken = localStorage.getItem("refresh_token");
        if (refreshToken) {
          try {
            const response = await axios.post(
              `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"}/auth/token/refresh/`,
              {
                refresh: refreshToken,
              }
            );

            const { access } = response.data;
            localStorage.setItem("access_token", access);

            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${access}`;
            }

            return apiClient(originalRequest);
          } catch (refreshError) {
            // Refresh failed, redirect to login
            localStorage.removeItem("access_token");
            localStorage.removeItem("refresh_token");
            if (typeof window !== "undefined") {
              window.location.href = "/login";
            }
            return Promise.reject(refreshError);
          }
        } else {
          // No refresh token, redirect to login
          if (typeof window !== "undefined") {
            window.location.href = "/login";
          }
        }
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;

