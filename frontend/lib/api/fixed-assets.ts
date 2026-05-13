import apiClient from './client';

export interface FixedAssetCategory {
    id: number;
    name: string;
    description?: string;
    default_useful_life_years: number;
    default_depreciation_method: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface FixedAssetInvoiceReceiptDoc {
    id: number;
    document_number: string;
    title: string;
    acquisition_document_kind: "invoice" | "receipt";
    original_filename: string;
    file: string | null;
    uploaded_at: string | null;
}

export interface FixedAsset {
    id: number;
    asset_number: string;
    name: string;
    description?: string;
    category: number;
    category_name: string;
    acquisition_cost: number;
    acquisition_date: string;
    salvage_value: number;
    depreciation_method: string;
    useful_life_years: number;
    depreciation_start_date: string;
    accumulated_depreciation: number;
    net_book_value: number;
    depreciation_percent: number;
    status: 'active' | 'inactive' | 'disposed' | 'sold' | 'retired';
    branch: number;
    branch_name: string;
    location?: string;
    assigned_to?: number | null;
    assigned_to_name?: string | null;
    manufacturer?: string;
    model_number?: string;
    serial_number?: string;
    last_depreciation_date?: string;
    created_at: string;
    updated_at: string;
    invoice_receipt_documents?: FixedAssetInvoiceReceiptDoc[];
    source_acquisition_request_id?: number | null;
    source_acquisition_request_number?: string | null;
}

export type FixedAssetCreateData = {
    asset_number: string;
    name: string;
    description?: string;
    category: number;
    branch: number;
    acquisition_cost: number;
    acquisition_date: string;
    salvage_value: number;
    depreciation_method: string;
    useful_life_years: number;
    depreciation_start_date: string;
    status: FixedAsset['status'];
    location?: string;
    assigned_to?: number | null;
    manufacturer?: string;
    model_number?: string;
    serial_number?: string;
}

export type FixedAssetUpdateData = Partial<Omit<FixedAssetCreateData, 'asset_number'>> & {
    disposal_date?: string | null;
    disposal_method?: string | null;
    disposal_proceeds?: number | null;
    disposal_notes?: string;
};

export interface FixedAssetStats {
    total_assets: number;
    active_assets: number;
    inactive_assets: number;
    disposed_assets: number;
    fully_depreciated: number;
    total_acquisition_cost: number;
    total_net_book_value: number;
    total_accumulated_depreciation: number;
    avg_depreciation_percent: number;
}

export type AssetAcquisitionStatus =
    | "draft"
    | "pending_approval"
    | "approved"
    | "rejected"
    | "received";

export interface AssetAcquisitionApprovalRow {
    id: number;
    approver: number;
    approver_name?: string;
    status: string;
    approved_at?: string | null;
    rejected_at?: string | null;
    rejection_reason?: string;
    created_at?: string;
}

export interface AssetAcquisitionRequest {
    id: number;
    request_number: string;
    status: AssetAcquisitionStatus;
    title: string;
    description?: string;
    proposed_asset_name: string;
    category: number;
    category_name?: string;
    branch: number;
    branch_name?: string;
    supplier?: number | null;
    supplier_name?: string | null;
    expected_acquisition_cost: number | string;
    salvage_value: number | string;
    depreciation_method?: string | null;
    useful_life_years?: number | null;
    requested_by?: number | null;
    requested_by_name?: string | null;
    submitted_at?: string | null;
    approved_by?: number | null;
    approved_by_name?: string | null;
    approved_at?: string | null;
    rejected_by?: number | null;
    rejected_by_name?: string | null;
    rejected_at?: string | null;
    rejection_reason?: string;
    received_by?: number | null;
    received_by_name?: string | null;
    received_at?: string | null;
    received_notes?: string;
    created_asset_id?: number | null;
    created_asset_number?: string | null;
    approvals?: AssetAcquisitionApprovalRow[];
    approval_summary?: {
        total: number;
        pending: number;
        approved: number;
        rejected: number;
        cancelled: number;
    };
    created_at: string;
    updated_at: string;
}

export type AssetAcquisitionCreatePayload = {
    title: string;
    description?: string;
    proposed_asset_name: string;
    category: number;
    branch: number;
    supplier?: number | null;
    expected_acquisition_cost: number;
    salvage_value?: number;
    depreciation_method?: string | null;
    useful_life_years?: number | null;
};

export const fixedAssetsApi = {
    // Assets
    list: async (params?: {
        status?: string;
        category?: number;
        branch?: number;
        assigned_to?: number;
        search?: string;
    }) => {
        const response = await apiClient.get('/fixed-assets/assets/', { params });
        return response.data;
    },

    get: async (id: number): Promise<FixedAsset> => {
        const response = await apiClient.get(`/fixed-assets/assets/${id}/`);
        return response.data;
    },

    create: async (data: FixedAssetCreateData) => {
        const response = await apiClient.post('/fixed-assets/assets/', data);
        return response.data;
    },

    update: async (id: number, data: FixedAssetUpdateData) => {
        const response = await apiClient.patch(`/fixed-assets/assets/${id}/`, data);
        return response.data;
    },

    delete: async (id: number) => {
        const response = await apiClient.delete(`/fixed-assets/assets/${id}/`);
        return response.data;
    },

    // Statistics
    dashboardStats: async (): Promise<FixedAssetStats> => {
        const response = await apiClient.get('/fixed-assets/assets/dashboard_stats/');
        return response.data;
    },

    active: async () => {
        const response = await apiClient.get('/fixed-assets/assets/active/');
        return response.data;
    },

    // Categories
    categories: {
        list: async () => {
            const response = await apiClient.get('/fixed-assets/categories/');
            return response.data;
        },

        active: async (): Promise<FixedAssetCategory[]> => {
            const response = await apiClient.get('/fixed-assets/categories/active/');
            return response.data;
        },

        get: async (id: number): Promise<FixedAssetCategory> => {
            const response = await apiClient.get(`/fixed-assets/categories/${id}/`);
            return response.data;
        },

        create: async (data: Partial<FixedAssetCategory>) => {
            const response = await apiClient.post('/fixed-assets/categories/', data);
            return response.data;
        },

        update: async (id: number, data: Partial<FixedAssetCategory>) => {
            const response = await apiClient.patch(`/fixed-assets/categories/${id}/`, data);
            return response.data;
        },

        delete: async (id: number) => {
            const response = await apiClient.delete(`/fixed-assets/categories/${id}/`);
            return response.data;
        },
    },

    acquisitions: {
        list: async (params?: { status?: string; branch?: number; category?: number; search?: string }) => {
            const response = await apiClient.get("/fixed-assets/acquisition-requests/", { params });
            return response.data;
        },

        get: async (id: number): Promise<AssetAcquisitionRequest> => {
            const response = await apiClient.get(`/fixed-assets/acquisition-requests/${id}/`);
            return response.data;
        },

        create: async (data: AssetAcquisitionCreatePayload): Promise<AssetAcquisitionRequest> => {
            const response = await apiClient.post("/fixed-assets/acquisition-requests/", data);
            return response.data;
        },

        update: async (id: number, data: Partial<AssetAcquisitionCreatePayload>): Promise<AssetAcquisitionRequest> => {
            const response = await apiClient.patch(`/fixed-assets/acquisition-requests/${id}/`, data);
            return response.data;
        },

        delete: async (id: number) => {
            await apiClient.delete(`/fixed-assets/acquisition-requests/${id}/`);
        },

        submitForApproval: async (id: number, approverIds: number[]) => {
            const response = await apiClient.post(
                `/fixed-assets/acquisition-requests/${id}/submit-for-approval/`,
                { approver_ids: approverIds },
            );
            return response.data;
        },

        approve: async (id: number): Promise<AssetAcquisitionRequest> => {
            const response = await apiClient.post(`/fixed-assets/acquisition-requests/${id}/approve/`);
            return response.data;
        },

        reject: async (id: number, reason?: string): Promise<AssetAcquisitionRequest> => {
            const response = await apiClient.post(`/fixed-assets/acquisition-requests/${id}/reject/`, {
                reason: reason || "",
            });
            return response.data;
        },

        receive: async (
            id: number,
            data: {
                acquisition_cost: number;
                acquisition_date: string;
                depreciation_start_date?: string | null;
                asset_number?: string;
                location?: string;
                manufacturer?: string;
                model_number?: string;
                serial_number?: string;
                supplier?: number | null;
                total_units?: number | null;
                declining_balance_rate?: number | null;
                notes?: string;
                received_notes?: string;
            },
        ): Promise<AssetAcquisitionRequest> => {
            const response = await apiClient.post(`/fixed-assets/acquisition-requests/${id}/receive/`, data);
            return response.data;
        },
    },
};
