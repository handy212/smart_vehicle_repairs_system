import jsPDF from "jspdf";
import { exportToExcel } from "@/lib/utils/excel-export";
import { exportToCSV } from "@/lib/utils/export-utils";
import { exportMultiSheetXlsx } from "@/lib/utils/export";

export type TableExportPayload = {
  headers: string[];
  /** Raw values; currency columns can stay numeric for Excel */
  rows: (string | number)[][];
  /** Base filename without extension */
  filename: string;
  reportTitle: string;
  dateInfo?: string;
  /** Column indexes (0-based) to treat as money */
  currencyColumnIndexes?: number[];
  formatCurrency?: (amount: number | string | null | undefined) => string;
  currencySymbol?: string;
};

export type SheetExportSection = {
  name: string;
  headers: { key: string; label: string }[];
  rows: Record<string, unknown>[];
  currencyKeys?: string[];
};

const PAGE_W = 842;
const PAGE_H = 595;
const MARGIN_X = 36;
const MARGIN_TOP = 36;
const MARGIN_BOTTOM = 40;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const MAX_Y = PAGE_H - MARGIN_BOTTOM;
const LINE_HEIGHT = 10;
const CELL_PAD_X = 4;
const CELL_PAD_Y = 3;
const BODY_FONT = 8;
const HEADER_FONT = 9;

function ensureExtension(filename: string, ext: string) {
  return filename.toLowerCase().endsWith(ext) ? filename : `${filename}${ext}`;
}

function cellText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function isNumericCell(value: string | number): boolean {
  if (typeof value === "number" && !Number.isNaN(value)) return true;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return true;
  return false;
}

function formatCellForPdf(
  value: string | number,
  colIndex: number,
  payload: TableExportPayload
): string {
  const currencyCols = payload.currencyColumnIndexes ?? [];
  if (payload.formatCurrency && currencyCols.includes(colIndex) && isNumericCell(value)) {
    const n = typeof value === "number" ? value : Number(value);
    return payload.formatCurrency(n);
  }
  return cellText(value);
}

function computeColumnWidths(
  pdf: jsPDF,
  headers: string[],
  rows: string[][],
  totalWidth: number
): number[] {
  const minCol = 48;
  const colCount = headers.length;
  if (colCount === 0) return [];

  pdf.setFontSize(BODY_FONT);
  const measure = (text: string) => pdf.getTextWidth(text) + CELL_PAD_X * 2;

  const natural = headers.map((header, colIndex) => {
    let maxW = measure(header);
    for (const row of rows) {
      const w = measure(cellText(row[colIndex]));
      if (w > maxW) maxW = w;
    }
    return Math.max(minCol, maxW);
  });

  const sum = natural.reduce((a, b) => a + b, 0);
  if (sum <= totalWidth) {
    const extra = totalWidth - sum;
    return natural.map((w) => w + (extra * w) / sum);
  }
  return natural.map((w) => (w / sum) * totalWidth);
}

function wrapCell(pdf: jsPDF, text: string, width: number): string[] {
  const inner = Math.max(20, width - CELL_PAD_X * 2);
  const lines = pdf.splitTextToSize(text, inner);
  return lines.length > 0 ? lines : [""];
}

function rowBlockHeight(lineCount: number): number {
  return lineCount * LINE_HEIGHT + CELL_PAD_Y * 2;
}

function pdfRowsFromPayload(payload: TableExportPayload): string[][] {
  return payload.rows.map((row) =>
    row.map((cell, colIndex) => formatCellForPdf(cell, colIndex, payload))
  );
}

/** Export a single table to .xlsx (formatted) */
export function exportTableToExcel(payload: TableExportPayload) {
  const { headers, rows, filename, reportTitle, dateInfo, currencyColumnIndexes, currencySymbol } =
    payload;
  const data = [headers, ...rows];
  exportToExcel(data, ensureExtension(filename, ".xlsx"), {
    sheetName: "Report",
    reportTitle,
    dateInfo,
    freezePane: { row: 1, col: 0 },
    currencyColumns: currencyColumnIndexes ?? [],
    currencySymbol: currencySymbol ?? "$",
  });
}

