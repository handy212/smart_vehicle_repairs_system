/**
 * Utility functions for exporting data in import-compatible format
 */

import { exportToCSV } from "./export";

/**
 * Export customers in import-compatible format
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function exportCustomersForImport(customers: any[]) {
  const headers = [
    { key: "first_name" as const, label: "first_name" },
    { key: "last_name" as const, label: "last_name" },
    { key: "email" as const, label: "email" },
    { key: "phone" as const, label: "phone" },
    { key: "company_name" as const, label: "company_name" },
    { key: "customer_type" as const, label: "customer_type" },
    { key: "status" as const, label: "status" },
    { key: "service_address" as const, label: "service_address" },
    { key: "service_city" as const, label: "service_city" },
    { key: "service_state" as const, label: "service_state" },
    { key: "service_zip_code" as const, label: "service_zip_code" },
    { key: "billing_address" as const, label: "billing_address" },
    { key: "billing_city" as const, label: "billing_city" },
    { key: "billing_state" as const, label: "billing_state" },
    { key: "billing_zip_code" as const, label: "billing_zip_code" },
    { key: "payment_terms" as const, label: "payment_terms" },
    { key: "preferred_contact_method" as const, label: "preferred_contact_method" },
  ];

  const exportData = customers.map((customer) => {
    const user = typeof customer.user === "object" ? customer.user : null;
    return {
      first_name: user?.first_name || "",
      last_name: user?.last_name || "",
      email: user?.email || "",
      phone: user?.phone || customer.phone || "",
      company_name: customer.company_name || "",
      customer_type: customer.customer_type || "",
      status: customer.status || "active",
      service_address: customer.service_address || "",
      service_city: customer.service_city || "",
      service_state: customer.service_state || "",
      service_zip_code: customer.service_zip_code || "",
      billing_address: customer.billing_address || "",
      billing_city: customer.billing_city || "",
      billing_state: customer.billing_state || "",
      billing_zip_code: customer.billing_zip_code || "",
      payment_terms: customer.payment_terms || "",
      preferred_contact_method: customer.preferred_contact_method || "",
    };
  });

  exportToCSV(exportData, "customers_export", headers);
}

/**
 * Export vehicles in import-compatible format
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function exportVehiclesForImport(vehicles: any[]) {
  const headers = [
    { key: "vin" as const, label: "vin" },
    { key: "make" as const, label: "make" },
    { key: "model" as const, label: "model" },
    { key: "year" as const, label: "year" },
    { key: "license_plate" as const, label: "license_plate" },
    { key: "owner" as const, label: "owner" },
    { key: "exterior_color" as const, label: "exterior_color" },
    { key: "current_mileage" as const, label: "current_mileage" },
    { key: "engine_type" as const, label: "engine_type" },
    { key: "transmission_type" as const, label: "transmission_type" },
    { key: "status" as const, label: "status" },
  ];

  const exportData = vehicles.map((vehicle) => {
    const owner = typeof vehicle.owner === "object" ? vehicle.owner : null;
    const ownerUser = owner?.user ? (typeof owner.user === "object" ? owner.user : null) : null;
    const ownerEmail = ownerUser?.email || "";

    return {
      vin: vehicle.vin || "",
      make: vehicle.make || "",
      model: vehicle.model || "",
      year: vehicle.year?.toString() || "",
      license_plate: vehicle.license_plate || "",
      owner: ownerEmail,
      exterior_color: vehicle.exterior_color || "",
      current_mileage: vehicle.current_mileage?.toString() || "",
      engine_type: vehicle.engine_type || "",
      transmission_type: vehicle.transmission_type || "",
      status: vehicle.status || "active",
    };
  });

  exportToCSV(exportData, "vehicles_export", headers);
}

/**
 * Export parts in import-compatible format
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function exportPartsForImport(parts: any[]) {
  const headers = [
    { key: "part_number" as const, label: "part_number" },
    { key: "name" as const, label: "name" },
    { key: "description" as const, label: "description" },
    { key: "category" as const, label: "category" },
    { key: "manufacturer" as const, label: "manufacturer" },
    { key: "manufacturer_part_number" as const, label: "manufacturer_part_number" },
    { key: "cost_price" as const, label: "cost_price" },
    { key: "selling_price" as const, label: "selling_price" },
    { key: "quantity_in_stock" as const, label: "quantity_in_stock" },
    { key: "minimum_stock" as const, label: "minimum_stock" },
    { key: "reorder_point" as const, label: "reorder_point" },
    { key: "reorder_quantity" as const, label: "reorder_quantity" },
    { key: "bin_location" as const, label: "bin_location" },
    { key: "is_taxable" as const, label: "is_taxable" },
    { key: "is_core" as const, label: "is_core" },
    { key: "core_charge" as const, label: "core_charge" },
    { key: "unit_of_measure" as const, label: "unit_of_measure" },
    { key: "is_active" as const, label: "is_active" },
  ];

  const exportData = parts.map((part) => {
    const category = typeof part.category === "object" ? part.category : null;

    return {
      part_number: part.part_number || "",
      name: part.name || "",
      description: part.description || "",
      category: category?.name || "",
      manufacturer: part.manufacturer || "",
      manufacturer_part_number: part.manufacturer_part_number || "",
      cost_price: part.cost_price?.toString() || "0.00",
      selling_price: part.selling_price?.toString() || "0.00",
      quantity_in_stock: part.quantity_in_stock?.toString() || "0",
      minimum_stock: part.minimum_stock?.toString() || "0",
      reorder_point: part.reorder_point?.toString() || "0",
      reorder_quantity: part.reorder_quantity?.toString() || "0",
      bin_location: part.bin_location || "",
      is_taxable: part.is_taxable ? "true" : "false",
      is_core: part.is_core ? "true" : "false",
      core_charge: part.core_charge?.toString() || "0.00",
      unit_of_measure: part.unit_of_measure || "each",
      is_active: part.is_active !== false ? "true" : "false",
    };
  });

  exportToCSV(exportData, "parts_export", headers);
}

