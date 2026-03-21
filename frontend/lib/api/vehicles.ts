import apiClient from "./client";

export interface Vehicle {
  id: number;
  vin: string;
  make: string;
  model: string;
  year: number;

  vin_decoded_data?: any;
  vin_decoded_at?: string | null;
  license_plate?: string;
  exterior_color?: string;
  current_mileage?: number;
  engine_type?: string;
  owner: number | { id: number };
  owner_name?: string;
  status: "active" | "in_service" | "sold" | "totaled" | "inactive" | string;
  created_at: string;
  image?: string;
  vehicle_type?: "other" | "saloon" | "suv" | "pickup" | "minivan" | "motorcycle" | "truck" | string;
  // Legacy fields for backward compatibility
  color?: string;
  mileage?: number;
  fuel_type?: string;
}

export interface VehicleListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Vehicle[];
}

export const vehiclesApi = {
  list: async (params?: {
    page?: number;
    search?: string;
    status?: string;
    owner?: number;
    make?: string;
    model?: string;
    year?: number;
    year__gte?: number;
    year__lte?: number;
    engine_type?: string;
    transmission_type?: string;
    created_at__gte?: string;
    created_at__lte?: string;
    ordering?: string;
    page_size?: number;
  }): Promise<VehicleListResponse> => {
    const response = await apiClient.get("/vehicles/vehicles/", { params });
    return response.data;
  },

  dashboardStats: async (): Promise<{
    total_vehicles: number;
    active_vehicles: number;
    in_service_vehicles: number;
    due_service_vehicles: number;
    sold_vehicles: number;
  }> => {
    const response = await apiClient.get("/vehicles/vehicles/dashboard_stats/");
    return response.data;
  },

  get: async (id: number): Promise<Vehicle> => {
    const response = await apiClient.get(`/vehicles/vehicles/${id}/`);
    return response.data;
  },

  create: async (data: Partial<Vehicle> | FormData): Promise<Vehicle> => {
    const response = await apiClient.post("/vehicles/vehicles/", data, {
      headers: data instanceof FormData ? { "Content-Type": "multipart/form-data" } : undefined,
    });
    return response.data;
  },

  update: async (id: number, data: Partial<Vehicle> | FormData): Promise<Vehicle> => {
    const response = await apiClient.patch(`/vehicles/vehicles/${id}/`, data, {
      headers: data instanceof FormData ? { "Content-Type": "multipart/form-data" } : undefined,
    });
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/vehicles/vehicles/${id}/`);
  },

  reassignOwner: async (
    id: number,
    data: {
      new_owner_id: number;
      transfer_date?: string;
      notes?: string;
    }
  ): Promise<{
    success: boolean;
    message: string;
    vehicle: Vehicle;
    old_owner: { id: number; name: string };
    new_owner: { id: number; name: string };
    transfer_date: string;
  }> => {
    const response = await apiClient.post(`/vehicles/vehicles/${id}/reassign_owner/`, data);
    return response.data;
  },

  getOwnershipHistory: async (id: number): Promise<{
    count: number;
    results: Array<{
      id: number;
      vehicle: number;
      vehicle_display: string;
      previous_owner: number | null;
      previous_owner_name: string;
      new_owner: number;
      new_owner_name: string;
      transfer_date: string;
      transferred_by: number;
      transferred_by_name: string;
      notes: string;
      created_at: string;
    }>;
  }> => {
    const response = await apiClient.get(`/vehicles/vehicles/${id}/ownership_history/`);
    return response.data;
  },

  import: async (file: File): Promise<{ imported: number; skipped: number; errors?: string[] }> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await apiClient.post("/vehicles/vehicles/import_csv/", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  },


  history: async (id: number): Promise<any> => {
    const response = await apiClient.get(`/vehicles/vehicles/${id}/history/`);
    return response.data;
  },

  decodeVin: async (vin: string): Promise<{
    success: boolean;
    exists?: boolean;
    vehicle_id?: number;
    vehicle?: Vehicle;
    vin?: string;
    year?: number;
    make?: string;
    model?: string;
    trim?: string;
    engine_type?: string;
    engine_size?: string;
    transmission_type?: string;
    body_class?: string;
    vehicle_type?: string;
    manufacturer?: string;
    summary?: string;
    has_errors?: boolean;
    error_message?: string;
    // Expanded "Other Information"
    series?: string;
    drive_type?: string;
    gvwr?: string;
    transmission_speeds?: string;
    transmission_style?: string;
    engine_cylinders?: number | null;
    engine_hp?: number | null;
    engine_model?: string;
    engine_manufacturer?: string;
    engine_displacement_l?: string;
    fuel_type_primary?: string;
    fuel_type_secondary?: string;
    electrification_level?: string;
    airbag_front?: string;
    airbag_knee?: string;
    airbag_side?: string;
    airbag_curtain?: string;
    airbag_seat_cushion?: string;
    other_restraint_info?: string;

    full_data?: any;
    error?: string;
  }> => {
    // VIN decode can involve an external API (NHTSA). Allow a bit more time before aborting.
    const response = await apiClient.post("/vehicles/vehicles/decode_vin/", { vin }, { timeout: 20000 });
    return response.data;
  },

  checkLicensePlate: async (licensePlate: string, vehicleId?: number): Promise<{
    success: boolean;
    exists?: boolean;
    vehicle_id?: number;
    vehicle?: Vehicle;
    message?: string;
    error?: string;
  }> => {
    const response = await apiClient.post("/vehicles/vehicles/check_license_plate/", {
      license_plate: licensePlate,
      vehicle_id: vehicleId
    });
    return response.data;
  },

  getServiceTypes: async (): Promise<{
    count: number;
    results: Array<{
      id: number;
      name: string;
      description?: string;
      interval_months?: number;
      interval_miles?: number;
      is_active?: boolean;
      has_bundle?: boolean;
    }>;
  }> => {
    const response = await apiClient.get("/vehicles/service-types/");
    return response.data;
  },

  getSuggestedService: async (id: number): Promise<{
    suggested_service_id: number;
    suggested_service_name: string;
    suggested_bundle_id?: number | null;
    reason: string;
    last_service_id?: number;
    last_service_name?: string;
    last_service_date?: string;
  }> => {
    const response = await apiClient.get(`/vehicles/vehicles/${id}/suggested_service/`);
    return response.data;
  },
};

