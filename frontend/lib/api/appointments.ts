import apiClient from "./client";

export interface Appointment {
  id: number;
  appointment_number: string;
  customer: number | { id: number };
  customer_name?: string;
  customer_number?: string;
  vehicle: number | { id: number };
  vehicle_info?: string;
  vehicle_display?: string;
  vehicle_plate?: string;
  appointment_date: string;
  appointment_time: string;
  service_type: string;
  status: string;
  priority: string;
  estimated_duration?: number;
  notes?: string;
  customer_concerns?: string;
  special_instructions?: string;
  estimated_cost?: number | string;
  branch?: number;
  branch_name?: string;
  service_bay?: number;
  service_bay_name?: string;
  confirmed_at?: string;
  check_in_time?: string;
  created_at: string;
}

export interface AppointmentListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Appointment[];
}

export const appointmentsApi = {
  list: async (params?: {
    page?: number;
    date?: string;
    status?: string;
    customer?: number;
    vehicle?: number;
    all_branches?: boolean;
    search?: string;
    date_from?: string;
    date_to?: string;
    appointment_date__gte?: string;
    appointment_date__lte?: string;
    service_type?: string;
    ordering?: string;
  }): Promise<AppointmentListResponse> => {
    const response = await apiClient.get("/appointments/appointments/", { params });
    return response.data;
  },

  get: async (id: number): Promise<Appointment> => {
    const response = await apiClient.get(`/appointments/appointments/${id}/`);
    return response.data;
  },

  create: async (data: Partial<Appointment>): Promise<Appointment> => {
    // Back-compat: UI uses `notes`, API expects `customer_concerns`.

    const payload: any = { ...data };
    if (payload.notes && (payload.customer_concerns === undefined || payload.customer_concerns === null || payload.customer_concerns === "")) {
      payload.customer_concerns = payload.notes;
    }
    const response = await apiClient.post("/appointments/appointments/", payload);
    return response.data;
  },

  update: async (id: number, data: Partial<Appointment>): Promise<Appointment> => {
    const response = await apiClient.patch(`/appointments/appointments/${id}/`, data);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/appointments/appointments/${id}/`);
  },

  today: async (): Promise<Appointment[]> => {
    const response = await apiClient.get("/appointments/appointments/today/");
    return response.data;
  },

  upcoming: async (): Promise<Appointment[]> => {
    const response = await apiClient.get("/appointments/appointments/upcoming/");
    return response.data;
  },

  calendar: async (params?: {
    start_date?: string;
    end_date?: string;

  }): Promise<any[]> => {
    const response = await apiClient.get("/appointments/appointments/calendar/", { params });
    return response.data;
  },

  confirm: async (id: number, confirmationMethod?: string): Promise<Appointment> => {
    const response = await apiClient.post(`/appointments/appointments/${id}/confirm/`, {
      confirmation_method: confirmationMethod || "phone",
    });
    return response.data;
  },

  checkIn: async (id: number): Promise<Appointment> => {
    const response = await apiClient.post(`/appointments/appointments/${id}/check_in/`);
    return response.data;
  },

  complete: async (id: number): Promise<Appointment> => {
    const response = await apiClient.post(`/appointments/appointments/${id}/complete/`);
    return response.data;
  },

  cancel: async (id: number, reason?: string): Promise<Appointment> => {
    const response = await apiClient.post(`/appointments/appointments/${id}/cancel/`, {
      reason: reason || "",
    });
    return response.data;
  },

  reschedule: async (id: number, appointmentDate: string, appointmentTime: string): Promise<Appointment> => {
    const response = await apiClient.post(`/appointments/appointments/${id}/reschedule/`, {
      appointment_date: appointmentDate,
      appointment_time: appointmentTime,
    });
    return response.data;
  },

  getSuggestedMessage: async (id: number, channel: "sms" | "email"): Promise<{ subject: string; message: string }> => {
    const response = await apiClient.get(`/appointments/appointments/${id}/suggested_message/`, {
      params: { channel },
    });
    return response.data;
  },


  sendSms: async (id: number, message: string): Promise<any> => {
    const response = await apiClient.post(`/appointments/appointments/${id}/send_customer_sms/`, { message });
    return response.data;
  },


  sendEmail: async (id: number, subject: string, message: string): Promise<any> => {
    const response = await apiClient.post(`/appointments/appointments/${id}/send_customer_email/`, { subject, message });
    return response.data;
  },
};
