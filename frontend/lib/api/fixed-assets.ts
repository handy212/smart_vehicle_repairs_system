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
    manufacturer?: string;
    model_number?: string;
    serial_number?: string;
    last_depreciation_date?: string;
    created_at: string;
    updated_at: string;
}

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

export const fixedAssetsApi = {
    // Assets
    list: async (params?: {
        status?: string;
        category?: number;
        branch?: number;
        search?: string;
    }) => {
        const response = await apiClient.get('/fixed-assets/assets/', { params });
        return response.data;
    },

    get: async (id: number): Promise<FixedAsset> => {
        const response = await apiClient.get(`/fixed-assets/assets/${id}/`);
        return response.data;
    },

    create: async (data: Partial<FixedAsset>) => {
        const response = await apiClient.post('/fixed-assets/assets/', data);
        return response.data;
    },

    update: async (id: number, data: Partial<FixedAsset>) => {
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
};
