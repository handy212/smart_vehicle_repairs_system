"use client";

import { cn } from "@/lib/utils/cn";
import { Skeleton } from "@/components/ui/skeleton";

interface Column<T> {
    header: string;
    accessorKey?: keyof T;
    cell?: (item: T) => React.ReactNode;
    className?: string; // Additional classes for the header/cell (e.g., text-right, hidden md:block)
}

interface PortalListProps<T> {
    data: T[];
    columns: Column<T>[];
    isLoading?: boolean;
    emptyMessage?: string;
    emptyAction?: React.ReactNode;
    onRowClick?: (item: T) => void;
    renderMobileItem?: (item: T) => React.ReactNode; // If provided, replaces table on mobile
}

export function PortalList<T extends { id: string | number }>({
    data,
    columns,
    isLoading,
    emptyMessage = "No items found",
    emptyAction,
    onRowClick,
    renderMobileItem
}: PortalListProps<T>) {

    if (isLoading) {
        return (
            <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 w-full bg-muted/50 rounded-lg animate-pulse" />
                ))}
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center border border-dashed border-border rounded-xl">
                <p className="text-sm text-muted-foreground mb-4">{emptyMessage}</p>
                {emptyAction}
            </div>
        );
    }

    return (
        <div>
            {/* Mobile View (Optional) */}
            {renderMobileItem && (
                <div className="grid grid-cols-1 gap-3 md:hidden">
                    {data.map((item) => (
                        <div key={item.id}>
                            {renderMobileItem(item)}
                        </div>
                    ))}
                </div>
            )}

            {/* Desktop View (Table) */}
            <div className={cn("overflow-hidden border border-border rounded-xl bg-card shadow-sm", renderMobileItem ? "hidden md:block" : "block")}>
                <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
                    <thead className="bg-muted/50">
                        <tr>
                            {columns.map((col, idx) => (
                                <th
                                    key={idx}
                                    scope="col"
                                    className={cn(
                                        "px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider",
                                        col.className
                                    )}
                                >
                                    {col.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-card">
                        {data.map((item) => (
                            <tr
                                key={item.id}
                                className={cn(
                                    "transition-colors",
                                    onRowClick ? "cursor-pointer hover:bg-muted dark:hover:bg-gray-800/50" : "hover:bg-muted/50"
                                )}
                                onClick={() => onRowClick?.(item)}
                            >
                                {columns.map((col, idx) => (
                                    <td
                                        key={idx}
                                        className={cn(
                                            "px-6 py-4 whitespace-nowrap text-sm text-foreground",
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
    );
}
