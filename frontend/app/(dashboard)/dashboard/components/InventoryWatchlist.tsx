"use client";

import React from "react";
import { motion } from "framer-motion";
import { AdvancedWidget } from "./AdvancedWidget";
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
    const watchlist = items.slice(0, 5);

    return (
        <AdvancedWidget
            title="Low Stock Alerts"
            icon="Package"
            headerAction={
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
                    </span>
                    <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">{items.length} Alerts</span>
                </div>
            }
        >
            {isLoading ? (
                <div className="space-y-4 py-2">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-12 bg-white/5 animate-pulse rounded-2xl" />
                    ))}
                </div>
            ) : items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center bg-white/5 rounded-3xl border border-dashed border-white/10">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-3">
                        <PremiumIcons.CheckCircle className="w-6 h-6 text-emerald-500" />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-foreground">Supply Chain Healthy</p>
                    <p className="text-[9px] text-muted-foreground mt-1">Direct replenishment not required.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {watchlist.map((item, idx) => {
                        const stockPercentage = (item.stock.current / item.stock.reorder_point) * 100;
                        const isDanger = item.stock.current <= item.stock.reorder_point * 0.5;

                        return (
                            <motion.div
                                key={item.part.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.1 }}
                                className="group/item relative"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div className="min-w-0">
                                        <p className="text-xs font-black text-foreground truncate group-hover/item:text-primary transition-colors uppercase tracking-tight">
                                            {item.part.name}
                                        </p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[9px] font-bold text-muted-foreground/60">{item.part.part_number}</span>
                                            {isDanger && (
                                                <span className="text-[8px] font-black bg-rose-500 text-white px-1.5 py-0.5 rounded-full uppercase">Critical</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={cn(
                                            "text-sm font-black tracking-tighter",
                                            isDanger ? "text-rose-500" : "text-amber-500"
                                        )}>
                                            {item.stock.current} <span className="text-[10px] text-muted-foreground opacity-40">/ {item.stock.reorder_point}</span>
                                        </p>
                                    </div>
                                </div>
                                <div className="relative h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.min(stockPercentage, 100)}%` }}
                                        transition={{ duration: 1, ease: "easeOut" }}
                                        className={cn(
                                            "absolute inset-y-0 left-0 rounded-full",
                                            isDanger ? "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.4)]" : "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.4)]"
                                        )}
                                    />
                                </div>
                            </motion.div>
                        );
                    })}

                    <Link
                        href="/inventory"
                        className="flex items-center justify-center w-full py-2.5 mt-2 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all group"
                    >
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground group-hover:text-foreground">Replenish Inventory</span>
                    </Link>
                </div>
            )}
        </AdvancedWidget>
    );
}
