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
                    <p className="text-sm font-medium text-muted-foreground">
                        {title}
                    </p>
                    <Icon className={cn("h-4 w-4", iconColor)} />
                </div>
                <div className="flex items-center justify-between pt-2">
                    <div className="space-y-1">
                        {loading ? (
                            <div className="h-8 w-24 bg-muted animate-pulse rounded" />
                        ) : (
                            <div className="text-2xl font-bold text-foreground">{value}</div>
                        )}

                        {(change || description) && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                                {change && (
                                    <span className={cn(
                                        "font-medium",
                                        change.trend === 'up' ? "text-success" :
                                            change.trend === 'down' ? "text-destructive" : "text-muted-foreground"
                                    )}>
                                        {change.value > 0 ? '+' : ''}{change.value}%
                                    </span>
                                )}
                                {description && <span className="text-muted-foreground">{description}</span>}
                            </p>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
