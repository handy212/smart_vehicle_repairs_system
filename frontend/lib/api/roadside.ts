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

export type RoadsideAssignmentStatus = "pending" | "accepted" | "rejected";

export interface DispatchedTechnician {
    id: number;
    technician: number;
    technician_name: string;
    dispatched_at: string;
    notes?: string;
    response_status?: RoadsideAssignmentStatus;
    responded_at?: string | null;
    rejection_reason?: string;
}

export interface RoadsideBranchDetail {
    id: number;
    name: string;
    code: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    full_address?: string;
    is_headquarters?: boolean;
}

export interface RoadsideTimelineEntry {
    key: string;
    label: string;
    at: string;
    meta?: string;
    invoice_id?: number;
    invoice_number?: string;
    invoice_status?: string | null;
    invoice_is_paid?: boolean | null;
}

export interface RoadsideNote {
    id: number;
    request: number;
    note: string;
    created_by?: number | null;
    created_by_name?: string | null;
    created_at: string;
    updated_at: string;
}

export interface RoadsidePhoto {
    id: number;
    request: number;
    image: string;
    photo_type: "arrival" | "diagnostic" | "repair" | "damage" | "completion" | "other";
    caption?: string;
    taken_at: string;
    uploaded_by?: number | null;
    uploaded_by_name?: string | null;
    uploaded_at: string;
}

export interface RoadsideRequest {
    id: number;
    request_number: string;
    status: 'requested' | 'dispatched' | 'en_route' | 'on_site' | 'in_progress' | 'completed' | 'cancelled' | 'failed';
    service_type: string;
    customer: number | {
        id: number;
        company_name?: string;
        first_name?: string;
        last_name?: string;
        phone?: string;
        user?: {
            first_name: string;
            last_name: string;
            phone: string;
            email: string;
        };
    };
    vehicle: number | {
        id: number;
        make: string;
        model: string;
        year: number;
        license_plate: string;
        vin?: string;
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
    is_pay_as_you_go?: boolean;
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
    invoice_status?: string | null;
    invoice_status_display?: string | null;
    invoice_total?: string | null;
    invoice_amount_paid?: string | null;
    invoice_amount_due?: string | null;
    invoice_is_paid?: boolean | null;
    work_order?: number | null;
    work_order_number?: string | null;
    can_create_work_order?: boolean;
    subscription_used?: number;
    assigned_technician?: number;
    branch?: number;
    branch_name?: string;
    branch_detail?: RoadsideBranchDetail;
    vehicle_license_plate?: string;
    vehicle_vin?: string;
    customer_number?: string;
    created_by_name?: string;
    timeline?: RoadsideTimelineEntry[];
    available_actions?: string[];
    rating?: number | null;
    site_notes?: RoadsideNote[];
    photos?: RoadsidePhoto[];
    /** Current user's dispatch response (technician mobile) */
    my_assignment_status?: RoadsideAssignmentStatus | null;
}

export type RoadsideRequestDetail = RoadsideRequest;

export interface RoadsideRequestCreate {
    customer?: number;
    vehicle: number;
    branch: number;
    service_type: string;
    breakdown_location: string;
    latitude?: number;
    longitude?: number;
    description?: string;
    customer_phone: string;
    tow_distance_km?: number;
    destination?: string;
    notes?: string;
    charge_amount?: number;
    pay_as_you_go?: boolean;
}

type RoadsideRequestUpdate = Omit<Partial<RoadsideRequest>, "charge_amount"> & {
    charge_amount?: number | string;
};

export const roadsideApi = {
    /**
     * Technician field app: only this user's assignments (active + recent completed).
     */
    getMyAssignments: async (options?: { includeHistory?: boolean }) => {
        const response = await apiClient.get<RoadsideRequest[]>(
            "/roadside/requests/my-assignments/",
            {
                params: options?.includeHistory ? { include_history: "true" } : undefined,
            }
        );
        return Array.isArray(response.data) ? response.data : [];
    },

    /** @deprecated Use getMyAssignments for the technician mobile app */
    getAssignedRequests: async (options?: { includeHistory?: boolean }) => {
        return roadsideApi.getMyAssignments(options);
    },

    /**
     * Get a single request
     */
    getRequest: async (id: number | string) => {
        const response = await apiClient.get<RoadsideRequest>(`/roadside/requests/${id}/`);
        return response.data;
    },

    acceptAssignment: async (id: number | string) => {
        const response = await apiClient.post<RoadsideRequest>(
            `/roadside/requests/${id}/accept-assignment/`
        );
        return response.data;
    },

    rejectAssignment: async (id: number | string, reason?: string) => {
        const response = await apiClient.post<RoadsideRequest>(
            `/roadside/requests/${id}/reject-assignment/`,
            { reason: reason || "" }
        );
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

    createWorkOrder: async (
        id: number | string,
        data?: { odometer_in?: number; job_type_code?: string; priority?: string },
    ) => {
        const response = await apiClient.post<
            RoadsideRequest & {
                work_order_id: number;
                work_order_number: string;
                workflow_message?: string;
            }
        >(`/roadside/requests/${id}/create_work_order/`, data ?? {});
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
        const response = await apiClient.get<RoadsideRequestDetail>(`/roadside/requests/${id}/`);
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
    partialUpdate: async (id: number | string, data: RoadsideRequestUpdate) => {
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
     * Technician: Add an on-site note
     */
    addSiteNote: async (id: number | string, note: string) => {
        const response = await apiClient.post<RoadsideNote>(`/roadside/requests/${id}/site-notes/`, { note });
        return response.data;
    },

    /**
     * Technician: Upload an on-site photo
     */
    uploadSitePhoto: async (
        id: number | string,
        data: { image: File; photo_type?: RoadsidePhoto["photo_type"]; caption?: string }
    ) => {
        const formData = new FormData();
        formData.append("image", data.image);
        formData.append("photo_type", data.photo_type || "other");
        if (data.caption) formData.append("caption", data.caption);

        const response = await apiClient.post<RoadsidePhoto>(`/roadside/requests/${id}/site-photos/`, formData);
        return response.data;
    },

    /**
     * Create a new request (Admin/Manager)
     */

    create: async (data: RoadsideRequestCreate) => {
        const response = await apiClient.post<RoadsideRequest>("/roadside/requests/", data);
        return response.data;
    },

    /**
     * Admin: Delete a request that has not been dispatched
     */
    remove: async (id: number | string) => {
        await apiClient.delete(`/roadside/requests/${id}/`);
    }
};
