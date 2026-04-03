"use client";

import React from "react";
import { PremiumIcons } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface LowStockItem {
    part: {
        id: number;
        part_number: string;
        name: string;
        category: string | null;
    };
    stock: {
        current: number;
        reorder_point: number;
        reorder_quantity: number;
    };
    supplier: {
        id: number | null;
        name: string | null;
    };
    is_critical: boolean;
}

interface InventoryWatchlistProps {
    items: LowStockItem[];
    isLoading: boolean;
}

export function InventoryWatchlist({ items, isLoading }: InventoryWatchlistProps) {
    const watchlist = items.slice(0, 4);

    const getStockLevelWidth = (current: number, reorderPoint: number) => {
        if (reorderPoint <= 0) {
            return current > 0 ? 100 : 0;
        }

        return Math.min((current / reorderPoint) * 100, 100);
    };

    return (
        <div className="precision-card h-full flex flex-col">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-primary shadow-sm">
                        <PremiumIcons.Package className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-foreground uppercase tracking-widest">Inventory</h3>
                        <p className="text-[11px] font-medium text-gray-400">Stock monitor</p>
                    </div>
                </div>
                {items.length > 0 && (
                    <div className="px-2 py-1 rounded-md bg-warning/10 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30">
                        <span className="text-[10px] font-bold text-warning dark:text-amber-400 uppercase tracking-widest">{items.length} Alerts</span>
                    </div>
                )}
            </div>

            <div className="flex-1 space-y-5">
                {isLoading ? (
                    [1, 2, 3].map((i) => (
                        <div key={i} className="h-10 bg-muted animate-pulse rounded-lg" />
                    ))
                ) : items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 opacity-30 text-center">
                        <PremiumIcons.CheckCircle className="w-8 h-8 mb-2" />
                        <p className="text-[10px] font-black uppercase tracking-widest">All stock healthy</p>
                    </div>
                ) : (
                    watchlist.map((item) => {
                        const isCritical = item.is_critical;
                        return (
                            <div key={item.part.id} className="group cursor-pointer">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-bold text-foreground truncate uppercase tracking-tight group-hover:text-primary transition-colors">
                                            {item.part.name}
                                        </p>
                                        <p className="text-[9px] font-medium text-gray-400 font-mono">{item.part.part_number}</p>
                                    </div>
                                    <div className="text-right">
                                        <span className={cn(
                                            "text-xs font-bold tracking-tighter",
                                            isCritical ? "text-destructive" : "text-warning"
                                        )}>
                                            {item.stock.current} / {item.stock.reorder_point}
                                        </span>
                                    </div>
                                </div>
                                <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                                    <div 
                                        className={cn(
                                            "h-full transition-all duration-1000",
                                            isCritical ? "bg-rose-500" : "bg-warning/100"
                                        )}
                                        style={{ width: `${getStockLevelWidth(item.stock.current, item.stock.reorder_point)}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            <Link 
                href="/inventory"
                className="mt-6 flex items-center justify-center w-full py-3 rounded-xl bg-muted border border-transparent hover:border-primary/20 transition-all group"
            >
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 group-hover:text-primary">Stock Details</span>
                <PremiumIcons.ChevronRight className="w-3 h-3 ml-2 text-gray-300 group-hover:text-primary transition-colors" />
            </Link>
        </div>
    );
}
