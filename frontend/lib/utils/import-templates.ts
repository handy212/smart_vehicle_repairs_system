import * as XLSX from "xlsx-js-style";

/**
 * Utility functions for generating import templates
 */

export function downloadCSVTemplate(headers: string[], sampleRows: string[][], filename: string) {
  // Create CSV content
  const csvHeaders = headers.map((h) => `"${h}"`).join(",");
  const csvRows = sampleRows.map((row) => row.map((cell) => `"${cell}"`).join(","));
  const csvContent = [csvHeaders, ...csvRows].join("\n");

  // Create blob and download
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadExcelTemplate(headers: string[], sampleRows: string[][], filename: string) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);

  worksheet["!cols"] = headers.map((header) => ({ wch: Math.min(Math.max(header.length + 2, 14), 32) }));

  headers.forEach((_, index) => {
    const address = XLSX.utils.encode_cell({ r: 0, c: index });
    if (worksheet[address]) {
      worksheet[address].s = {
        font: { bold: true, color: { rgb: "111827" } },
        fill: { fgColor: { rgb: "E5E7EB" } },
        alignment: { horizontal: "left", vertical: "center" },
      };
    }
  });

  XLSX.utils.book_append_sheet(workbook, worksheet, "Import Template");
  XLSX.writeFile(workbook, filename);
}

export function getCustomerImportTemplate() {
  const headers = [
    "first_name",
    "last_name",
    "email",
    "phone",
    "company_name",
    "customer_type",
    "status",
    "service_address",
    "service_region",
    "service_city",
    "service_area",
    "billing_address",
    "billing_region",
    "billing_city",
    "billing_area",
    "payment_terms",
    "preferred_contact_method",
  ];

  const sampleRows = [
    [
      "John",
      "Doe",
      "john.doe@example.com",
      "0244123456",
      "",
      "individual",
      "active",
      "12 Liberation Rd",
      "Greater Accra",
      "Accra",
      "Osu",
      "12 Liberation Rd",
      "Greater Accra",
      "Accra",
      "Osu",
      "due_on_receipt",
      "email",
    ],
    [
      "Jane",
      "Smith",
      "jane.smith@example.com",
      "0244987654",
      "Smith Auto Repair",
      "business",
      "active",
      "45 Ring Road",
      "Greater Accra",
      "Accra",
      "East Legon",
      "45 Ring Road",
      "Greater Accra",
      "Accra",
      "East Legon",
      "net_30",
      "phone",
    ],
  ];

  return { headers, sampleRows };
}

export function getVehicleImportTemplate() {
  const headers = [
    "vin",
    "make",
    "model",
    "year",
    "license_plate",
    "owner",
    "exterior_color",
    "current_mileage",
    "engine_type",
    "transmission_type",
    "status",
  ];

  const sampleRows = [
    [
      "1HGBH41JXMN109186",
      "Honda",
      "Accord",
      "2021",
      "ABC-1234",
      "john.doe@example.com",
      "Blue",
      "25000",
      "gasoline",
      "automatic",
      "active",
    ],
    [
      "5YJSA1E14HF123456",
      "Tesla",
      "Model 3",
      "2023",
      "XYZ-5678",
      "jane.smith@example.com",
      "White",
      "15000",
      "electric",
      "automatic",
      "active",
    ],
  ];

  return { headers, sampleRows };
}

export function getPartImportTemplate() {
  const headers = [
    "part_number",
    "name",
    "description",
    "category",
    "manufacturer",
    "manufacturer_part_number",
    "cost_price",
    "selling_price",
    "quantity_in_stock",
    "minimum_stock",
    "reorder_point",
    "reorder_quantity",
    "bin_location",
    "is_taxable",
    "is_core",
    "core_charge",
    "unit_of_measure",
    "compatible_makes",
    "compatible_models",
    "compatible_years",
    "is_active",
  ];

  const sampleRows = [
    [
      "OIL-FILTER-001",
      "Engine Oil Filter",
      "Premium engine oil filter for most vehicles",
      "Filters",
      "ACDelco",
      "PF1234",
      "12.50",
      "24.99",
      "50",
      "10",
      "15",
      "25",
      "A-12-3",
      "true",
      "false",
      "0.00",
      "piece",
      "Toyota, Honda",
      "Camry, Accord",
      "2015-2023",
      "true",
    ],
    [
      "BRAKE-PAD-FRONT",
      "Front Brake Pads",
      "Ceramic front brake pads set",
      "Brakes",
      "Bosch",
      "BC1234",
      "45.00",
      "89.99",
      "20",
      "5",
      "8",
      "15",
      "B-5-2",
      "true",
      "true",
      "15.00",
      "set",
      "Toyota",
      "Camry",
      "2018-2024",
      "true",
    ],
  ];

  return { headers, sampleRows };
}

export function downloadCustomerTemplate() {
  const { headers, sampleRows } = getCustomerImportTemplate();
  downloadExcelTemplate(headers, sampleRows, "customer_import_template.xlsx");
}

export function downloadVehicleTemplate() {
  const { headers, sampleRows } = getVehicleImportTemplate();
  downloadExcelTemplate(headers, sampleRows, "vehicle_import_template.xlsx");
}

export function downloadPartTemplate() {
  const { headers, sampleRows } = getPartImportTemplate();
  downloadExcelTemplate(headers, sampleRows, "part_import_template.xlsx");
}
