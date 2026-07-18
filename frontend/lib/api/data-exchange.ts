import apiClient from "./client";

export type ImportBatchStatus =
  | "uploaded"
  | "previewing"
  | "previewed"
  | "committing"
  | "completed"
  | "failed"
  | "rolled_back";

export interface ImportModule {
  key: string;
  label: string;
  description: string;
  supported_extensions: string[];
  default_options: Record<string, unknown>;
  supports_export?: boolean;
}

export interface ExportModule {
  key: string;
  label: string;
  description: string;
}

export interface ImportIssue {
  row_number: number;
  level: "error" | "warning" | "info" | string;
  entity_type: string;
  action: string;
  identifier?: string;
  message: string;
  payload?: Record<string, unknown>;
}

export interface IssueBreakdownRow {
  level: string;
  code: string;
  message: string;
  count: number;
}

export interface ImportPreviewReport {
  format_detected?: string;
  summary?: Record<string, number | string>;
  error_count?: number;
  warning_count?: number;
  issue_breakdown?: IssueBreakdownRow[];
  issues?: ImportIssue[];
  issues_truncated?: number;
  sample_creates?: Record<string, unknown>[];
  options?: Record<string, unknown>;
  can_commit?: boolean;
}

export interface ImportBatch {
  id: number;
  uuid: string;
  module_key: string;
  status: ImportBatchStatus;
  original_filename: string;
  options: Record<string, unknown>;
  preview_report: ImportPreviewReport;
  summary: Record<string, number | string | Record<string, unknown>>;
  created_object_refs: Record<string, number[]>;
  error_message: string;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  previewed_at: string | null;
  committed_at: string | null;
  rolled_back_at: string | null;
  can_commit: boolean;
  can_rollback: boolean;
}

export interface ImportRowResult {
  id: number;
  row_number: number;
  entity_type: string;
  action: string;
  identifier: string;
  message: string;
  object_id: number | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export const dataExchangeApi = {
  modules: async () => {
    const response = await apiClient.get<{
      importers: ImportModule[];
      exporters: ExportModule[];
    }>("/data-exchange/modules/");
    return response.data;
  },

  listBatches: async (params?: {
    module_key?: string;
    status?: string;
    page?: number;
  }) => {
    const response = await apiClient.get<Paginated<ImportBatch>>("/data-exchange/batches/", {
      params,
    });
    return response.data;
  },

  getBatch: async (id: number) => {
    const response = await apiClient.get<ImportBatch>(`/data-exchange/batches/${id}/`);
    return response.data;
  },

  upload: async (moduleKey: string, file: File, options?: Record<string, unknown>) => {
    const formData = new FormData();
    formData.append("module_key", moduleKey);
    formData.append("file", file);
    if (options) {
      formData.append("options", JSON.stringify(options));
    }
    const response = await apiClient.post<ImportBatch>("/data-exchange/batches/", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120000,
    });
    return response.data;
  },

  preview: async (id: number) => {
    const response = await apiClient.post<ImportBatch>(
      `/data-exchange/batches/${id}/preview/`,
      {},
      { timeout: 120000 }
    );
    return response.data;
  },

  commit: async (id: number, force = false) => {
    const response = await apiClient.post<ImportBatch>(
      `/data-exchange/batches/${id}/commit/`,
      { force },
      { timeout: 600000 }
    );
    return response.data;
  },

  cancel: async (id: number) => {
    const response = await apiClient.post<ImportBatch>(
      `/data-exchange/batches/${id}/cancel/`,
      {},
      { timeout: 60000 }
    );
    return response.data;
  },

  rollback: async (id: number) => {
    const response = await apiClient.post<ImportBatch>(
      `/data-exchange/batches/${id}/rollback/`,
      {},
      { timeout: 300000 }
    );
    return response.data;
  },

  rows: async (
    id: number,
    params?: { action?: string; entity_type?: string; page?: number }
  ) => {
    const response = await apiClient.get<Paginated<ImportRowResult> | ImportRowResult[]>(
      `/data-exchange/batches/${id}/rows/`,
      { params }
    );
    return response.data;
  },

  exportModule: async (moduleKey: string) => {
    const response = await apiClient.get(`/data-exchange/export/${moduleKey}/`, {
      responseType: "blob",
      timeout: 300000,
    });
    return response;
  },

  downloadValidationReport: async (id: number) => {
    const response = await apiClient.get(`/data-exchange/batches/${id}/validation_report/`, {
      responseType: "blob",
      timeout: 300000,
    });
    return response;
  },

  deleteBatch: async (id: number) => {
    const response = await apiClient.delete<{ deleted: number }>(`/data-exchange/batches/${id}/`);
    return response.data;
  },

  clearHistory: async (options?: { include_completed?: boolean; statuses?: string[] }) => {
    const response = await apiClient.post<{
      deleted_count: number;
      deleted_ids: number[];
      include_completed: boolean;
    }>("/data-exchange/batches/clear_history/", options || {});
    return response.data;
  },

  wipePreview: async () => {
    const response = await apiClient.post<WipePreviewResult>("/data-exchange/wipe/", {
      dry_run: true,
    });
    return response.data;
  },

  wipeExecute: async (confirm: string, options?: { clear_import_batches?: boolean }) => {
    const response = await apiClient.post<WipeQueuedResult>("/data-exchange/wipe/", {
      dry_run: false,
      confirm,
      clear_import_batches: options?.clear_import_batches ?? true,
    }, { timeout: 60000 });
    return response.data;
  },

  wipeStatus: async () => {
    const response = await apiClient.get<WipeStatusResult>("/data-exchange/wipe/");
    return response.data;
  },
};

export interface WipePreviewResult {
  dry_run: true;
  confirm_phrase: string;
  counts: Record<string, number>;
  keeps: string[];
  deletes: string[];
  active_job?: WipeJob | null;
}

export interface WipeQueuedResult {
  dry_run: false;
  async?: boolean;
  job_id: string;
  status: string;
  confirm_phrase: string;
  before: Record<string, number>;
  message: string;
  ok?: boolean;
  deleted?: Record<string, number>;
  after?: Record<string, number>;
}

export interface WipeJob {
  job_id: string;
  status: "running" | "completed" | "completed_with_leftovers" | "failed" | string;
  started_at?: string | null;
  finished_at?: string | null;
  error?: string;
  before?: Record<string, number>;
  deleted?: Record<string, number>;
  after?: Record<string, number>;
  ok?: boolean;
  progress?: string;
}

export interface WipeStatusResult {
  status: string;
  job: WipeJob | null;
}
