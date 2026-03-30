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
    recipient_name: string;
    recipient_phone: string;
    recipient_initials: string;
    message: string;
    status: string;
    scheduled_for?: string;
    error_message?: string;
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
    getHistory: async () => {
        const response = await api.get<SMSHistoryItem[]>('/notifications/sms-console/history/');
        return response.data;
    },

    // AI Assist
    aiAssist: async (prompt: string) => {
        const response = await api.post<{ suggestion: string }>('/notifications/sms-console/ai_assist/', { prompt });
        return response.data;
    },

    // Get Templates (SMS channel only)
    getTemplates: async () => {
        const response = await api.get('/notifications/templates/', { params: { channel: 'sms' } });
        return response.data.results || response.data; // Handle pagination if present
    },

    // Get SMS Stats
    getStats: async () => {
        const response = await api.get('/notifications/sms-console/stats/');
        return response.data;
    },

    // Get SMS Balance
    getBalance: async () => {
        const response = await api.get('/notifications/sms-console/balance/');
        return response.data;
    }
};

export default smsApi;
