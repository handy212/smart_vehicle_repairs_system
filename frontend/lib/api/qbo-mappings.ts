import apiClient from "./client";

export interface QboAccountOption {
  id: string;
  name: string;
  account_number: string;
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

export interface QboTaxCodeOption {
  id: string;
  name: string;
  active: boolean;
  description: string;
  mapped_row?: {
    mapping_kind: string;
    mapping_key: string;
  } | null;
}

export interface QboClassOption {
  id: string;
  name: string;
  active: boolean;
  parent_name?: string;
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
  uses_tax_code?: boolean;
  uses_class?: boolean;
  control_field?: string | null;
  svr_account?: { id: number; code: string; name: string } | null;
  qbo_account_id: string;
  qbo_account_name: string;
  qbo_account_number: string;
  qbo_item_id: string;
  qbo_item_name: string;
  qbo_class_id: string;
  qbo_class_name: string;
  status: string;
  error_message: string;
  qbo_account_hint?: string;
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

  listTaxCodes: async (): Promise<{ tax_codes: QboTaxCodeOption[]; is_connected: boolean }> => {
    const response = await apiClient.get("/quickbooks/tax-codes/");
    return response.data;
  },

  listClasses: async (): Promise<{ classes: QboClassOption[]; is_connected: boolean }> => {
    const response = await apiClient.get("/quickbooks/classes/");
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
      qbo_class_id?: string;
      action?: "clear";
    }>,
  ): Promise<QboMappingsOverview & { updated: number; errors: Array<{ detail: string }> }> => {
    const response = await apiClient.patch("/quickbooks/account-mappings/", { mappings });
    return response.data;
  },

  saveMapping: async (
    mappingKind: string,
    mappingKey: string,
    payload: { qbo_account_id?: string; qbo_item_id?: string; qbo_class_id?: string; action?: "clear" },
  ) => {
    const response = await apiClient.post(
      `/quickbooks/account-mappings/${mappingKind}/${mappingKey}/`,
      payload,
    );
    return response.data;
  },

  applyOwnerTemplate: async (payload?: {
    dry_run?: boolean;
    overwrite?: boolean;
    wire_svr?: boolean;
  }): Promise<QboMappingsOverview & Record<string, unknown>> => {
    const response = await apiClient.post("/quickbooks/account-mappings/apply-owner-template/", payload ?? {});
    return response.data;
  },

  getSetupStatus: async (): Promise<QboSetupStatus> => {
    const response = await apiClient.get("/quickbooks/setup-status/");
    return response.data;
  },
};

export interface QboSetupStep {
  id: string;
  label: string;
  href?: string;
  done: boolean;
}

export interface QboSetupStatus {
  is_connected: boolean;
  is_api_ready: boolean;
  company_mappings: { mapped: number; total: number };
  branches: {
    active_count: number;
    unmapped_locations: number;
    override_slots_per_branch: number;
    override_mapped?: number;
    override_inherit?: number;
    override_unmapped?: number;
    note?: string;
    items: Array<{
      id: number;
      name: string;
      code: string;
      location_mapped: boolean;
      override_slots?: number;
      override_mapped?: number;
      override_inherit?: number;
      override_unmapped?: number;
      override_count: number;
    }>;
  };
  next_steps: QboSetupStep[];
}
