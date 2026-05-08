import apiClient from "./client";

export interface Notification {
  id: number;
  recipient: number | null;
  notification_type: string;
  channel?: string;
  title: string;
  message: string;
  priority: string;
  status: string;
  is_read?: boolean;
  created_at: string;
  read_at?: string;
  related_object_type?: string;
  related_object_id?: number;
  scheduled_for?: string;
  data?: {
    appointment_id?: number;
    work_order_id?: number;
    invoice_id?: number;
    estimate_id?: number;
    customer_id?: number;
    vehicle_id?: number;
    inspection_id?: number;

    [key: string]: unknown;
  };
}

export interface NotificationPreference {
  id: number;
  user: number;
  email_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
  in_app_enabled: boolean;
  whatsapp_enabled: boolean;
  whatsapp_manual_enabled: boolean;
  sound_enabled: boolean;
  appointment_notifications: boolean;
  work_order_notifications: boolean;
  invoice_notifications: boolean;
  payment_notifications: boolean;
  inspection_notifications: boolean;
  inventory_notifications: boolean;
  vehicle_notifications: boolean;
  system_notifications: boolean;
  roadside_requested_email: boolean;
  roadside_requested_sms: boolean;
  roadside_dispatched_email: boolean;
  roadside_dispatched_sms: boolean;
  roadside_arrived_email: boolean;
  roadside_arrived_sms: boolean;
  roadside_completed_email: boolean;
  roadside_completed_sms: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  digest_enabled: boolean;
  digest_frequency?: string;
  phone_number?: string;
}

export interface NotificationListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Notification[];
}

export interface NotificationAdminStats {
  days: number;
  total: number;
  unread: number;
  failed: number;
  pending: number;
  delivered: number;
  success_rate: number;
  by_type: Record<string, number>;
  by_channel: Record<string, number>;
  by_status: Record<string, number>;
  failed_recent: Notification[];
}

export interface NotificationTemplate {
  id: number;
  name: string;
  template_type: string;
  channel: string;
  subject: string;
  body: string;
  html_body?: string;
  sms_body?: string;
  push_title?: string;
  push_body?: string;
  is_active: boolean;
  variables?: Record<string, string>;
  created_at: string;
  updated_at: string;
  created_by?: number;
  created_by_name?: string;
  whatsapp_template_name?: string;
  whatsapp_template_variables?: string[];
}

export const notificationsApi = {
  list: async (params?: {
    page?: number;
    status?: string;
    is_read?: boolean;
    notification_type?: string;
    related_object_type?: string;
    related_object_id?: number;
    ordering?: string;
    all?: boolean;
  }): Promise<NotificationListResponse> => {
    const response = await apiClient.get("/notifications/notifications/", { params });
    return response.data;
  },

  create: async (data: Partial<Notification>): Promise<Notification> => {
    const response = await apiClient.post("/notifications/notifications/", data);
    return response.data;
  },

  get: async (id: number): Promise<Notification> => {
    const response = await apiClient.get(`/notifications/notifications/${id}/`);
    return response.data;
  },

  markAsRead: async (id: number): Promise<void> => {
    await apiClient.post(`/notifications/notifications/${id}/mark_read/`);
  },

  resend: async (id: number): Promise<{ status: string; notification_status: string; message: string }> => {
    const response = await apiClient.post(`/notifications/notifications/${id}/resend/`);
    return response.data;
  },

  markAllAsRead: async (): Promise<void> => {
    await apiClient.post("/notifications/notifications/mark_all_read/");
  },

  clearRead: async (): Promise<{ count: number }> => {
    const response = await apiClient.delete("/notifications/notifications/clear_read/");
    return response.data;
  },

  stats: async (): Promise<{
    total_notifications: number;
    unread_count: number;
    by_type: Record<string, number>;
    by_channel: Record<string, number>;
    by_status: Record<string, number>;
    recent_notifications: Notification[];
  }> => {
    const response = await apiClient.get("/notifications/notifications/stats/");
    return response.data;
  },

  unreadCount: async (): Promise<{ unread_count: number }> => {
    const response = await apiClient.get("/notifications/notifications/unread_count/");
    return response.data;
  },

  adminStats: async (days = 30): Promise<NotificationAdminStats> => {
    const response = await apiClient.get("/notifications/notifications/admin_stats/", { params: { days } });
    return response.data;
  },

  // Preferences
  getPreferences: async (): Promise<NotificationPreference> => {
    const response = await apiClient.get("/notifications/preferences/my_preferences/");
    return response.data;
  },

  updatePreferences: async (data: Partial<NotificationPreference>): Promise<NotificationPreference> => {
    const response = await apiClient.patch("/notifications/preferences/update_preferences/", data);
    return response.data;
  },

  pushSubscriptions: {
    publicKey: async (): Promise<{ public_key: string; configured: boolean }> => {
      const response = await apiClient.get("/notifications/push-subscriptions/public_key/");
      return response.data;
    },

    subscribe: async (data: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
      device_name?: string;
    }) => {
      const response = await apiClient.post("/notifications/push-subscriptions/subscribe/", data);
      return response.data;
    },

    unsubscribe: async (endpoint: string): Promise<{ message: string; count: number }> => {
      const response = await apiClient.post("/notifications/push-subscriptions/unsubscribe/", { endpoint });
      return response.data;
    },
  },

  // Templates
  templates: {
    list: async (params?: {
      template_type?: string;
      channel?: string;
      is_active?: boolean;
      search?: string;
    }): Promise<NotificationTemplate[] | { results: NotificationTemplate[] }> => {
      const response = await apiClient.get("/notifications/templates/", { params });
      return response.data;
    },

    get: async (id: number): Promise<NotificationTemplate> => {
      const response = await apiClient.get(`/notifications/templates/${id}/`);
      return response.data;
    },

    create: async (data: Partial<NotificationTemplate>): Promise<NotificationTemplate> => {
      const response = await apiClient.post("/notifications/templates/", data);
      return response.data;
    },

    update: async (id: number, data: Partial<NotificationTemplate>): Promise<NotificationTemplate> => {
      const response = await apiClient.patch(`/notifications/templates/${id}/`, data);
      return response.data;
    },

    delete: async (id: number): Promise<void> => {
      await apiClient.delete(`/notifications/templates/${id}/`);
    },
  },

  renderTemplate: async (data: {
    template_type: string;
    object_id: number;
    channel?: string;
  }): Promise<{ message: string; phone_number: string; template_used: string }> => {
    const response = await apiClient.post("/notifications/render-template/", data);
    return response.data;
  },
};
