import apiClient from "./client";

export interface PaginatedResponse<T> {
    count: number;
    next?: string | null;
    previous?: string | null;
    results: T[];
}

export interface RoadsideDashboardStats {
    total_requests: number;
    active_requests: number;
    completed_requests: number;
    covered_by_subscription: number;
}

export interface RoadsideListParams {
    page?: number;
    search?: string;
    status?: string;
    service_type?: string;
    customer?: number;
    vehicle?: number;
    branch?: number;
    is_covered_by_subscription?: boolean;
    assigned_technician?: number;
    ordering?: string;
}

function isPaginatedRoadsideResponse(
    data: PaginatedResponse<RoadsideRequest> | RoadsideRequest[]
): data is PaginatedResponse<RoadsideRequest> {
    return !Array.isArray(data) && Array.isArray(data.results);
}

export interface DispatchedTechnician {
    id: number;
    technician: number;
    technician_name: string;
    dispatched_at: string;
    notes?: string;
}

export interface RoadsideRequest {
    id: number;
    request_number: string;
    status: 'requested' | 'dispatched' | 'en_route' | 'on_site' | 'in_progress' | 'completed' | 'cancelled' | 'failed';
    service_type: string;
    customer: {
        id: number;
        company_name?: string;
        first_name?: string;
        last_name?: string;
        phone?: string;
        user: {
            first_name: string;
            last_name: string;
            phone: string;
            email: string;
        }
    };
    vehicle: {
        id: number;
        make: string;
        model: string;
        year: number;
        license_plate: string;
    };
    breakdown_location: string;
    latitude?: string;
    longitude?: string;
    description: string;
    customer_phone: string;
    customer_email?: string;
    tow_distance_km?: string | number;
    destination?: string;
    notes?: string;
    created_at: string;

    // Additional fields for Portal
    requested_at: string;
    status_display?: string;
    is_covered_by_subscription?: boolean;
    subscription_number?: string;
    vehicle_display?: string;
    can_be_cancelled?: boolean;
    charge_amount?: string;
    dispatched_at?: string;
    arrived_at?: string;
    completed_at?: string;
    assigned_technician_name?: string;
    dispatched_technicians?: DispatchedTechnician[];
    customer_feedback?: string;
    customer_name?: string;
    service_type_display?: string;
    subscription_allowance_deducted?: boolean;
    invoice?: number;
    invoice_id?: number;
    invoice_number?: string;
    subscription_used?: number;
    assigned_technician?: number;
    branch?: number;
    rating?: number | null;
}

export interface RoadsideRequestCreate {
    customer?: number;
    vehicle: number;
    service_type: string;
    breakdown_location: string;
    latitude?: number;
    longitude?: number;
    description?: string;
    customer_phone: string;
    tow_distance_km?: number;
    destination?: string;
    notes?: string;
}

