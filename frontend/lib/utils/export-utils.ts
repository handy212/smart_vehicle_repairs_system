import * as XLSX from "xlsx-js-style";

/**
 * Export utilities for generating Excel files from array data.
 */

/**
 * Format a cell value for CSV export
 */

export function formatCellValue(value: any): string {
    if (value === null || value === undefined) return '';

    // Handle numbers - preserve precision
    if (typeof value === 'number') {
        return value.toString();
    }

    // Handle strings - escape quotes and wrap in quotes if contains comma/newline
    if (typeof value === 'string') {
        const needsQuotes = value.includes(',') || value.includes('\n') || value.includes('"');
        if (needsQuotes) {
            return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
    }

    return String(value);
}

/**
 * Generate a filename with timestamp
 */
export function generateFilenameWithTimestamp(prefix: string, extension: string = 'xlsx'): string {
    const now = new Date();
    const timestamp = now.toISOString().split('T')[0]; // YYYY-MM-DD
    return `${prefix}_${timestamp}.${extension}`;
}

/**
 * Export data to Excel and trigger download.
 * Kept exportToCSV name for existing callers.
 */
export function exportToCSV(

    data: any[][],
    filename: string,
    headers?: string[]
): void {
    try {
        const rows = headers && headers.length > 0 ? [headers, ...data] : data;
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet(rows);
        worksheet["!cols"] = (rows[0] || []).map((cell) => ({ wch: Math.min(Math.max(String(cell || '').length + 4, 14), 36) }));
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Export');
        const outputFilename = filename.endsWith('.xlsx')
            ? filename
            : filename.replace(/\.csv$/i, '.xlsx');
        XLSX.writeFile(workbook, outputFilename);
    } catch (error) {
        console.error('Error exporting to Excel:', error);
        throw new Error('Failed to export data to Excel');
    }
}

/**
 * Convert financial report data to CSV format
 */
export function exportFinancialReport(

    sections: { title: string; data: any[]; includeInTotal?: boolean }[],
    filename: string,
    headers: string[]
): void {

    const rows: any[][] = [];

    sections.forEach((section, index) => {
        // Add section title as a row
        if (section.title) {
            rows.push([section.title]);
        }

        // Add section data
        section.data.forEach(item => {
            const row = headers.map(header => {
                const key = header.toLowerCase().replace(/ /g, '_');
                return item[key] || item[header] || '';
            });
            rows.push(row);
        });

        // Add empty row between sections
        if (index < sections.length - 1) {
            rows.push([]);
        }
    });

    exportToCSV(rows, filename, headers);
}
