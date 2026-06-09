// Refund Management API Client
import apiClient from './client';

// ==================== Types ====================

export interface Refund {
    id: number;
    refund_number: string;
    original_payment: number;
    invoice: number;
    customer: number;
    customer_name: string;
    amount: string;
    reason: string;
    refund_method: string;
    reference_number: string;
    status: 'pending' | 'approved' | 'completed' | 'rejected' | 'cancelled';
    requested_by: number;
    requested_by_name: string;
    requested_at: string;
    approved_by?: number;
    approved_by_name?: string;
    approved_at?: string;
    processed_by?: number;
    processed_by_name?: string;
    processed_at?: string;
    till?: number;
    till_account_name?: string;
    bank_account?: number;
    bank_account_name?: string;
    notes: string;
}

export interface CreateRefundRequest {
    original_payment: number;
    invoice: number;
    customer: number;
    amount: string;
    reason: string;
    refund_method: string;
    reference_number?: string;
    bank_account?: number | string;
}

// ==================== Refund API ====================

export const refundApi = {
    // List refunds
    list: async (params?: {
        status?: string;
        customer?: number;
        search?: string;
    }) => {
        const response = await apiClient.get('/billing/refunds/', { params });
        return response.data;
    },

    // Get refund detail
    get: async (id: number) => {
        const response = await apiClient.get(`/billing/refunds/${id}/`);
        return response.data;
    },

    // Create refund
    create: async (data: CreateRefundRequest) => {
        const response = await apiClient.post('/billing/refunds/', data);
        return response.data;
    },

    // Approve refund
    approve: async (id: number) => {
        const response = await apiClient.post(`/billing/refunds/${id}/approve/`);
        return response.data;
    },

    // Reject refund
    reject: async (id: number) => {
        const response = await apiClient.post(`/billing/refunds/${id}/reject/`);
        return response.data;
    },

    // Complete refund
    complete: async (id: number, data?: { cash_account?: number | string; bank_account?: number | string }) => {
        const response = await apiClient.post(`/billing/refunds/${id}/complete/`, data || {});
        return response.data;
    },
};
