import apiClient from "./client";

// ==================== Interfaces ====================

export interface Package {
    id: number;
    name: string;
    code: string;
    description: string;
    price: string;
    duration_months: number;
    is_active: boolean;
    features: {
        // AA Membership entitlement keys
        roadside_first_aid?: number;
        towing_services_km?: number;
        emergency_fuel?: number;
        key_lock_out?: number;
        extrication?: number;
        accident_estimate?: number;
        pre_purchase_inspection?: number;
        battery_boosts?: number;
        flat_tyre_service?: number;
        total_service_calls?: number;

        // Legacy/generic keys
        kilometers?: number;
        call_out_charges?: number;
        towing_services?: number;
        roadside_assistance?: number;
        free_inspections?: number;
        discount_percentage?: number;
    };
    created_by?: number;
    created_by_name?: string;
    created_at: string;
    updated_at: string;
}

export interface Subscription {
    id: number;
    subscription_number: string;
    customer: number;
    customer_name?: string;
    customer_full_name?: string;
    package: number;
    package_name?: string;
    package_code?: string;
    vehicle?: number | null;
    start_date: string;
    end_date: string;
    status: 'pending' | 'active' | 'expired' | 'cancelled' | 'suspended';
    is_active_status?: boolean;
    is_expired_status?: boolean;
    days_remaining?: number;
    auto_renew: boolean;
    purchase_price: string;
    payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
    cancelled_at?: string | null;
    cancellation_reason?: string;
    purchased_at: string;
    remaining_allowances?: Record<string, number>;
    invoice_id?: number | null;

    // AA Membership Compliance Fields
    activation_date?: string | null;
    original_price?: string;
    discount_applied: number;
    discount_reason?: string;
    is_refund_eligible?: boolean;
    calculated_refund_amount?: string;

    created_at: string;
    updated_at: string;

    metadata?: Record<string, any>;
}

export interface SubscriptionUsage {
    id: number;
    subscription: number;
    subscription_number?: string;
    usage_type: 'kilometer' | 'call_out' | 'towing' | 'inspection' | 'roadside_assistance' | 'other';
    quantity_used: string;
    service_date: string;
    customer_name?: string;
    reference_type?: 'workorder' | 'appointment' | 'inspection' | 'roadside' | 'other' | null;
    reference_id?: number | null;
    description?: string;
    created_by?: number | null;
    created_by_name?: string;
    created_at: string;
}

export interface PackageListResponse {
    count: number;
    next: string | null;
    previous: string | null;
    results: Package[];
}

export interface SubscriptionListResponse {
    count: number;
    next: string | null;
    previous: string | null;
    results: Subscription[];
}

export interface SubscriptionUsageListResponse {
    count: number;
    next: string | null;
    previous: string | null;
    results: SubscriptionUsage[];
}

// ==================== Packages API ====================

export const packagesApi = {
    list: async (params?: {
        page?: number;
        search?: string;
        is_active?: boolean;
        ordering?: string;
    }): Promise<PackageListResponse> => {
        const response = await apiClient.get("/subscriptions/packages/", { params });
        return response.data;
    },

    get: async (id: number): Promise<Package> => {
        const response = await apiClient.get(`/subscriptions/packages/${id}/`);
        return response.data;
    },

    create: async (data: Partial<Package>): Promise<Package> => {
        const response = await apiClient.post("/subscriptions/packages/", data);
        return response.data;
    },

    update: async (id: number, data: Partial<Package>): Promise<Package> => {
        const response = await apiClient.put(`/subscriptions/packages/${id}/`, data);
        return response.data;
    },

    partialUpdate: async (id: number, data: Partial<Package>): Promise<Package> => {
        const response = await apiClient.patch(`/subscriptions/packages/${id}/`, data);
        return response.data;
    },

    delete: async (id: number): Promise<void> => {
        await apiClient.delete(`/subscriptions/packages/${id}/`);
    },

    getAvailable: async (): Promise<Package[]> => {
        const response = await apiClient.get("/subscriptions/packages/", {
            params: { is_active: true }
        });
        // Handle both pagination and direct array responses
        return response.data.results || response.data;
    },
};

// ==================== Subscriptions API ====================

