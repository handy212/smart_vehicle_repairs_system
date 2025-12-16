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
  status: string;
  created_at: string;
  image?: string;
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
  }): Promise<VehicleListResponse> => {
    const response = await apiClient.get("/vehicles/vehicles/", { params });
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
    const response = await apiClient.put(`/vehicles/vehicles/${id}/`, data, {
      headers: data instanceof FormData ? { "Content-Type": "multipart/form-data" } : undefined,
    });
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/vehicles/vehicles/${id}/`);
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
};

