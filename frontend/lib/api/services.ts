import apiClient from "./client";

export interface ServiceType {
  id: number;
  name: string;
  description?: string;
  default_interval_months?: number;
  default_interval_miles?: number;
  is_predefined: boolean;
  is_active: boolean;
  created_by?: number | { id: number; full_name: string };
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface VehicleServiceSchedule {
  id: number;
  vehicle: number | {
    id: number;
    display_name: string;
    vin: string;
    license_plate: string;
    current_mileage: number;
  };
  vehicle_display?: string;
  service_type: number | ServiceType;
  service_type_name?: string;
  last_service_date?: string;
  last_service_mileage?: number;
  next_service_due_date?: string;
  next_service_due_mileage?: number;
  interval_months?: number;
  interval_miles?: number;
  is_active: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Additional fields from serializer
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  is_due?: boolean;
  days_until_due?: number;
  miles_until_due?: number;
  current_mileage?: number;
}

export interface ServiceTypeListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: ServiceType[];
}

export interface VehicleServiceScheduleListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: VehicleServiceSchedule[];
}

export interface ServicesDueResponse {
  count: number;
  date_from: string;
  date_to: string;
  results: VehicleServiceSchedule[];
}

export type ServiceTypeFormData = Omit<ServiceType, "id" | "created_at" | "updated_at" | "created_by" | "created_by_name" | "is_predefined">;

export type VehicleServiceScheduleFormData = Omit<VehicleServiceSchedule, "id" | "created_at" | "updated_at" | "vehicle_display" | "service_type_name" | "customer_name" | "customer_phone" | "customer_email" | "is_due" | "days_until_due" | "miles_until_due" | "current_mileage">;

export const servicesApi = {
  // Service Types
  listServiceTypes: async (params?: {
    page?: number;
    is_predefined?: boolean;
    is_active?: boolean;
    search?: string;
    ordering?: string;
  }): Promise<ServiceTypeListResponse> => {
    const response = await apiClient.get("/vehicles/service-types/", { params });
    return response.data;
  },

  getServiceType: async (id: number): Promise<ServiceType> => {
    const response = await apiClient.get(`/vehicles/service-types/${id}/`);
    return response.data;
  },

  createServiceType: async (data: ServiceTypeFormData): Promise<ServiceType> => {
    const response = await apiClient.post("/vehicles/service-types/", data);
    return response.data;
  },

  updateServiceType: async (id: number, data: Partial<ServiceTypeFormData>): Promise<ServiceType> => {
    const response = await apiClient.patch(`/vehicles/service-types/${id}/`, data);
    return response.data;
  },

  deleteServiceType: async (id: number): Promise<void> => {
    await apiClient.delete(`/vehicles/service-types/${id}/`);
  },

  // Vehicle Service Schedules
  listServiceSchedules: async (params?: {
    page?: number;
    vehicle?: number;
    service_type?: number;
    is_active?: boolean;
    date_from?: string;
    date_to?: string;
    due_only?: boolean;
    search?: string;
    ordering?: string;
  }): Promise<VehicleServiceScheduleListResponse> => {
    const response = await apiClient.get("/vehicles/service-schedules/", { params });
    return response.data;
  },

  getServiceSchedule: async (id: number): Promise<VehicleServiceSchedule> => {
    const response = await apiClient.get(`/vehicles/service-schedules/${id}/`);
    return response.data;
  },

  createServiceSchedule: async (data: VehicleServiceScheduleFormData): Promise<VehicleServiceSchedule> => {
    const response = await apiClient.post("/vehicles/service-schedules/", data);
    return response.data;
  },

  updateServiceSchedule: async (id: number, data: Partial<VehicleServiceScheduleFormData>): Promise<VehicleServiceSchedule> => {
    const response = await apiClient.patch(`/vehicles/service-schedules/${id}/`, data);
    return response.data;
  },

  deleteServiceSchedule: async (id: number): Promise<void> => {
    await apiClient.delete(`/vehicles/service-schedules/${id}/`);
  },

  markServiceCompleted: async (id: number, data: {
    service_date: string;
    service_mileage?: number;
  }): Promise<VehicleServiceSchedule> => {
    const response = await apiClient.post(`/vehicles/service-schedules/${id}/mark_completed/`, data);
    return response.data;
  },

  // Services Due
  getServicesDue: async (params?: {
    date_from?: string;
    date_to?: string;
    days_ahead?: number;
    service_type?: number;
    vehicle?: number;
    customer?: number;
    ordering?: string;
  }): Promise<ServicesDueResponse> => {
    const response = await apiClient.get("/vehicles/service-schedules/services_due/", { params });
    return response.data;
  },

  // Send Reminders
  sendReminder: async (scheduleId: number, channel: "email" | "sms" | "call" = "email"): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.post(`/vehicles/service-schedules/${scheduleId}/send_reminder/`, { channel });
    return response.data;
  },

  sendBulkReminders: async (scheduleIds: number[], channel: "email" | "sms" | "call" = "email"): Promise<{ success: boolean; sent: number; failed: number; errors?: Array<{ schedule_id: number; error: string }> }> => {
    const response = await apiClient.post("/vehicles/service-schedules/send_bulk_reminders/", {
      schedule_ids: scheduleIds,
      channel,
    });
    return response.data;
  },
};
