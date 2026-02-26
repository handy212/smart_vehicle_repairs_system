/**
 * Export utilities for generating CSV files from data
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
export function generateFilenameWithTimestamp(prefix: string, extension: string = 'csv'): string {
    const now = new Date();
    const timestamp = now.toISOString().split('T')[0]; // YYYY-MM-DD
    return `${prefix}_${timestamp}.${extension}`;
}

/**
 * Export data to CSV and trigger download
 */
export function exportToCSV(

    data: any[][],
    filename: string,
    headers?: string[]
): void {
    try {
        // Build CSV content
        const rows: string[] = [];

        // Add headers if provided
        if (headers && headers.length > 0) {
            rows.push(headers.map(formatCellValue).join(','));
        }

        // Add data rows
        data.forEach(row => {
            rows.push(row.map(formatCellValue).join(','));
        });

        const csvContent = rows.join('\n');

        // Create blob and download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error exporting to CSV:', error);
        throw new Error('Failed to export data to CSV');
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