export const subscriptionsApi = {
    list: async (params?: {
        page?: number;
        search?: string;
        customer?: number;
        vehicle?: number;
        package?: number;
        status?: string;
        payment_status?: string;
        start_date__gte?: string;
        start_date__lte?: string;
        end_date__gte?: string;
        end_date__lte?: string;
        ordering?: string;
    }): Promise<SubscriptionListResponse> => {
        const response = await apiClient.get("/subscriptions/subscriptions/", { params });
        return response.data;
    },

    get: async (id: number): Promise<Subscription> => {
        const response = await apiClient.get(`/subscriptions/subscriptions/${id}/`);
        return response.data;
    },

    create: async (data: {
        customer?: number;
        package: number;
        vehicle?: number;
        start_date?: string;
        end_date?: string;
        auto_renew?: boolean;
        purchase_price?: string;
        payment_status?: string;
    }): Promise<Subscription & { invoice_id?: number }> => {
        const response = await apiClient.post("/subscriptions/subscriptions/", data);
        return response.data;
    },

    update: async (id: number, data: Partial<Subscription>): Promise<Subscription> => {
        const response = await apiClient.put(`/subscriptions/subscriptions/${id}/`, data);
        return response.data;
    },

    partialUpdate: async (id: number, data: Partial<Subscription>): Promise<Subscription> => {
        const response = await apiClient.patch(`/subscriptions/subscriptions/${id}/`, data);
        return response.data;
    },

    delete: async (id: number): Promise<void> => {
        await apiClient.delete(`/subscriptions/subscriptions/${id}/`);
    },

    getMySubscriptions: async (): Promise<Subscription[]> => {
        const response = await apiClient.get("/subscriptions/subscriptions/my_subscriptions/");
        return response.data;
    },

    // Custom actions
    renew: async (id: number, months?: number): Promise<Subscription> => {
        const response = await apiClient.post(`/subscriptions/subscriptions/${id}/renew/`, {
            months,
        });
        return response.data;
    },

    cancel: async (id: number, reason?: string): Promise<Subscription> => {
        const response = await apiClient.post(`/subscriptions/subscriptions/${id}/cancel/`, {
            reason,
        });
        return response.data;
    },

    activate: async (id: number): Promise<Subscription> => {
        const response = await apiClient.post(`/subscriptions/subscriptions/${id}/activate/`);
        return response.data;
    },

    suspend: async (id: number): Promise<Subscription> => {
        const response = await apiClient.post(`/subscriptions/subscriptions/${id}/suspend/`);
        return response.data;
    },

    usage: async (id: number): Promise<SubscriptionUsage[]> => {
        const response = await apiClient.get(`/subscriptions/subscriptions/${id}/usage/`);
        return response.data;
    },

    stats: async (id: number): Promise<{
        days_remaining: number;

        usage_summary: Record<string, any>;
        remaining_allowances: Record<string, number>;
    }> => {
        const response = await apiClient.get(`/subscriptions/subscriptions/${id}/stats/`);
        return response.data;
    },
    downloadCard: async (id: number, subNumber: string): Promise<void> => {
        const response = await apiClient.get(`/subscriptions/subscriptions/${id}/pdf/`, {
            responseType: 'blob',
        });
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `membership_card_${subNumber}.pdf`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    },
    changePlan: async (id: number, packageId: number): Promise<{ subscription: Subscription; message: string }> => {
        const response = await apiClient.post(`/subscriptions/subscriptions/${id}/change_plan/`, {
            package_id: packageId,
        });
        return response.data;
    },
};

// ==================== Subscription Usage API ====================

export const subscriptionUsageApi = {
    list: async (params?: {
        page?: number;
        subscription?: number;
        usage_type?: string;
        service_date__gte?: string;
        service_date__lte?: string;
        ordering?: string;
    }): Promise<SubscriptionUsageListResponse> => {
        const response = await apiClient.get("/subscriptions/usage/", { params });
        return response.data;
    },

    get: async (id: number): Promise<SubscriptionUsage> => {
        const response = await apiClient.get(`/subscriptions/usage/${id}/`);
        return response.data;
    },

    create: async (data: {
        subscription: number;
        usage_type: string;
        quantity_used: string | number;
        service_date?: string;
        reference_type?: string;
        reference_id?: number;
        description?: string;
    }): Promise<SubscriptionUsage> => {
        const response = await apiClient.post("/subscriptions/usage/", data);
        return response.data;
    },

    update: async (id: number, data: Partial<SubscriptionUsage>): Promise<SubscriptionUsage> => {
        const response = await apiClient.put(`/subscriptions/usage/${id}/`, data);
        return response.data;
    },

    delete: async (id: number): Promise<void> => {
        await apiClient.delete(`/subscriptions/usage/${id}/`);
    },
};
