"use client";

import { cn } from "@/lib/utils/cn";

interface Column<T> {
    header: string;
    accessorKey?: keyof T;
    cell?: (item: T) => React.ReactNode;
    className?: string;
}

interface PortalListProps<T> {
    data: T[];
    columns: Column<T>[];
    isLoading?: boolean;
    emptyMessage?: string;
    emptyAction?: React.ReactNode;
    onRowClick?: (item: T) => void;
    renderMobileItem?: (item: T) => React.ReactNode;
}

export function PortalList<T extends { id: string | number }>({
    data,
    columns,
    isLoading,
    emptyMessage = "No records found",
    emptyAction,
    onRowClick,
    renderMobileItem
}: PortalListProps<T>) {

    if (isLoading) {
        return (
            <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-14 w-full bg-muted rounded-lg animate-pulse" />
                ))}
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center border border-dashed border-border rounded-lg bg-muted/30">
                <svg className="w-8 h-8 text-muted-foreground/40 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
                <p className="text-sm text-muted-foreground mb-3">{emptyMessage}</p>
                {emptyAction}
            </div>
        );
    }

    return (
        <div className="w-full">
            {/* Mobile View */}
            {renderMobileItem && (
                <div className="grid grid-cols-1 gap-3 md:hidden">
                    {data.map((item) => (
                        <div key={item.id}>
                            {renderMobileItem(item)}
                        </div>
                    ))}
                </div>
            )}

            {/* Desktop Table */}
            <div className={cn(
                "rounded-lg border border-border overflow-hidden",
                renderMobileItem ? "hidden md:block" : "block"
            )}>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="border-b border-border bg-muted/40">
                                {columns.map((col, idx) => (
                                    <th
                                        key={idx}
                                        className={cn(
                                            "px-4 py-3 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em]",
                                            col.className
                                        )}
                                    >
                                        {col.header}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {data.map((item) => (
                                <tr
                                    key={item.id}
                                    className={cn(
                                        "bg-card transition-colors",
                                        onRowClick ? "cursor-pointer hover:bg-muted/40" : "hover:bg-muted/20"
                                    )}
                                    onClick={() => onRowClick?.(item)}
                                >
                                    {columns.map((col, idx) => (
                                        <td
                                            key={idx}
                                            className={cn(
                                                "px-4 py-3 text-sm text-foreground",
                                                col.className
                                            )}
                                        >
                                            {col.cell ? col.cell(item) : (col.accessorKey ? String(item[col.accessorKey]) : null)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
