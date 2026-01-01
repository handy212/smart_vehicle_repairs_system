"use client";

import React from "react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    Cell,
} from "recharts";
import { useCurrency } from "@/lib/hooks/useCurrency";

interface TurnoverItem {
    part: {
        id: number;
        part_number: string;
        name: string;
        category?: string | null;
    };
    metrics: {
        usage: number;
        current_stock: number;
        turnover_rate: number;
        days_of_stock: number;
    };
}

interface InventoryTurnoverChartProps {
    data: TurnoverItem[];
}

export function InventoryTurnoverChart({ data }: InventoryTurnoverChartProps) {
    const { formatCurrency } = useCurrency();

    // Prepare data for the chart - take top 10 by turnover rate
    const chartData = data
        .slice(0, 10)
        .map((item) => ({
            name: item.part.name,
            rate: item.metrics.turnover_rate,
            usage: item.metrics.usage,
            stock: item.metrics.current_stock,
        }));

    const COLORS = ["#3B82F6", "#60A5FA", "#93C5FD", "#BFDBFE", "#DBEAFE"];

    return (
        <div className="space-y-6">
            <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ left: 100 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} strokeOpacity={0.1} />
                        <XAxis type="number" hide />
                        <YAxis
                            dataKey="name"
                            type="category"
                            style={{ fontSize: "12px", fontWeight: "bold" }}
                            width={150}
                        />
                        <Tooltip
                            contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}
                            formatter={(value: number) => [value.toFixed(2), "Turnover Rate"]}
                        />
                        <Bar dataKey="rate" radius={[0, 4, 4, 0]} barSize={20}>
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.slice(0, 6).map((item) => (
                    <div
                        key={item.part.id}
                        className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800"
                    >
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <p className="text-sm font-bold truncate max-w-[150px]">{item.part.name}</p>
                                <p className="text-[10px] text-gray-500 uppercase font-medium">{item.part.part_number}</p>
                            </div>
                            <div className="px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] font-bold">
                                {item.metrics.turnover_rate.toFixed(1)}x Turn
                            </div>
                        </div>
                        <div className="flex justify-between items-end mt-4">
                            <div>
                                <p className="text-[10px] text-gray-400 uppercase">Usage (90d)</p>
                                <p className="text-lg font-bold">{item.metrics.usage}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] text-gray-400 uppercase">Days of Stock</p>
                                <p className={cn(
                                    "text-lg font-bold",
                                    item.metrics.days_of_stock < 10 ? "text-red-500" :
                                        item.metrics.days_of_stock > 60 ? "text-orange-500" : "text-green-500"
                                )}>
                                    {item.metrics.days_of_stock}d
                                </p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function cn(...classes: any[]) {
    return classes.filter(Boolean).join(" ");
}
