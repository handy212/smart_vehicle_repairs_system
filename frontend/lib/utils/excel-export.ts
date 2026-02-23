import * as XLSX from 'xlsx-js-style';

/**
 * Enhanced Excel export options
 */
export interface ExcelExportOptions {
    sheetName?: string;
    headers?: string[];
    boldRows?: number[];
    currencyColumns?: number[];
    colorRows?: { row: number; color: string }[];
    freezePane?: { row: number; col: number }; // Freeze rows/columns for scrolling
    companyName?: string;
    reportTitle?: string;
    dateInfo?: string;
    showTimestamp?: boolean;
}

/**
 * Export data to Excel (.xlsx) with professional formatting
 */
export function exportToExcel(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any[][],
    filename: string,
    options: ExcelExportOptions = {}
): void {
    try {
        const {
            sheetName = 'Sheet1',
            boldRows = [],
            currencyColumns = [],
            colorRows = [],
            freezePane,
            companyName,  // No default - let caller provide it
            showTimestamp = true
        } = options;

        // Create workbook and worksheet
        const wb = XLSX.utils.book_new();

        // Add professional header rows if requested
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const headerRows: any[][] = [];
        let dataStartRow = 0;

        if (companyName || options.reportTitle) {
            // Company name
            if (companyName) {
                headerRows.push([companyName]);
                dataStartRow++;
            }

            // Report title
            if (options.reportTitle) {
                headerRows.push([options.reportTitle]);
                dataStartRow++;
            }

            // Date info
            if (options.dateInfo) {
                headerRows.push([options.dateInfo]);
                dataStartRow++;
            }

            // Timestamp
            if (showTimestamp) {
                const now = new Date();
                headerRows.push([`Generated: ${now.toLocaleString()} `]);
                dataStartRow++;
            }

            headerRows.push([]); // Empty row for spacing
            dataStartRow++;
        }

        // Combine header and data
        const fullData = [...headerRows, ...data];
        const ws = XLSX.utils.aoa_to_sheet(fullData);

        // Calculate column widths based on content
        const colWidths = fullData[0]?.map((_, colIndex) => {
            const maxLength = Math.max(
                ...fullData.map(row => {
                    const cell = row[colIndex];
                    return cell ? String(cell).length : 0;
                })
            );
            return { wch: Math.min(Math.max(maxLength + 2, 12), 50) };
        }) || [];

        ws['!cols'] = colWidths;

        // Apply formatting
        if (ws['!ref']) {
            const range = XLSX.utils.decode_range(ws['!ref']);

            // Define border style (apply to all cells)
            const thinBorder = {
                top: { style: "thin", color: { rgb: "D1D5DB" } },
                bottom: { style: "thin", color: { rgb: "D1D5DB" } },
                left: { style: "thin", color: { rgb: "D1D5DB" } },
                right: { style: "thin", color: { rgb: "D1D5DB" } }
            };

            const mediumBorder = {
                top: { style: "medium", color: { rgb: "6B7280" } },
                bottom: { style: "medium", color: { rgb: "6B7280" } },
                left: { style: "medium", color: { rgb: "6B7280" } },
                right: { style: "medium", color: { rgb: "6B7280" } }
            };

            for (let R = range.s.r; R <= range.e.r; ++R) {
                for (let C = range.s.c; C <= range.e.c; ++C) {
                    const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
                    if (!ws[cellAddress]) continue;

                    const value = ws[cellAddress].v;
                    const adjustedRow = R - dataStartRow;

                    // Initialize cell style with borders
                    ws[cellAddress].s = {
                        border: thinBorder,
                        alignment: { vertical: "center", horizontal: "left", wrapText: false }
                    };

                    // Company header styling (first few rows)
                    if (R < dataStartRow - 1) {
                        ws[cellAddress].s = {
                            font: { bold: true, sz: R === 0 ? 16 : 13, color: { rgb: "1F2937" } },
                            fill: { fgColor: { rgb: R === 0 ? "DBEAFE" : "F3F4F6" } }, // Blue tint for company, gray for rest
                            alignment: { vertical: "center", horizontal: "left" },
                            border: R === 0 ? mediumBorder : thinBorder
                        };
                    }
                    // Regular data formatting
                    else if (R >= dataStartRow) {
                        // Bold specific rows (section headers, totals)
                        if (boldRows.includes(adjustedRow)) {
                            ws[cellAddress].s.font = { bold: true, sz: 11, color: { rgb: "111827" } };
                            ws[cellAddress].s.fill = { fgColor: { rgb: "F3F4F6" } };
                            ws[cellAddress].s.alignment = {
                                vertical: "center",
                                horizontal: C === 0 ? "left" : "right"
                            };
                            ws[cellAddress].s.border = thinBorder;
                        }

                        // Currency formatting and conditional coloring
                        if (currencyColumns.includes(C) && typeof value === 'number') {
                            const isNegative = value < 0;

                            ws[cellAddress].t = 'n';
                            ws[cellAddress].z = '$#,##0.00;[Red]-$#,##0.00';

                            // Conditional formatting: negative = red, positive = green (subtle)
                            if (isNegative) {
                                ws[cellAddress].s.font = {
                                    ...ws[cellAddress].s.font,
                                    color: { rgb: "DC2626" },
                                    bold: true
                                };
                            } else if (value > 0) {
                                ws[cellAddress].s.font = {
                                    ...ws[cellAddress].s.font,
                                    color: { rgb: "059669" }
                                };
                            }

                            // Right align numbers
                            ws[cellAddress].s.alignment = {
                                ...ws[cellAddress].s.alignment,
                                horizontal: "right"
                            };
                        }

                        // Custom row colors (section headers)
                        const colorRow = colorRows.find(cr => cr.row === adjustedRow);
                        if (colorRow) {
                            ws[cellAddress].s.fill = { fgColor: { rgb: colorRow.color.replace('#', '') } };
                            ws[cellAddress].s.font = {
                                bold: true,
                                sz: 12,
                                color: { rgb: "FFFFFF" }
                            };
                            ws[cellAddress].s.border = mediumBorder;
                        }
                    }
                }
            }
        }

        // Freeze panes (headers stay visible when scrolling)
        if (freezePane) {
            ws['!freeze'] = {
                xSplit: freezePane.col,
                ySplit: freezePane.row + dataStartRow,
                topLeftCell: XLSX.utils.encode_cell({ r: freezePane.row + dataStartRow, c: freezePane.col }),
                activePane: "bottomRight",
                state: "frozen"
            };
        }

        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, sheetName);

        // Generate and download file
        XLSX.writeFile(wb, filename);
    } catch (error) {
        console.error('Error exporting to Excel:', error);
        throw new Error('Failed to export data to Excel');
    }
}

