/**
 * Utility functions for exporting data to CSV
 */


export function exportToCSV<T extends Record<string, any>>(
  data: T[],
  filename: string,
  headers: { key: keyof T; label: string }[]
) {
  // Create CSV content
  const csvHeaders = headers.map((h) => h.label).join(",");
  const csvRows = data.map((row) =>
    headers
      .map((header) => {
        const value = row[header.key];
        // Handle null/undefined
        if (value === null || value === undefined) return "";
        // Handle objects (e.g., nested user object)
        if (typeof value === "object") {
          if (value.first_name && value.last_name) {
            return `"${value.first_name} ${value.last_name}"`;
          }
          if (value.name) return `"${value.name}"`;
          if (value.email) return `"${value.email}"`;
          return "";
        }
        // Handle strings with commas or quotes
        const stringValue = String(value);
        if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      })
      .join(",")
  );

  const csvContent = [csvHeaders, ...csvRows].join("\n");

  // Create blob and download
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Format date for CSV export
 */
export function formatDateForCSV(date: string | Date | null | undefined): string {
  if (!date) return "";
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return "";
  }
}

/**
 * Format currency for CSV export
 */
export function formatCurrencyForCSV(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined) return "";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "";
  return num.toFixed(2);
}

