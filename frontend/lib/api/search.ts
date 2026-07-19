import axios from "axios";
import { getAccessToken } from "@/lib/utils/token";

export interface SearchResult {
  type:
    | "customer"
    | "vehicle"
    | "workorder"
    | "appointment"
    | "invoice"
    | "estimate"
    | "payment"
    | "part";
  id: number;
  title: string;
  subtitle?: string;
  url: string;
  status?: string;

  metadata?: Record<string, any>;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
}

// Use the standard API base URL so requests route through /api/ prefix
// which the production proxy correctly routes to Django
const searchClient = axios.create({
  baseURL: typeof window !== "undefined" ? "/api" : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"),
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

searchClient.interceptors.request.use(
  (config) => {
    if (typeof window !== "undefined") {
      const token = getAccessToken();
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export const searchApi = {
  global: async (query: string, type?: string): Promise<SearchResponse> => {
    if (!query || query.trim().length < 2) {
      return {
        results: [],
        total: 0,
        query: query.trim(),
      };
    }

    const trimmedQuery = query.trim();

    try {
      // The endpoint is at /api/search/ (using standard API routing)
      const response = await searchClient.get("/search/", {
        params: {
          q: trimmedQuery,
          type: type || "all",
        },
      });

      // The API returns { results: [...] } directly
      const results = response.data?.results || [];

      return {

        results: results.map((r: any) => ({
          type: r.type,
          id: r.id,
          title: r.title,
          subtitle: r.subtitle,
          url: r.url?.startsWith('/') ? r.url : `/${r.url || ''}`,
          status: r.status,
          metadata: r.metadata,
        })),
        total: results.length,
        query: trimmedQuery,
      };

    } catch (error: any) {
      console.error("Search API error:", {
        query: trimmedQuery,
        type: type || "all",
        baseURL: searchClient.defaults.baseURL,
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
        url: error.config?.url,
        fullURL: error.config ? `${error.config.baseURL}${error.config.url}` : 'unknown',
      });
      throw error;
    }
  },
};

