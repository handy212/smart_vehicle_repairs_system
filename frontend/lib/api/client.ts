import axios, { AxiosRequestConfig, InternalAxiosRequestConfig, AxiosError } from "axios";
import { useBranchStore } from "@/store/branchStore";
import { queueRequest } from "@/lib/offline/queue";
import { getApiBaseUrl } from "@/lib/api/base-url";
import { refreshAccessToken } from "@/lib/auth/refresh-access-token";
import { getAccessToken, clearTokens } from "@/lib/utils/token";
import { authApi } from "@/lib/api/auth";
import { getUserFacingError } from "@/lib/api/errors";

export type ApiRequestConfig = AxiosRequestConfig & {
  skipAuth?: boolean;
  skipAuthRefresh?: boolean;
  _retry?: boolean;
};

type InternalApiRequestConfig = InternalAxiosRequestConfig & ApiRequestConfig;

type OfflineQueuedError = Error & {
  isOffline: true;
  queued: true;
  config: InternalAxiosRequestConfig;
  response?: {
    status: number;
    data: {
      message: string;
      queued: boolean;
    };
  };
};

type FailedQueueItem = {
  resolve: (ok: boolean) => void;
  reject: (error: unknown) => void;
};

const isOfflineQueuedError = (error: unknown): error is OfflineQueuedError => {
  return (
    typeof error === "object" &&
    error !== null &&
    "isOffline" in error &&
    "queued" in error &&
    error.isOffline === true &&
    error.queued === true
  );
};

const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

// Request interceptor for auth token and offline handling
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const apiConfig = config as InternalApiRequestConfig;
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

        } as OfflineQueuedError);
      }

      // If sending FormData, remove Content-Type header to let browser set it with boundary
      if (config.data instanceof FormData && config.headers) {
        // Axios v1.x uses AxiosHeaders which requires .delete()
        // But we check for method existence to be safe

        if (typeof config.headers.delete === 'function') {

          config.headers.delete('Content-Type');
        } else {
          delete config.headers['Content-Type'];
        }
      }

      const token = apiConfig.skipAuth ? null : getAccessToken();
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
      if (
        typeof window !== "undefined" &&
        window.location.pathname.startsWith("/mobile") &&
        config.headers
      ) {
        config.headers["X-Tech-App"] = "1";
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

let failedQueue: FailedQueueItem[] = [];


const processQueue = (error: unknown, ok = false) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(ok);
    }
  });

  failedQueue = [];
};

// Response interceptor for token refresh and offline handling
apiClient.interceptors.response.use(
  (response) => response,

  async (error: unknown) => {
    // Handle offline queued requests
    if (isOfflineQueuedError(error)) {
      return Promise.reject({
        ...error,
        response: {
          status: 202,
          data: { message: "Request queued for offline sync", queued: true },
        },
      });
    }

    if (!axios.isAxiosError(error)) {
      return Promise.reject(error);
    }

    const responseData = error.response?.data as { maintenance_mode?: boolean; detail?: string } | undefined;
    if (error.response?.status === 503 && responseData?.maintenance_mode) {
      if (typeof window !== "undefined") {
        sessionStorage.setItem(
          "maintenance_message",
          responseData.detail || "System is under maintenance. Please check back later."
        );
        if (window.location.pathname !== "/maintenance") {
          window.location.href = "/maintenance";
        }
      }
      return Promise.reject(error);
    }

    const originalRequest = error.config as InternalApiRequestConfig | undefined;

    // Skip token refresh for auth endpoints (login, register) —
    // a 401 there means bad credentials, not an expired token.
    const isAuthEndpoint = originalRequest?.url?.includes('/auth/token');

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint && !originalRequest.skipAuthRefresh) {
      if (isRefreshing) {
        return new Promise<boolean>(function (resolve, reject) {
          failedQueue.push({ resolve, reject });
        })
          .then((ok) => {
            if (!ok) {
              return Promise.reject(new Error("Session expired"));
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
        try {
          const refreshed = await refreshAccessToken();
          if (!refreshed) {
            const refreshError = new Error("Session expired");
            processQueue(refreshError, false);
            clearTokens();
            if (window.location.pathname !== "/login") {
              window.location.href = "/login";
            }
            return Promise.reject(refreshError);
          }

          processQueue(null, true);

          return apiClient(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError, false);
          clearTokens();
          if (window.location.pathname !== "/login") {
            window.location.href = "/login";
          }
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }
    }

    // Handle 403 Forbidden — user's token is valid but lacks permissions
    if (error.response?.status === 403) {
      console.warn(
        `[API] 403 Forbidden: ${error.config?.method?.toUpperCase()} ${error.config?.url}`,
      );
    }

    const axiosError = error as AxiosError & { userMessage?: string };
    axiosError.userMessage = getUserFacingError(error);

    return Promise.reject(axiosError);
  }
);

export default apiClient;
