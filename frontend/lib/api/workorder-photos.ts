import apiClient from "./client";

export interface WorkOrderPhoto {
  id: number;
  work_order: number;
  photo: string; // URL
  photo_type: "before" | "during" | "after" | "part" | "other";
  caption?: string;
  description?: string;
  taken_by?: number;
  taken_by_name?: string;
  created_at: string;
}

export interface WorkOrderPhotoCreate {
  work_order: number;
  photo: File;
  photo_type: "before" | "during" | "after" | "part" | "other";
  caption?: string;
  description?: string;
}

export interface WorkOrderPhotoListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: WorkOrderPhoto[];
}

export const workOrderPhotosApi = {
  list: async (params?: {
    work_order?: number;
    photo_type?: string;
  }): Promise<WorkOrderPhoto[]> => {
    const response = await apiClient.get("/workorders/photos/", { params });
    return response.data.results || response.data;
  },

  get: async (id: number): Promise<WorkOrderPhoto> => {
    const response = await apiClient.get(`/workorders/photos/${id}/`);
    return response.data;
  },

  create: async (data: WorkOrderPhotoCreate): Promise<WorkOrderPhoto> => {
    const formData = new FormData();
    formData.append("work_order", data.work_order.toString());
    formData.append("photo", data.photo);
    formData.append("photo_type", data.photo_type);
    if (data.caption) formData.append("caption", data.caption);
    if (data.description) formData.append("description", data.description);

    const response = await apiClient.post("/workorders/photos/", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/workorders/photos/${id}/`);
  },
};

