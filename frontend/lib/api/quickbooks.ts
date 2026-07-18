import apiClient from "./client";

export type QboOutboundEntityType =
  | "customer"
  | "invoice"
  | "payment"
  | "supplier"
  | "purchase_order"
  | "branch"
  | "estimate"
  | "credit_note"
  | "vendor_bill"
  | "vendor_credit"
  | "bill_payment"
  | "vendor_expense"
  | "part"
  | "inventory_adjustment";

export interface QBOOutboundPendingCounts {
  failed_mappings: number;
  pending_mappings: number;
  eligible_failed: number;
  eligible_pending: number;
  eligible_total: number;
}

export interface QBOStatus {
  is_connected: boolean;
  api_ready?: boolean;
  connection_issue?: string | null;
  has_keys: boolean;
  realm_id: string | null;
  is_sandbox: boolean;
  last_sync: string | null;
  company_name: string | null;
  token_expires_at?: string | null;
  refresh_token_expires_at?: string | null;
  oauth_redirect_uri?: string | null;
  oauth_keys_environment?: "sandbox" | "production" | null;
  outbound_pending?: QBOOutboundPendingCounts;
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
   * Queues outbound sync for all eligible failed/pending QBO mappings.
   */
  syncOutboundBulk: async (params?: {
    include_failed?: boolean;
    include_pending?: boolean;
  }) => {
    const response = await apiClient.post("/quickbooks/sync-outbound/bulk/", {
      include_failed: params?.include_failed ?? true,
      include_pending: params?.include_pending ?? true,
    });
    return response.data as {
      status: string;
      queued: number;
      skipped_ineligible: number;
      message: string;
      counts: QBOOutboundPendingCounts;
    };
  },

  /**
   * Pushes a single SVR entity to QuickBooks Online.
   */
  syncOutbound: async (params: {
    entity_type: QboOutboundEntityType;
    object_id: number;
    inline?: boolean;
  }) => {
    const response = await apiClient.post("/quickbooks/sync-outbound/", params);
    return response.data;
  },

  /**
   * Clear a stale SVR ↔ QBO entity link before retrying outbound sync.
   */
  clearMapping: async (params: {
    entity_type: QboOutboundEntityType;
    object_id: number;
    delete?: boolean;
  }) => {
    const response = await apiClient.post("/quickbooks/mappings/clear/", params);
    return response.data as {
      detail: string;
      entity_type: string;
      object_id: number;
      deleted: boolean;
      qbo_sync_status?: string | null;
      qbo_sync_error?: string | null;
    };
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

  listMappings: async (params?: {
    status?: string;
    entity_type?: string;
    limit?: number;
  }) => {
    const response = await apiClient.get("/quickbooks/mappings/", { params });
    return response.data as {
      count: number;
      results: Array<{
        id: number;
        entity_type: string | null;
        entity_type_display: string;
        object_id: number;
        object_label: string;
        object_exists: boolean;
        qbo_id: string;
        status: string;
        status_display: string;
        error_message: string;
        last_synced_at: string;
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
  },

  refreshCompany: async () => {
    const response = await apiClient.post("/quickbooks/refresh-company/");
    return response.data as { company_name: string };
  },
};
