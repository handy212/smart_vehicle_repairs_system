import apiClient from "./client";

export interface RoadsideRequest {
    id: number;
    request_number: string;
    customer: number;
    customer_name?: string;
    vehicle: number;
    vehicle_display?: string;
    branch?: number;
    service_type: 'towing' | 'battery_boost' | 'flat_tyre' | 'key_lockout' | 'emergency_fuel' | 'extrication' | 'mechanical_first_aid' | 'other';
    service_type_display?: string;
    status: 'requested' | 'dispatched' | 'en_route' | 'on_site' | 'in_progress' | 'completed' | 'cancelled' | 'failed';
    status_display?: string;
    breakdown_location: string;
    latitude?: string | number;
    longitude?: string | number;
    description?: string;
    customer_phone: string;
    tow_distance_km?: string | number;
    destination?: string;
    assigned_technician?: number;
    assigned_technician_name?: string;
    dispatched_at?: string;
    arrived_at?: string;
    completed_at?: string;
    subscription_used?: number;
    subscription_number?: string;
    subscription_allowance_deducted: boolean;
    is_covered_by_subscription: boolean;
    charge_amount?: string;
    invoice?: number;
    invoice_number?: string;
    notes?: string;
    customer_feedback?: string;
    requested_at: string;
    created_by?: number;
    updated_at: string;
    is_active: boolean;
    can_be_cancelled: boolean;
}

export interface RoadsideRequestCreate {
    customer: number;
    vehicle: number;
    service_type: string;
    breakdown_location: string;
    latitude?: string | number;
    longitude?: string | number;
    description?: string;
    customer_phone: string;
    tow_distance_km?: string | number;
    destination?: string;
    notes?: string;
}

export interface RoadsideRequestListResponse {
    count: number;
    next: string | null;
    previous: string | null;
    results: RoadsideRequest[];
}

export const roadsideApi = {
    list: async (params?: {
        page?: number;
        search?: string;
        status?: string;
        service_type?: string;
        customer?: number;
        vehicle?: number;
        branch?: number;
        assigned_technician?: number;
        is_covered_by_subscription?: boolean;
        ordering?: string;
    }): Promise<RoadsideRequestListResponse> => {
        const response = await apiClient.get("/roadside/requests/", { params });
        return response.data;
    },

    dashboardStats: async (): Promise<{
        total_requests: number;
        active_requests: number;
        completed_requests: number;
        covered_by_subscription: number;
    }> => {
        const response = await apiClient.get("/roadside/requests/dashboard_stats/");
        return response.data;
    },

    get: async (id: number): Promise<RoadsideRequest> => {
        const response = await apiClient.get(`/roadside/requests/${id}/`);
        return response.data;
    },

    create: async (data: RoadsideRequestCreate): Promise<RoadsideRequest> => {
        const response = await apiClient.post("/roadside/requests/", data);
        return response.data;
    },

    update: async (id: number, data: Partial<RoadsideRequest>): Promise<RoadsideRequest> => {
        const response = await apiClient.put(`/roadside/requests/${id}/`, data);
        return response.data;
    },

    partialUpdate: async (id: number, data: Partial<RoadsideRequest>): Promise<RoadsideRequest> => {
        const response = await apiClient.patch(`/roadside/requests/${id}/`, data);
        return response.data;
    },

    delete: async (id: number): Promise<void> => {
        await apiClient.delete(`/roadside/requests/${id}/`);
    },

    // Custom actions
    myRequests: async (): Promise<RoadsideRequest[]> => {
        const response = await apiClient.get("/roadside/requests/my_requests/");
        return response.data;
    },

    assignDispatch: async (id: number, technicianId?: number): Promise<RoadsideRequest> => {
        const response = await apiClient.post(`/roadside/requests/${id}/assign_dispatch/`, {
            technician_id: technicianId
        });
        return response.data;
    },

    enRoute: async (id: number): Promise<RoadsideRequest> => {
        const response = await apiClient.post(`/roadside/requests/${id}/en_route/`);
        return response.data;
    },

    arrive: async (id: number): Promise<RoadsideRequest> => {
        const response = await apiClient.post(`/roadside/requests/${id}/arrive/`);
        return response.data;
    },

    inProgress: async (id: number): Promise<RoadsideRequest> => {
        const response = await apiClient.post(`/roadside/requests/${id}/in_progress/`);
        return response.data;
    },

    complete: async (id: number): Promise<RoadsideRequest & { invoice_id?: number }> => {
        const response = await apiClient.post(`/roadside/requests/${id}/complete/`);
        return response.data;
    },

    cancel: async (id: number): Promise<RoadsideRequest> => {
        const response = await apiClient.post(`/roadside/requests/${id}/cancel/`);
        return response.data;
    },

    fail: async (id: number, reason: string): Promise<RoadsideRequest> => {
        const response = await apiClient.post(`/roadside/requests/${id}/fail/`, {
            reason
        });
        return response.data;
    },

    sendCustomerSms: async (id: number, message: string): Promise<{ success: boolean; message: string }> => {
        const response = await apiClient.post(`/roadside/requests/${id}/send_customer_sms/`, {
            message
        });
        return response.data;
    },

    rate: async (id: number, data: { rating: number; customer_feedback?: string }): Promise<RoadsideRequest> => {
        const response = await apiClient.post(`/roadside/requests/${id}/rate_service/`, data);
        return response.data;
    },
};
