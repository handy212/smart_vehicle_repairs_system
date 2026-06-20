import apiClient from "./client";

export interface QboAccountOption {
  id: string;
  name: string;
  account_type: string;
  account_sub_type: string;
  active: boolean;
  mapped_row?: {
    mapping_kind: string;
    mapping_key: string;
    label: string;
  } | null;
}

export interface QboItemOption {
  id: string;
  name: string;
  type: string;
  active: boolean;
  income_account_name: string;
  mapped_row?: {
    mapping_kind: string;
    mapping_key: string;
  } | null;
}

export interface QboMappingRow {
  mapping_kind: string;
  mapping_key: string;
  label: string;
  group: string;
  uses_item: boolean;
  control_field?: string | null;
  svr_account?: { id: number; code: string; name: string } | null;
  qbo_account_id: string;
  qbo_account_name: string;
  qbo_item_id: string;
  qbo_item_name: string;
  status: string;
  error_message: string;
}

export interface QboMappingGroup {
  group: string;
  rows: QboMappingRow[];
}

export interface QboMappingsOverview {
  is_connected: boolean;
  groups: QboMappingGroup[];
  rows: QboMappingRow[];
}

export const qboMappingsApi = {
  listAccounts: async (): Promise<{ accounts: QboAccountOption[]; is_connected: boolean }> => {
    const response = await apiClient.get("/quickbooks/accounts/");
    return response.data;
  },

  listItems: async (): Promise<{ items: QboItemOption[]; is_connected: boolean }> => {
    const response = await apiClient.get("/quickbooks/items/");
    return response.data;
  },

  getOverview: async (): Promise<QboMappingsOverview> => {
    const response = await apiClient.get("/quickbooks/account-mappings/");
    return response.data;
  },

  saveMappings: async (
    mappings: Array<{
      mapping_kind: string;
      mapping_key: string;
      qbo_account_id?: string;
      qbo_item_id?: string;
      action?: "clear";
    }>,
  ): Promise<QboMappingsOverview & { updated: number; errors: Array<{ detail: string }> }> => {
    const response = await apiClient.patch("/quickbooks/account-mappings/", { mappings });
    return response.data;
  },

  saveMapping: async (
    mappingKind: string,
    mappingKey: string,
    payload: { qbo_account_id?: string; qbo_item_id?: string; action?: "clear" },
  ) => {
    const response = await apiClient.post(
      `/quickbooks/account-mappings/${mappingKind}/${mappingKey}/`,
      payload,
    );
    return response.data;
  },
};
