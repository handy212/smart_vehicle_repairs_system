import apiClient from "./client";

export interface WorkflowDefinition {
  id: number;
  name: string;
  code: string;
  description?: string;
  model_path: string;
  version: number;
  is_active: boolean;
  is_default: boolean;
  states_count?: number;
  transitions_count?: number;
  states?: WorkflowState[];
  transitions?: WorkflowTransition[];
  created_at: string;
  updated_at: string;
}

export interface WorkflowState {
  id: number;
  workflow: number;
  key: string;
  label: string;
  description?: string;
  color?: string;
  icon?: string;
  order: number;
  is_initial: boolean;
  is_terminal: boolean;
  is_active: boolean;
  metadata?: Record<string, unknown>;
}

export interface WorkflowTransition {
  id: number;
  workflow: number;
  from_state: number;
  from_state_key?: string;
  from_state_label?: string;
  to_state: number;
  to_state_key?: string;
  to_state_label?: string;
  label: string;
  button_label?: string;
  description?: string;
  order: number;
  allowed_roles: string[];
  required_permission?: string;
  is_active: boolean;
  guards?: WorkflowGuard[];
  actions?: WorkflowAction[];
}

export interface WorkflowGuard {
  id: number;
  transition: number;
  guard_type: "required_field" | "required_relation" | "min_count" | "custom";
  guard_type_display?: string;
  field_path?: string;
  expected_value?: unknown;
  message: string;
  config?: Record<string, unknown>;
  order: number;
  is_active: boolean;
}

export interface WorkflowAction {
  id: number;
  transition: number;
  action_type:
    | "create_note"
    | "create_task"
    | "send_notification"
    | "approve_recommendations"
    | "convert_recommendations"
    | "reserve_parts"
    | "custom";
  action_type_display?: string;
  timing: "before" | "after";
  timing_display?: string;
  label: string;
  config?: Record<string, unknown>;
  order: number;
  is_active: boolean;
}

export interface WorkflowRegistryItem {
  model_path: string;
  label: string;
  status_field: string;
  seed: string;
}

export interface WorkflowInstance {
  id: number;
  workflow: number;
  workflow_name: string;
  current_state: number;
  current_state_key: string;
  current_state_label: string;
  object_id: number;
  status_field: string;
  is_active: boolean;
  started_at: string;
  completed_at?: string | null;
  updated_at: string;
}

export interface WorkflowTransitionLog {
  id: number;
  instance: number;
  transition?: number | null;
  transition_label?: string | null;
  from_state: string;
  to_state: string;
  result: "success" | "blocked" | "failed";
  message?: string;
  actor_name?: string | null;
  created_at: string;
}

export interface PaginatedWorkflows {
  count: number;
  next: string | null;
  previous: string | null;
  results: WorkflowDefinition[];
}

export interface PaginatedWorkflowInstances {
  count: number;
  next: string | null;
  previous: string | null;
  results: WorkflowInstance[];
}

export interface PaginatedWorkflowLogs {
  count: number;
  next: string | null;
  previous: string | null;
  results: WorkflowTransitionLog[];
}

export const workflowsApi = {
  list: async (params?: { model_path?: string; is_active?: boolean }): Promise<PaginatedWorkflows> => {
    const response = await apiClient.get("/workflows/definitions/", { params });
    return response.data;
  },

  get: async (id: number): Promise<WorkflowDefinition> => {
    const response = await apiClient.get(`/workflows/definitions/${id}/`);
    return response.data;
  },

  create: async (data: Partial<WorkflowDefinition>): Promise<WorkflowDefinition> => {
    const response = await apiClient.post("/workflows/definitions/", data);
    return response.data;
  },

  update: async (id: number, data: Partial<WorkflowDefinition>): Promise<WorkflowDefinition> => {
    const response = await apiClient.patch(`/workflows/definitions/${id}/`, data);
    return response.data;
  },

  seedWorkOrder: async (): Promise<WorkflowDefinition> => {
    const response = await apiClient.post("/workflows/definitions/seed_work_order/");
    return response.data;
  },

  seedRegistered: async (): Promise<WorkflowDefinition[]> => {
    const response = await apiClient.post("/workflows/definitions/seed_registered/");
    return response.data;
  },

  registry: async (): Promise<WorkflowRegistryItem[]> => {
    const response = await apiClient.get("/workflows/definitions/registry/");
    return response.data;
  },

  instances: async (params?: { model_path?: string; object_id?: number }): Promise<PaginatedWorkflowInstances> => {
    const response = await apiClient.get("/workflows/instances/", { params });
    return response.data;
  },

  logs: async (params?: { instance?: number; result?: string }): Promise<PaginatedWorkflowLogs> => {
    const response = await apiClient.get("/workflows/logs/", { params });
    return response.data;
  },

  createState: async (data: Partial<WorkflowState>): Promise<WorkflowState> => {
    const response = await apiClient.post("/workflows/states/", data);
    return response.data;
  },

  updateState: async (id: number, data: Partial<WorkflowState>): Promise<WorkflowState> => {
    const response = await apiClient.patch(`/workflows/states/${id}/`, data);
    return response.data;
  },

  createTransition: async (data: Partial<WorkflowTransition>): Promise<WorkflowTransition> => {
    const response = await apiClient.post("/workflows/transitions/", data);
    return response.data;
  },

  updateTransition: async (id: number, data: Partial<WorkflowTransition>): Promise<WorkflowTransition> => {
    const response = await apiClient.patch(`/workflows/transitions/${id}/`, data);
    return response.data;
  },

  createGuard: async (data: Partial<WorkflowGuard>): Promise<WorkflowGuard> => {
    const response = await apiClient.post("/workflows/guards/", data);
    return response.data;
  },

  createAction: async (data: Partial<WorkflowAction>): Promise<WorkflowAction> => {
    const response = await apiClient.post("/workflows/actions/", data);
    return response.data;
  },
};
