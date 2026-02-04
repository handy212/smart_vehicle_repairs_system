import apiClient from "./client";

export interface PortalServiceBundle {
  id: number;
  name: string;
  description: string;
  price: number;
}

export interface PortalVehicle {
  id: number;
  year: number;
  make: string;
  model: string;
  license_plate: string;
  vin: string;
  name: string;
}

export interface PortalBookingRequest {
  vehicle_id: number;
  service_type: string;
  service_bundle_id?: number;
  appointment_date: string;
  appointment_time: string;
  customer_concerns: string;
}

export interface PortalHistoryItem {
  id: number;
  work_order_number: string;
  vehicle_name: string;
  status: string;
  created_at: string;
  total_amount: string | number;
}

export interface PortalInspection {
  id: number;
  inspection_number: string;
  vehicle_name: string;
  template_name: string;
  inspection_date: string;
  overall_result: string;
  status: string;
}

export interface PortalInvoice {
  id: number;
  invoice_number: string;
  invoice_date: string;
  total: number | string;
  status: string;
}

export interface PortalDashboardStats {
  total_vehicles: number;
  upcoming_appointments_count: number;
  pending_invoices_count: number;
  total_spent: number;
}

export interface PortalDashboardResponse {
  stats: PortalDashboardStats;
  recent_appointments: any[]; // Using any for simplicty or define specific Appt type
  recent_invoices: PortalInvoice[];
}

export interface AvailabilityResponse {
  date: string;
  slots: string[];
}

export const portalApi = {
  getServices: async (): Promise<PortalServiceBundle[]> => {
    const response = await apiClient.get("/portal/services/");
    return Array.isArray(response.data) ? response.data : response.data?.results || [];
  },

  getVehicles: async (): Promise<PortalVehicle[]> => {
    const response = await apiClient.get("/portal/vehicles/");
    return Array.isArray(response.data) ? response.data : response.data?.results || [];
  },

  getHistory: async (): Promise<PortalHistoryItem[]> => {
    const response = await apiClient.get("/portal/history/");
    return Array.isArray(response.data) ? response.data : response.data?.results || [];
  },

  getInspections: async (): Promise<PortalInspection[]> => {
    const response = await apiClient.get("/portal/inspections/");
    return Array.isArray(response.data) ? response.data : response.data?.results || [];
  },

  getInvoices: async (): Promise<PortalInvoice[]> => {
    const response = await apiClient.get("/portal/invoices/");
    return Array.isArray(response.data) ? response.data : response.data?.results || [];
  },

  checkAvailability: async (date: string): Promise<AvailabilityResponse> => {
    const response = await apiClient.get("/portal/availability/", { params: { date } });
    return response.data;
  },

  createBooking: async (data: PortalBookingRequest): Promise<any> => {
    const response = await apiClient.post("/portal/bookings/", data);
    return response.data;
  },

  dashboard: async (): Promise<PortalDashboardResponse> => {
    const response = await apiClient.get("/portal/dashboard/");
    return response.data;
  }
};
