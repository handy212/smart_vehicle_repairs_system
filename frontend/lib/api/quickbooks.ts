import apiClient from "./client";

export interface QBOStatus {
  is_connected: boolean;
  has_keys: boolean;
  realm_id: string | null;
  is_sandbox: boolean;
  last_sync: string | null;
  company_name: string | null;
  oauth_redirect_uri?: string | null;
  oauth_keys_environment?: "sandbox" | "production" | null;
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
   * Pushes a single SVR entity to QuickBooks Online.
   */
  syncOutbound: async (params: {
    entity_type:
      | "customer"
      | "invoice"
      | "payment"
      | "supplier"
      | "purchase_order"
      | "branch"
      | "estimate"
      | "credit_note"
      | "vendor_bill"
      | "vendor_credit";
    object_id: number;
    inline?: boolean;
  }) => {
    const response = await apiClient.post("/quickbooks/sync-outbound/", params);
    return response.data;
  },

  listSyncLogs: async (params?: {
    entity_type?: string;
    direction?: string;
    status?: string;
    limit?: number;
  }) => {
    const response = await apiClient.get("/quickbooks/sync-logs/", { params });
    return response.data as {
      count: number;
      results: Array<{
        id: number;
        entity_type: string;
        entity_type_display: string;
        direction: string;
        direction_display: string;
        started_at: string;
        finished_at: string | null;
        duration_seconds: number | null;
        records_pulled: number;
        records_created: number;
        records_updated: number;
        records_skipped: number;
        status: string;
        status_display: string;
        error_message: string;
        triggered_by_name: string | null;
      }>;
    };
  },

  /**
   * Triggers an outbound sync for a specific object
   * (This hitting a generic endpoint if we had one, but currently outbound is signal-based.
   * However, we can use it to hit the connect/disconnect endpoints if needed.)
   */
  connect: () => {
    if (typeof window === "undefined") return;

    const connectUrl = new URL("/api/quickbooks/connect/", window.location.origin);
    connectUrl.searchParams.set("redirect_base", window.location.origin);
    window.location.href = connectUrl.toString();
  },

  disconnect: async () => {
    const response = await apiClient.post("/quickbooks/disconnect/");
    return response.data;
  }
};
