import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { useBranchStore } from "@/store/branchStore";
import { queueRequest } from "@/lib/offline/queue";

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor for auth token and offline handling
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    if (typeof window !== "undefined") {
      // Check if offline
      const isOnline = navigator.onLine;
      const method = (config.method || "get").toUpperCase();

      // For write operations (POST, PATCH, PUT, DELETE), queue if offline
      if (!isOnline && ["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
        const action = method === "DELETE" ? "delete" : method === "POST" ? "create" : "update";
        const endpoint = config.url || "";

        // Queue the request
        await queueRequest(action, endpoint, method, config.data);

        // Return a mock response that indicates the request was queued
        return Promise.reject({
          isOffline: true,
          queued: true,
          message: "Request queued for offline sync",
          config,
        } as any);
      }

      // If sending FormData, remove Content-Type header to let browser set it with boundary
      if (config.data instanceof FormData && config.headers) {
        // Axios v1.x uses AxiosHeaders which requires .delete()
        // But we check for method existence to be safe
        if (typeof (config.headers as any).delete === 'function') {
          (config.headers as any).delete('Content-Type');
        } else {
          delete config.headers['Content-Type'];
        }
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

// Flag to track if token refresh is in progress
let isRefreshing = false;
// Queue of failed requests waiting for token refresh
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });

  failedQueue = [];
};

// Response interceptor for token refresh and offline handling
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError | any) => {
    // Handle offline queued requests
    if (error?.isOffline && error?.queued) {
      return Promise.reject({
        ...error,
        response: {
          status: 202,
          data: { message: "Request queued for offline sync", queued: true },
        },
      });
    }
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise(function (resolve, reject) {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return apiClient(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

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

            // Process queue with new token
            processQueue(null, access);

            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${access}`;
            }

            return apiClient(originalRequest);
          } catch (refreshError) {
            // Process queue with error
            processQueue(refreshError, null);

            // Refresh failed, redirect to login
            localStorage.removeItem("access_token");
            localStorage.removeItem("refresh_token");
            if (typeof window !== "undefined") {
              window.location.href = "/login";
            }
            return Promise.reject(refreshError);
          } finally {
            isRefreshing = false;
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

