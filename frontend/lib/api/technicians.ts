import apiClient from "./client";

export interface Skill {
    id: number;
    name: string;
    description?: string;
    is_active: boolean;
}

export interface Technician {
    id: number;
    user: number;
    user_details?: {
        id: number;
        email: string;
        first_name: string;
        last_name: string;
        full_name?: string;
        phone?: string;
        profile_picture?: string;
        role?: string;
        branch?: number;
        branch_name?: string;
    };
    staff_id?: number | null;
    bio?: string;
    skills: Skill[];
    years_of_experience: number;
    current_status: 'available' | 'busy' | 'break' | 'offline';
    last_latitude?: string;
    last_longitude?: string;
    last_location_update?: string;
    created_at: string;
    updated_at: string;
}

export interface CreateTechnicianData {
    email: string;
    first_name: string;
    last_name: string;
    password?: string;
    phone?: string;
    role?: "technician" | "service_coordinator";
    bio?: string;
    skill_ids?: number[];
    years_of_experience?: number;
}

export interface TechnicianListResponse {
    count: number;
    next: string | null;
    previous: string | null;
    results: Technician[];
}

export const techniciansApi = {
    list: async (params?: {
        page?: number;
        search?: string;
        status?: string;
        skills?: string; // Comma separated IDs
    }): Promise<TechnicianListResponse> => {
        const response = await apiClient.get("/technicians/technicians/", { params });
        return response.data;
    },

    get: async (id: number): Promise<Technician> => {
        const response = await apiClient.get(`/technicians/technicians/${id}/`);
        return response.data;
    },

    create: async (data: CreateTechnicianData): Promise<Technician> => {
        const response = await apiClient.post("/technicians/technicians/", data);
        return response.data;
    },

    update: async (id: number, data: Partial<Technician>): Promise<Technician> => {
        const response = await apiClient.patch(`/technicians/technicians/${id}/`, data);
        return response.data;
    },

    delete: async (id: number): Promise<void> => {
        await apiClient.delete(`/technicians/technicians/${id}/`);
    },

    updateLocation: async (id: number, latitude: number, longitude: number): Promise<void> => {
        await apiClient.post(`/technicians/technicians/${id}/update-location/`, { latitude, longitude });
    },

    getMyProfile: async (): Promise<Technician> => {
        const response = await apiClient.get("/technicians/technicians/me/");
        return response.data;
    },

    getShifts: async (id: number, params?: { start?: string; end?: string }): Promise<Shift[]> => {
        const response = await apiClient.get(`/technicians/technicians/${id}/shifts/`, { params });
        return response.data;
    },

    getJobHistory: async (id: number): Promise<JobHistoryItem[]> => {
        const response = await apiClient.get(`/technicians/technicians/${id}/job_history/`);
        return response.data;
    },

    getPerformanceMetrics: async (id: number, period?: string): Promise<PerformanceMetrics> => {
        const response = await apiClient.get(`/technicians/technicians/${id}/performance_metrics/`, {
            params: period ? { period } : undefined
        });
        return response.data;
    },
};

export interface PerformanceMetrics {
    productivity: {
        total_jobs: number;
        completed_jobs: number;
        in_progress_jobs: number;
        completion_rate: number;
        avg_completion_days: number;
    };
    financial: {
        total_revenue: number;
        avg_job_value: number;
    };
    availability: {
        total_hours_worked: number;
        overtime_hours: number;
        active_days: number;
    };
    period: string;
}

export interface Shift {
    id: number;
    technician: number;
    technician_name?: string;
    start_time: string;
    end_time: string;
    status: 'scheduled' | 'active' | 'completed' | 'absent' | 'cancelled';
    notes?: string;
    actual_start_time?: string | null;
    actual_end_time?: string | null;
    break_duration?: string;
    actual_hours?: number | null;
    overtime_hours?: number;
    scheduled_hours?: number;
    created_at: string;
    updated_at: string;
}

export interface JobHistoryItem {
    id: number;
    work_order_number: string;
    customer_name: string;
    vehicle_info: string;
    status: string;
    status_display: string;
    completed_at: string;
    actual_total: string; // Decimal field comes as string often, or number? Serializer defaults to string for decimals usually unless configured. safely assume string or number. Serializer default is string for DecimalField.
}

export const skillsApi = {
    list: async (): Promise<Skill[]> => {
        // Note: The router registers 'skills' at /technicians/skills/
        const response = await apiClient.get("/technicians/skills/");
        return response.data.results || response.data; // Handle pagination if present, or list
    },

    create: async (data: Partial<Skill>): Promise<Skill> => {
        const response = await apiClient.post("/technicians/skills/", data);
        return response.data;
    },

    update: async (id: number, data: Partial<Skill>): Promise<Skill> => {
        const response = await apiClient.patch(`/technicians/skills/${id}/`, data);
        return response.data;
    },

    delete: async (id: number): Promise<void> => {
        await apiClient.delete(`/technicians/skills/${id}/`);
    },
};

export interface Certification {
    id: number;
    technician: number;
    technician_name?: string;
    name: string;
    certification_number: string;
    issuing_authority: string;
    issue_date: string;
    expiry_date?: string | null;
    status: 'active' | 'expired' | 'pending_renewal' | 'suspended';
    document_file?: string | null;
    notes?: string;
    is_expiring_soon: boolean;
    days_until_expiry: number | null;
    is_expired: boolean;
    created_at: string;
    updated_at: string;
}

export const certificationsApi = {
    list: async (params?: { technician?: number; status?: string }): Promise<Certification[]> => {
        const response = await apiClient.get("/technicians/certifications/", { params });
        return response.data;
    },

    get: async (id: number): Promise<Certification> => {
        const response = await apiClient.get(`/technicians/certifications/${id}/`);
        return response.data;
    },

    create: async (data: Partial<Certification>): Promise<Certification> => {
        const response = await apiClient.post("/technicians/certifications/", data);
        return response.data;
    },

    update: async (id: number, data: Partial<Certification>): Promise<Certification> => {
        const response = await apiClient.patch(`/technicians/certifications/${id}/`, data);
        return response.data;
    },

    delete: async (id: number): Promise<void> => {
        await apiClient.delete(`/technicians/certifications/${id}/`);
    },

    getExpiringSoon: async (): Promise<Certification[]> => {
        const response = await apiClient.get("/technicians/certifications/expiring-soon/");
        return response.data;
    },

    uploadDocument: async (id: number, file: File): Promise<Certification> => {
        const formData = new FormData();
        formData.append('document_file', file);
        const response = await apiClient.patch(`/technicians/certifications/${id}/`, formData);
        return response.data;
    },
};

export const shiftsApi = {
    clockIn: async (shiftId: number): Promise<Shift> => {
        const response = await apiClient.post(`/technicians/shifts/${shiftId}/clock_in/`);
        return response.data;
    },

    clockOut: async (shiftId: number): Promise<Shift> => {
        const response = await apiClient.post(`/technicians/shifts/${shiftId}/clock_out/`);
        return response.data;
    },

    addBreak: async (shiftId: number, durationMinutes: number): Promise<Shift> => {
        const response = await apiClient.post(`/technicians/shifts/${shiftId}/add_break/`, {
            duration: durationMinutes
        });
        return response.data;
    },
};