/**
 * Export financial report to Excel with enhanced formatting
 */
export function exportFinancialToExcel(
    sections: {
        title: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: any[];
    headers: string[];
    isTotalRow?: boolean;
    }[],
    filename: string,
    reportTitle: string,
    dateInfo?: string
): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[][] = [];
    const boldRows: number[] = [];
    const colorRows: { row: number; color: string }[] = [];
    let currentRow = 0;

    sections.forEach((section, sectionIndex) => {
        // Section title
        if (section.title) {
            rows.push([section.title]);
            boldRows.push(currentRow);
            colorRows.push({ row: currentRow, color: '6366F1' }); // Indigo
            currentRow++;
        }

        // Headers
        rows.push(section.headers);
        boldRows.push(currentRow);
        currentRow++;

        // Data rows
        section.data.forEach(item => {
            const row = section.headers.map(header => {
                const key = header.toLowerCase().replace(/ /g, '_');
                return item[key] || item[header] || '';
            });
            rows.push(row);
            currentRow++;
        });

        // Add spacing between sections
        if (sectionIndex < sections.length - 1) {
            rows.push([]);
            currentRow++;
        }
    });

    // Determine currency columns (typically last column for financial reports)
    const currencyColumns = [sections[0]?.headers.length - 1].filter(i => i >= 0);

    exportToExcel(rows, filename, {
        sheetName: reportTitle,
        reportTitle,
        dateInfo,
        boldRows,
        currencyColumns,
        colorRows,
        freezePane: { row: 1, col: 0 }, // Freeze header row
        showTimestamp: true,
        // companyName will be passed from caller if needed
    });
}
