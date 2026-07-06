import api from '@/lib/api/client';

export interface SMSRecipient {
    type: 'user' | 'phone';
    value: string; // User ID or Phone Number
    name?: string; // For UI display
}

export interface SendSMSResponse {
    status: string;
    message: string;
    notification_id?: number;
    details?: Record<string, unknown>;
}

export interface SMSHistoryItem {
    id: number;
    created_at: string;
    updated_at?: string;
    sent_at?: string | null;
    delivered_at?: string | null;
    failed_at?: string | null;
    recipient_name: string;
    recipient_phone: string;
    recipient_initials: string;
    message: string;
    status: string;
    scheduled_for?: string;
    error_message?: string;
    title?: string;
    priority?: string;
    recipient_id?: number | null;
    data?: Record<string, unknown>;
}

export interface SMSTemplate {
    id: number;
    name: string;
    sms_body: string;
}

export interface SMSStats {
    sent_today: number;
    scheduled: number;
    failed_today: number;
    total_sent: number;
}

export interface SMSBalance {
    success: boolean;
    balance: number;
    currency?: string;
    error?: string;
    supported?: boolean;
}

export interface BulkSendSMSResponse {
    message: string;
    results: Record<string, unknown>[];
    total: number;
    successful: number;
    failed?: number;
}

const smsApi = {
    // Send single SMS
    sendSingle: async (data: { phone?: string; recipient_id?: number; message: string; scheduled_for?: string }) => {
        const response = await api.post<SendSMSResponse>('/notifications/sms-console/send_single/', data);
        return response.data;
    },

    // Send bulk SMS
    sendBulk: async (data: { recipients: { type: string; value: string }[]; message: string; scheduled_for?: string }) => {
        const response = await api.post<BulkSendSMSResponse>('/notifications/sms-console/send_bulk/', data);
        return response.data;
    },

    // Get SMS History
    getHistory: async (params?: { limit?: number }) => {
        const response = await api.get<SMSHistoryItem[]>('/notifications/sms-console/history/', { params });
        return response.data;
    },

    // Get one SMS log
    getLog: async (id: number) => {
        const response = await api.get<SMSHistoryItem>(`/notifications/sms-console/${id}/details/`);
        return response.data;
    },

    // Resend an SMS log
    resendLog: async (id: number) => {
        const response = await api.post<SendSMSResponse>(`/notifications/sms-console/${id}/resend/`);
        return response.data;
    },

    // Delete an SMS log
    deleteLog: async (id: number) => {
        await api.delete(`/notifications/sms-console/${id}/delete_log/`);
    },

    // AI Chat (multi-turn)
    aiChat: async (data: {
        messages: { role: 'user' | 'model'; content: string }[];
        current_draft?: string;
        mode?: 'sms' | 'template';
    }) => {
        const response = await api.post<{ reply: string; suggestion: string | null }>(
            '/notifications/sms-console/ai_assist/',
            data
        );
        return response.data;
    },

    // Get Templates (SMS channel only)
    getTemplates: async () => {
        const response = await api.get('/notifications/templates/', { params: { channel: 'sms' } });
        return (response.data.results || response.data) as SMSTemplate[];
    },

    // Get SMS Stats
    getStats: async () => {
        const response = await api.get<SMSStats>('/notifications/sms-console/stats/');
        return response.data;
    },

    // Get SMS Balance
    getBalance: async () => {
        const response = await api.get<SMSBalance>('/notifications/sms-console/balance/');
        return response.data;
    }
};

export default smsApi;