export const roadsideApi = {
    /**
     * Get requests assigned to the current user (technician)
     */
    getAssignedRequests: async () => {

        const response = await apiClient.get<PaginatedResponse<RoadsideRequest> | RoadsideRequest[]>("/roadside/requests/");
        if (isPaginatedRoadsideResponse(response.data)) {
            return response.data.results;
        }
        return Array.isArray(response.data) ? response.data : [];
    },

    /**
     * Get a single request
     */
    getRequest: async (id: number | string) => {
        const response = await apiClient.get<RoadsideRequest>(`/roadside/requests/${id}/`);
        return response.data;
    },

    /**
     * Update status actions
     */
    enRoute: async (id: number | string) => {
        const response = await apiClient.post<RoadsideRequest>(`/roadside/requests/${id}/en_route/`);
        return response.data;
    },

    arrive: async (id: number | string) => {
        const response = await apiClient.post<RoadsideRequest>(`/roadside/requests/${id}/arrive/`);
        return response.data;
    },

    inProgress: async (id: number | string) => {
        const response = await apiClient.post<RoadsideRequest>(`/roadside/requests/${id}/in_progress/`);
        return response.data;
    },

    complete: async (id: number | string) => {
        const response = await apiClient.post<RoadsideRequest>(`/roadside/requests/${id}/complete/`);
        return response.data;
    },

    fail: async (id: number | string, reason: string) => {
        const response = await apiClient.post<RoadsideRequest>(`/roadside/requests/${id}/fail/`, { reason });
        return response.data;
    },

    /**
     * Get requests for the current user (customer)
     */
    myRequests: async () => {
        const response = await apiClient.get<RoadsideRequest[]>("/roadside/requests/my_requests/");
        return response.data;
    },

    /**
     * Rate a completed request
     */
    rate: async (id: number | string, data: { rating: number; customer_feedback?: string }) => {
        const response = await apiClient.post<RoadsideRequest>(`/roadside/requests/${id}/rate_service/`, data);
        return response.data;
    },

    /**
     * Alias for getRequest to match Portal usage
     */
    get: async (id: number | string) => {
        const response = await apiClient.get<RoadsideRequest>(`/roadside/requests/${id}/`);
        return response.data;
    },

    /**
     * Cancel a request
     */
    cancel: async (id: number | string) => {
        const response = await apiClient.post<RoadsideRequest>(`/roadside/requests/${id}/cancel/`);
        return response.data;
    },

    /**
     * Admin: Get dashboard stats
     */
    dashboardStats: async () => {

        const response = await apiClient.get<RoadsideDashboardStats>("/roadside/requests/dashboard_stats/");
        return response.data;
    },

    /**
     * Admin: List all requests with filtering
     */

    list: async (params?: RoadsideListParams) => {
        const response = await apiClient.get<PaginatedResponse<RoadsideRequest>>("/roadside/requests/", { params });
        return response.data;
    },

    /**
     * Admin: Assign/Dispatch technician
     */
    assignDispatch: async (id: number | string, technicianId: number) => {
        const response = await apiClient.post<RoadsideRequest>(`/roadside/requests/${id}/assign_dispatch/`, { technician_id: technicianId });
        return response.data;
    },

    /**
     * Admin: Update request details
     */
    partialUpdate: async (id: number | string, data: Partial<RoadsideRequest>) => {
        const response = await apiClient.patch<RoadsideRequest>(`/roadside/requests/${id}/`, data);
        return response.data;
    },

    /**
     * Admin: Send SMS to customer
     */
    sendCustomerSms: async (id: number | string, message: string) => {
        const response = await apiClient.post<{ success: boolean; message: string }>(`/roadside/requests/${id}/send_customer_sms/`, { message });
        return response.data;
    },

    /**
     * Admin: Send Email to customer
     */
    sendCustomerEmail: async (id: number | string, message: string, subject?: string) => {
        const response = await apiClient.post<{ success: boolean; message: string }>(`/roadside/requests/${id}/send_customer_email/`, { message, subject });
        return response.data;
    },

    /**
     * Get a suggested message based on request status
     */
    getSuggestedMessage: async (id: number | string, channel: 'sms' | 'email') => {
        const response = await apiClient.get<{ subject: string; message: string; channel: string }>(`/roadside/requests/${id}/suggested_message/`, { params: { channel } });
        return response.data;
    },

    /**
     * Admin: Add an additional technician to a request (no status change)
     */
    addTechnician: async (id: number | string, technicianId: number, notes?: string) => {
        const response = await apiClient.post<RoadsideRequest>(`/roadside/requests/${id}/add_technician/`, { technician_id: technicianId, notes });
        return response.data;
    },

    /**
     * Admin: Remove a technician from a request
     */
    removeTechnician: async (id: number | string, technicianId: number) => {
        const response = await apiClient.post<RoadsideRequest>(`/roadside/requests/${id}/remove_technician/`, { technician_id: technicianId });
        return response.data;
    },

    /**
     * Create a new request (Admin/Manager)
     */

    create: async (data: RoadsideRequestCreate) => {
        const response = await apiClient.post<RoadsideRequest>("/roadside/requests/", data);
        return response.data;
    }
};
