import apiClient from "./client";

export const quickbooksApi = {
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
    window.location.href = `${apiClient.defaults.baseURL}/quickbooks/connect/`;
  },

  disconnect: async () => {
    const response = await apiClient.post("/quickbooks/disconnect/");
    return response.data;
  }
};
