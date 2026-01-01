import apiClient from "./client";

export interface Document {
    id: number;
    title: string;
    description?: string;
    file: string; // URL
    file_type: string;
    file_size: number;
    original_filename: string;
    uploaded_at: string;
    uploaded_by: number;
    uploaded_by_name?: string;
    uploaded_by_email?: string;
    customer?: number;
    vehicle?: number;
    work_order?: number;
    access_count: number;
    tags?: string;
}

export const documentsApi = {
    list: async (params?: {
        customer?: number;
        vehicle?: number;
        work_order?: number;
        search?: string;
        page?: number;
    }): Promise<{ count: number; results: Document[] }> => {
        const response = await apiClient.get("/documents/documents/", { params });
        return response.data;
    },

    create: async (data: FormData): Promise<Document> => {
        const response = await apiClient.post("/documents/documents/", data, {
            headers: {
                "Content-Type": "multipart/form-data",
            },
        });
        return response.data;
    },

    delete: async (id: number): Promise<void> => {
        await apiClient.delete(`/documents/documents/${id}/`);
    },

    download: async (id: number): Promise<Blob> => {
        const response = await apiClient.get(`/documents/documents/${id}/download/`, {
            responseType: "blob",
        });
        return response.data;
    },
};
