import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
    title: string;
    value: string | number;
    icon: LucideIcon;
    change?: {
        value: number;
        trend: 'up' | 'down' | 'neutral';
    };
    description?: string;
    className?: string;
    iconColor?: string;
    loading?: boolean;
}

export function StatCard({
    title,
    value,
    icon: Icon,
    change,
    description,
    className,
    iconColor = "text-primary",
    loading = false
}: StatCardProps) {
    return (
        <Card className={cn("", className)}>
            <CardContent className="p-6">
                <div className="flex items-center justify-between space-y-0 pb-2">
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        {title}
                    </p>
                    <Icon className={cn("h-4 w-4", iconColor)} />
                </div>
                <div className="flex items-center justify-between pt-2">
                    <div className="space-y-1">
                        {loading ? (
                            <div className="h-8 w-24 bg-gray-200 dark:bg-gray-700 animate-pulse rounded" />
                        ) : (
                            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
                        )}

                        {(change || description) && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                                {change && (
                                    <span className={cn(
                                        "font-medium",
                                        change.trend === 'up' ? "text-green-600" :
                                            change.trend === 'down' ? "text-red-600" : "text-gray-600"
                                    )}>
                                        {change.value > 0 ? '+' : ''}{change.value}%
                                    </span>
                                )}
                                {description && <span className="text-gray-500">{description}</span>}
                            </p>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
