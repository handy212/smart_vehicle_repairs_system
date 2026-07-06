import type { RoadsideRequest } from "@/lib/api/roadside";

export function getRoadsideCustomerLabel(request: RoadsideRequest): string {
  if (request.customer_name?.trim()) return request.customer_name.trim();
  if (typeof request.customer === "object" && request.customer) {
    const c = request.customer;
    const personal = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
    if (personal) return personal;
    if (c.company_name) return c.company_name;
  }
  return "Customer";
}

export function getRoadsideVehicleLabel(request: RoadsideRequest): string {
  if (request.vehicle_display?.trim()) return request.vehicle_display.trim();
  if (typeof request.vehicle === "object" && request.vehicle) {
    const v = request.vehicle;
    return [v.year, v.make, v.model].filter(Boolean).join(" ") || "Vehicle";
  }
  return "Vehicle details unavailable";
}

export function getRoadsideVehiclePlate(request: RoadsideRequest): string | null {
  if (request.vehicle_license_plate) return request.vehicle_license_plate;
  if (typeof request.vehicle === "object" && request.vehicle?.license_plate) {
    return request.vehicle.license_plate;
  }
  return null;
}

export function getRoadsideVehicleVin(request: RoadsideRequest): string | null {
  if (request.vehicle_vin) return request.vehicle_vin;
  if (typeof request.vehicle === "object" && request.vehicle?.vin) {
    return request.vehicle.vin;
  }
  return null;
}
