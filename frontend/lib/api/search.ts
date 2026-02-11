import axios from "axios";

export interface SearchResult {
  type: "customer" | "vehicle" | "workorder" | "appointment" | "invoice" | "part";
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

// Create a separate axios instance for search since it's not under /api/
// Extract base URL without /api suffix
const getBaseURL = () => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
  // Remove /api or /api/ from the end
  return apiUrl.replace(/\/api\/?$/, '') || "http://localhost:8000";
};

const searchClient = axios.create({
  baseURL: getBaseURL(),
  headers: {
    "Content-Type": "application/json",
  },
});

// Add auth token to search requests
searchClient.interceptors.request.use(
  (config) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("access_token");
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
      // The endpoint is at /mobile/api/search/ (not under /api/)
      const response = await searchClient.get("/mobile/api/search/", {
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

