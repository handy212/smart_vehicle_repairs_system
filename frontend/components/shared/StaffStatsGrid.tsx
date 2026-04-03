import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

export interface StatItem {
    title: string;
    value: string | number;
    description?: string;
    icon?: LucideIcon;
    trend?: {
        value: string;
        label: string;
        positive?: boolean; // true = green, false = red, undefined = neutral
    };
    clickable?: boolean;
    onClick?: () => void;
    loading?: boolean;
}

interface StaffStatsGridProps {
    stats: StatItem[];
    columns?: 2 | 3 | 4 | 5;
    className?: string;
}

export function StaffStatsGrid({ stats, columns = 4, className }: StaffStatsGridProps) {
    const gridCols = {
        2: "sm:grid-cols-2",
        3: "sm:grid-cols-2 lg:grid-cols-3",
        4: "sm:grid-cols-2 lg:grid-cols-4",
        5: "sm:grid-cols-2 lg:grid-cols-5",
    };

    return (
        <div className={cn("grid gap-4", gridCols[columns], className)}>
            {stats.map((stat, index) => (
                <Card
                    key={index}
                    className={cn(
                        "transition-all",
                        stat.clickable && "cursor-pointer hover:bg-muted/50 hover:border-primary/50"
                    )}
                    onClick={stat.onClick}
                >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            {stat.title}
                        </CardTitle>
                        {stat.icon && (
                            <stat.icon className="h-4 w-4 text-muted-foreground" />
                        )}
                    </CardHeader>
                    <CardContent>
                        {stat.loading ? (
                            <div className="h-8 w-24 bg-muted animate-pulse rounded" />
                        ) : (
                            <>
                                <div className="text-2xl font-bold">{stat.value}</div>
                                {(stat.description || stat.trend) && (
                                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                        {stat.trend && (
                                            <span className={cn(
                                                "font-medium",
                                                stat.trend.positive === true && "text-success",
                                                stat.trend.positive === false && "text-destructive",
                                            )}>
                                                {stat.trend.value}
                                            </span>
                                        )}
                                        {stat.trend && stat.trend.label && <span>{stat.trend.label}</span>}
                                        {!stat.trend && stat.description}
                                    </p>
                                )}
                            </>
                        )}
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
