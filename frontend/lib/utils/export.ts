import * as XLSX from "xlsx-js-style";
import jsPDF from "jspdf";

/**
 * Utility functions for exporting data.
 * Kept exportToCSV name for existing callers, but it now writes real Excel workbooks.
 */


export function exportToCSV<T extends object>(
  data: T[],
  filename: string,
  headers: { key: keyof T; label: string }[]
) {
  const rows = [
    headers.map((header) => header.label),
    ...data.map((row) => headers.map((header) => formatExportValue(row[header.key]))),
  ];
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!cols"] = headers.map((header) => ({ wch: Math.min(Math.max(header.label.length + 4, 14), 36) }));
  XLSX.utils.book_append_sheet(workbook, worksheet, "Export");
  XLSX.writeFile(workbook, `${filename}_${new Date().toISOString().split("T")[0]}.xlsx`);
}

/** Excel workbook with multiple sheets (e.g. till summary + drawer movements). */
export function exportMultiSheetXlsx(
  sheets: {
    name: string;
    headers: { key: string; label: string }[];
    rows: Record<string, unknown>[];
  }[],
  filename: string
) {
  const dateStamp = new Date().toISOString().split("T")[0];
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const safeName =
      (sheet.name.replace(/[\\/:*?[\]]/g, "_").slice(0, 31)) || "Sheet";
    const headerRow = sheet.headers.map((header) => header.label);
    const dataRows = sheet.rows.map((row) =>
      sheet.headers.map((header) => formatExportValue(row[header.key]))
    );
    const aoa = [headerRow, ...dataRows];
    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    worksheet["!cols"] = sheet.headers.map((header) => ({
      wch: Math.min(Math.max(header.label.length + 4, 14), 40),
    }));
    XLSX.utils.book_append_sheet(workbook, worksheet, safeName);
  }

  XLSX.writeFile(workbook, `${filename}_${dateStamp}.xlsx`);
}

export function exportToPDF<T extends object>(
  data: T[],
  filename: string,
  headers: { key: keyof T; label: string }[],
  title = filename
) {
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const dateStamp = new Date().toISOString().split("T")[0];
  const usableWidth = 760;
  const colWidth = usableWidth / Math.max(headers.length, 1);
  let y = 72;

  pdf.setFontSize(14);
  pdf.text(title, 40, 40);
  pdf.setFontSize(8);
  pdf.text(`Exported ${data.length} records on ${dateStamp}`, 40, 56);

  const drawHeader = () => {
    let x = 40;
    pdf.setFont("helvetica", "bold");
    headers.forEach((header) => {
      pdf.text(header.label, x, y);
      x += colWidth;
    });
    y += 14;
    pdf.setDrawColor(220);
    pdf.line(40, y - 8, 800, y - 8);
    pdf.setFont("helvetica", "normal");
  };

  drawHeader();
  data.forEach((row) => {
    if (y > 560) {
      pdf.addPage();
      y = 48;
      drawHeader();
    }
    let x = 40;
    headers.forEach((header) => {
      pdf.text(formatExportValue(row[header.key]).slice(0, Math.max(10, Math.floor(colWidth / 5))), x, y);
      x += colWidth;
    });
    y += 16;
  });

  pdf.save(`${filename}_${dateStamp}.pdf`);
}

function formatExportValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.first_name && record.last_name) return `${record.first_name} ${record.last_name}`;
    if (record.name) return String(record.name);
    if (record.email) return String(record.email);
    return "";
  }
  return String(value);
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
