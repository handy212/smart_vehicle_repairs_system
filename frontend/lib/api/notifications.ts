import apiClient from "./client";

export interface Notification {
  id: number;
  recipient: number;
  notification_type: string;
  title: string;
  message: string;
  priority: string;
  status: string;
  is_read?: boolean;
  created_at: string;
  read_at?: string;
  related_object_type?: string;
  related_object_id?: number;
  data?: {
    appointment_id?: number;
    work_order_id?: number;
    invoice_id?: number;
    estimate_id?: number;
    customer_id?: number;
    vehicle_id?: number;
    inspection_id?: number;
    [key: string]: any;
  };
}

export interface NotificationPreference {
  id: number;
  user: number;
  email_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
  in_app_enabled: boolean;
  appointment_notifications: boolean;
  work_order_notifications: boolean;
  invoice_notifications: boolean;
  payment_notifications: boolean;
  inspection_notifications: boolean;
  inventory_notifications: boolean;
  vehicle_notifications: boolean;
  system_notifications: boolean;
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

export const notificationsApi = {
  list: async (params?: {
    page?: number;
    status?: string;
    is_read?: boolean;
    notification_type?: string;
  }): Promise<NotificationListResponse> => {
    const response = await apiClient.get("/notifications/notifications/", { params });
    return response.data;
  },

  get: async (id: number): Promise<Notification> => {
    const response = await apiClient.get(`/notifications/notifications/${id}/`);
    return response.data;
  },

  markAsRead: async (id: number): Promise<void> => {
    await apiClient.post(`/notifications/notifications/${id}/mark_read/`);
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

  // Preferences
  getPreferences: async (): Promise<NotificationPreference> => {
    const response = await apiClient.get("/notifications/preferences/my_preferences/");
    return response.data;
  },

  updatePreferences: async (data: Partial<NotificationPreference>): Promise<NotificationPreference> => {
    const response = await apiClient.patch("/notifications/preferences/update_preferences/", data);
    return response.data;
  },
};

