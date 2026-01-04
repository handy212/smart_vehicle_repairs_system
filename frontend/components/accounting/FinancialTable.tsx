"use client";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { cn } from "@/lib/utils/cn";

interface FinancialTableColumn {
    key: string;
    label: string;
    align?: "left" | "right" | "center";
    format?: "currency" | "number" | "text";
    className?: string;
}

interface FinancialTableSection {
    title?: string;
    data: any[];
    className?: string;
    showTotal?: boolean;
    totalLabel?: string;
}

interface FinancialTableProps {
    columns: FinancialTableColumn[];
    sections: FinancialTableSection[];
    compact?: boolean;
    className?: string;
}

export function FinancialTable({
    columns,
    sections,
    compact = true,
    className
}: FinancialTableProps) {
    const { formatCurrency } = useCurrency();

    const formatValue = (value: any, format?: string) => {
        if (value === null || value === undefined) return "—";

        switch (format) {
            case "currency":
                return formatCurrency(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            case "number":
                return typeof value === 'number' ? value.toLocaleString() : value;
            default:
                return value;
        }
    };

    const calculateTotal = (section: FinancialTableSection, columnKey: string) => {
        return section.data.reduce((sum, row) => {
            const value = parseFloat(row[columnKey] || 0);
            return sum + (isNaN(value) ? 0 : value);
        }, 0);
    };

    return (
        <div className={cn("rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden", className)}>
            <Table>
                <TableHeader>
                    <TableRow className="bg-gray-50 dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-900">
                        {columns.map((column) => (
                            <TableHead
                                key={column.key}
                                className={cn(
                                    "text-[10px] uppercase tracking-wider font-bold text-gray-600 dark:text-gray-400",
                                    compact ? "h-8 px-3" : "h-10 px-4",
                                    column.align === "right" && "text-right",
                                    column.align === "center" && "text-center",
                                    column.className
                                )}
                            >
                                {column.label}
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {sections.map((section, sectionIndex) => (
                        <React.Fragment key={sectionIndex}>
                            {section.title && (
                                <TableRow className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800">
                                    <TableCell
                                        colSpan={columns.length}
                                        className={cn(
                                            "font-bold text-gray-900 dark:text-gray-100",
                                            compact ? "py-2 px-3 text-sm" : "py-3 px-4 text-base"
                                        )}
                                    >
                                        {section.title}
                                    </TableCell>
                                </TableRow>
                            )}
                            {section.data.map((row, rowIndex) => (
                                <TableRow
                                    key={rowIndex}
                                    className={cn(
                                        "border-b border-gray-100 dark:border-gray-800",
                                        rowIndex % 2 === 0 ? "bg-white dark:bg-gray-950" : "bg-gray-50/50 dark:bg-gray-900/50",
                                        section.className
                                    )}
                                >
                                    {columns.map((column) => (
                                        <TableCell
                                            key={column.key}
                                            className={cn(
                                                compact ? "py-1.5 px-3 text-xs" : "py-2 px-4 text-sm",
                                                column.align === "right" && "text-right font-mono",
                                                column.align === "center" && "text-center",
                                                column.format === "currency" && "font-mono text-gray-900 dark:text-gray-100",
                                                column.className
                                            )}
                                        >
                                            {formatValue(row[column.key], column.format)}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))}
                            {section.showTotal && section.data.length > 0 && (
                                <TableRow className="bg-gray-100 dark:bg-gray-800 font-bold border-t-2 border-gray-300 dark:border-gray-700">
                                    <TableCell
                                        className={cn(
                                            "font-bold text-gray-900 dark:text-gray-100",
                                            compact ? "py-2 px-3 text-sm" : "py-3 px-4 text-base"
                                        )}
                                    >
                                        {section.totalLabel || "Total"}
                                    </TableCell>
                                    {columns.slice(1).map((column) => (
                                        <TableCell
                                            key={column.key}
                                            className={cn(
                                                "font-bold",
                                                compact ? "py-2 px-3 text-sm" : "py-3 px-4 text-base",
                                                column.align === "right" && "text-right font-mono",
                                                column.format === "currency" && "text-gray-900 dark:text-gray-100"
                                            )}
                                        >
                                            {column.format === "currency" || column.format === "number"
                                                ? formatValue(calculateTotal(section, column.key), column.format)
                                                : ""}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            )}
                        </React.Fragment>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

// Add React import
import React from "react";
