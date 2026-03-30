import apiClient from "./client";

export interface QBOStatus {
  is_connected: boolean;
  has_keys: boolean;
  realm_id: string | null;
  is_sandbox: boolean;
  last_sync: string | null;
  company_name: string | null;
  error?: string;
}

export const quickbooksApi = {
  /**
   * Returns current QBO connection status
   */
  getStatus: async (): Promise<QBOStatus> => {
    const response = await apiClient.get("/quickbooks/status/");
    return response.data;
  },

  /**
   * Manually triggers a full inbound sync (QBO -> local)
   */
  syncInbound: async () => {
    const response = await apiClient.post("/quickbooks/sync-inbound/");
    return response.data;
  },

  /**
   * Triggers an outbound sync for a specific object
   * (This hitting a generic endpoint if we had one, but currently outbound is signal-based.
   * However, we can use it to hit the connect/disconnect endpoints if needed.)
   */
  connect: () => {
    const configuredBaseUrl = apiClient.defaults.baseURL || "http://localhost:8001/api";
    const normalizedBaseUrl = configuredBaseUrl.replace(/\/$/, "");
    const connectUrl = new URL(`${normalizedBaseUrl}/quickbooks/connect/`);

    // When the app is opened on localhost, keep the OAuth bootstrap on localhost too
    // so the browser sends the non-httpOnly auth cookie to Django.
    if (typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname)) {
      connectUrl.hostname = window.location.hostname;
    }

    window.location.href = connectUrl.toString();
  },

  disconnect: async () => {
    const response = await apiClient.post("/quickbooks/disconnect/");
    return response.data;
  }
};
