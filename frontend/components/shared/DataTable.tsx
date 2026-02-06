"use client";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { TableSkeleton } from "@/components/ui/loading-skeleton";

export interface Column<T> {
    header: string;
    accessorKey?: keyof T;
    cell?: (item: T) => React.ReactNode;
    className?: string;
    sortable?: boolean;
}

interface DataTableProps<T> {
    data: T[];
    columns: Column<T>[];
    isLoading?: boolean;
    onRowClick?: (item: T) => void;
    onRowDoubleClick?: (item: T) => void; // Per UI roadmap
    emptyMessage?: string;
    className?: string;
    sortColumn?: string;
    sortDirection?: "asc" | "desc";
    onSort?: (column: string) => void;
}

export function DataTable<T>({
    data,
    columns,
    isLoading,
    onRowClick,
    onRowDoubleClick,
    emptyMessage = "No data found",
    className,
    sortColumn,
    sortDirection,
    onSort,
}: DataTableProps<T>) {

    if (isLoading) {
        return (
            <Card className={cn("border-t shadow-sm overflow-hidden", className)}>
                <div className="p-4 space-y-2">
                    <TableSkeleton />
                </div>
            </Card>
        )
    }

    return (
        <Card className={cn("border-t shadow-sm overflow-hidden", className)}>
            <div className="overflow-x-auto">
                <Table className="table-fixed w-full">
                    <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50 border-border border-border">
                            {columns.map((col, index) => (
                                <TableHead
                                    key={index}
                                    className={cn(
                                        "px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground select-none",
                                        col.sortable && "cursor-pointer hover:bg-gray-100/50 dark:hover:bg-gray-800/50",
                                        col.className
                                    )}
                                    onClick={() => col.sortable && col.accessorKey && onSort && onSort(col.accessorKey as string)}
                                >
                                    <div className="flex items-center gap-1">
                                        {col.header}
                                        {col.sortable && col.accessorKey && sortColumn === col.accessorKey && (
                                            sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                                        )}
                                        {col.sortable && col.accessorKey && sortColumn !== col.accessorKey && (
                                            <ChevronsUpDown className="h-3 w-3 opacity-30" />
                                        )}
                                    </div>
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.length === 0 ? (
                            <TableRow>
                                <TableCell
                                    colSpan={columns.length}
                                    className="h-24 text-center text-sm text-muted-foreground"
                                >
                                    {emptyMessage}
                                </TableCell>
                            </TableRow>
                        ) : (
                            data.map((item: any, rowIndex) => (
                                <TableRow
                                    key={item.id || rowIndex}
                                    className={cn(
                                        "group hover:bg-muted/80 transition-colors border-b border-border border-border",
                                        (onRowClick || onRowDoubleClick) && "cursor-pointer"
                                    )}
                                    onClick={() => onRowClick && onRowClick(item)}
                                    onDoubleClick={() => onRowDoubleClick && onRowDoubleClick(item)}
                                >
                                    {columns.map((col, colIndex) => (
                                        <TableCell
                                            key={colIndex}
                                            className={cn("px-4 py-2 text-sm", col.className)}
                                        >
                                            {col.cell ? col.cell(item) : item[col.accessorKey as string]}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </Card>
    );
}