/** Export a single table to .pdf (landscape, wrapped cells) */
export function exportTableToPdf(payload: TableExportPayload) {
  const { headers, rows, filename, reportTitle, dateInfo } = payload;
  if (headers.length === 0) return;

  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const displayRows = pdfRowsFromPayload(payload);
  const colWidths = computeColumnWidths(pdf, headers, displayRows, CONTENT_W);

  let y = MARGIN_TOP;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text(reportTitle, MARGIN_X, y);
  y += 18;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(BODY_FONT);
  const meta = [
    `Exported ${rows.length} row(s) on ${new Date().toLocaleDateString()}`,
    dateInfo,
  ].filter(Boolean) as string[];
  meta.forEach((line) => {
    pdf.splitTextToSize(line, CONTENT_W).forEach((part: string) => {
      pdf.text(part, MARGIN_X, y);
      y += LINE_HEIGHT;
    });
  });
  y += 8;

  const drawTableHeader = () => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(HEADER_FONT);
    const headerLines = headers.map((h, i) => wrapCell(pdf, h, colWidths[i]));
    const lineCount = Math.max(...headerLines.map((l) => l.length), 1);
    const blockH = rowBlockHeight(lineCount);

    if (y + blockH > MAX_Y) {
      pdf.addPage();
      y = MARGIN_TOP;
    }

    let x = MARGIN_X;
    headerLines.forEach((lines, i) => {
      lines.forEach((line, li) => {
        pdf.text(line, x + CELL_PAD_X, y + CELL_PAD_Y + (li + 1) * LINE_HEIGHT);
      });
      x += colWidths[i];
    });

    y += blockH;
    pdf.setDrawColor(180);
    pdf.setLineWidth(0.5);
    pdf.line(MARGIN_X, y - 2, MARGIN_X + CONTENT_W, y - 2);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(BODY_FONT);
  };

  drawTableHeader();

  displayRows.forEach((row) => {
    const cellLines = headers.map((_, colIndex) =>
      wrapCell(pdf, cellText(row[colIndex]), colWidths[colIndex])
    );
    const lineCount = Math.max(...cellLines.map((l) => l.length), 1);
    const blockH = rowBlockHeight(lineCount);

    if (y + blockH > MAX_Y) {
      pdf.addPage();
      y = MARGIN_TOP;
      drawTableHeader();
    }

    let x = MARGIN_X;
    cellLines.forEach((lines, i) => {
      lines.forEach((line, li) => {
        pdf.text(line, x + CELL_PAD_X, y + CELL_PAD_Y + (li + 1) * LINE_HEIGHT);
      });
      x += colWidths[i];
    });

    y += blockH;
    pdf.setDrawColor(230);
    pdf.setLineWidth(0.25);
    pdf.line(MARGIN_X, y, MARGIN_X + CONTENT_W, y);
  });

  pdf.save(ensureExtension(filename, ".pdf"));
}

/** Multi-sheet workbook for reports with several tables (numeric cells preserved) */
export async function exportSheetsToExcel(sections: SheetExportSection[], filename: string) {
  await exportMultiSheetXlsx(
    sections.map((section) => ({
      name: section.name,
      headers: section.headers,
      rows: section.rows,
    })),
    filename.replace(/\.xlsx$/i, "")
  );
}

export function runTableExport(
  payload: TableExportPayload,
  format: "xlsx" | "pdf" | "csv"
) {
  if (format === "csv") {
    const rows = [payload.headers, ...payload.rows];
    exportToCSV(
      rows,
      ensureExtension(payload.filename, ".csv"),
      payload.headers
    );
    return;
  }
  if (format === "xlsx") {
    exportTableToExcel(payload);
  } else {
    exportTableToPdf(payload);
  }
}
