"use client";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { LucideIcon } from "lucide-react";

interface StatItem {
    label: string;
    value: string | number;
    icon?: LucideIcon;
    change?: {
        value: string;
        trend: "up" | "down" | "neutral";
    };
    color?: string; // Optional custom text color class for the value
}

interface StatsGridProps {
    stats: StatItem[];
    className?: string;
    columns?: 2 | 3 | 4;
}

export function StatsGrid({ stats, className, columns = 4 }: StatsGridProps) {
    const gridCols = {
        2: "grid-cols-2",
        3: "grid-cols-2 lg:grid-cols-3",
        4: "grid-cols-2 lg:grid-cols-4",
    };

    return (
        <div className={cn("grid gap-3", gridCols[columns], className)}>
            {stats.map((stat, index) => (
                <Card
                    key={index}
                    className="shadow-none border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20 p-3 flex flex-col justify-between"
                >
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                {stat.label}
                            </p>
                            <h3 className={cn("text-lg font-bold mt-0.5 text-gray-900 dark:text-white", stat.color)}>
                                {stat.value}
                            </h3>
                        </div>
                        {stat.icon && (
                            <stat.icon className="w-5 h-5 text-gray-400 dark:text-gray-500 opacity-70" />
                        )}
                    </div>

                    {stat.change && (
                        <div className="mt-2 flex items-center text-xs">
                            <span
                                className={cn(
                                    "font-medium",
                                    stat.change.trend === "up" ? "text-green-600 dark:text-green-400" :
                                        stat.change.trend === "down" ? "text-red-600 dark:text-red-400" :
                                            "text-gray-500"
                                )}
                            >
                                {stat.change.value}
                            </span>
                            <span className="text-gray-400 dark:text-gray-500 ml-1">vs last month</span>
                        </div>
                    )}
                </Card>
            ))}
        </div>
    );
}
