// Till & Refund Management API Client
import apiClient from './client';

// ==================== Types ====================

export interface Till {
    id: number;
    branch: number;
    branch_name: string;
    cashier: number;
    cashier_name: string;
    status: 'open' | 'closed';
    opened_at: string;
    closed_at?: string;
    opening_balance: string;
    closing_balance?: string;
    expected_balance?: string;
    variance?: string;
    is_balanced?: boolean;
    duration?: string;
    cash_payments_total?: string;
    cash_refunds_total?: string;
    current_expected_balance?: string;
    till_cash_movements_net?: string;
    notes: string;
    cash_counts: CashCount[];
}

export interface TillCashMovement {
    id: number;
    till: number;
    movement_type: 'pay_in' | 'pay_out';
    amount: string;
    reason: string;
    recorded_by: number;
    recorded_by_name: string;
    created_at: string;
}

export interface CashCount {
    id: number;
    denomination: string;
    quantity: number;
    total: string;
    count_type: 'opening' | 'closing';
}

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
    notes: string;
}

export interface OpenTillRequest {
    opening_balance: string;
}

export interface CloseTillRequest {
    cash_counts: {
        denomination: string;
        quantity: number;
    }[];
    notes?: string;
}

export interface RecordTillMovementRequest {
    movement_type: 'pay_in' | 'pay_out';
    amount: string;
    reason?: string;
}

export interface CreateRefundRequest {
    original_payment: number;
    invoice: number;
    customer: number;
    amount: string;
    reason: string;
    refund_method: string;
    reference_number?: string;
}

// ==================== Till API ====================

export const tillApi = {
    // List tills
    list: async (params?: {
        status?: 'open' | 'closed';
        cashier?: number;
        branch?: number;
        date?: string;
    }) => {
        const response = await apiClient.get('/billing/tills/', { params });
        return response.data;
    },

    // Get till detail
    get: async (id: number) => {
        const response = await apiClient.get(`/billing/tills/${id}/`);
        return response.data;
    },

    // Open new till
    open: async (data: OpenTillRequest) => {
        const response = await apiClient.post('/billing/tills/open/', data);
        return response.data;
    },

    // Close till
    close: async (id: number, data: CloseTillRequest) => {
        const response = await apiClient.post(`/billing/tills/${id}/close/`, data);
        return response.data;
    },

    // Get current user's open till
    getCurrent: async () => {
        const response = await apiClient.get('/billing/tills/current/');
        return response.data;
    },

    /** List pay-in / pay-out movements for audit */
    listMovements: async (id: number) => {
        const response = await apiClient.get(`/billing/tills/${id}/movements/`);
        return response.data as TillCashMovement[];
    },

    /** Record pay-in or pay-out on your open till */
    recordMovement: async (id: number, data: RecordTillMovementRequest) => {
        const response = await apiClient.post(`/billing/tills/${id}/record_movement/`, data);
        return response.data as TillCashMovement;
    },
};

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
    complete: async (id: number) => {
        const response = await apiClient.post(`/billing/refunds/${id}/complete/`);
        return response.data;
    },
};
