"use client";

import { Card, CardContent } from "@/components/ui/card";
import { ArrowDown, ArrowUp, DollarSign, TrendingUp, TrendingDown, Activity, Wallet } from "lucide-react";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";

interface MetricCardProps {
    title: string;
    value: number;
    trend?: {
        value: number;
        isPositive: boolean;
        label: string;
    };
    icon?: "dollar" | "activity" | "wallet" | "trend";
    variant?: "default" | "success" | "warning" | "danger" | "info";
    data?: any[]; // For sparkline
    dataKey?: string;
    onClick?: () => void;
}

export function MetricCard({ title, value, trend, icon, variant = "default", data, dataKey, onClick }: MetricCardProps) {
    const { formatCurrency } = useCurrency();

    const getIcon = () => {
        switch (icon) {
            case "dollar": return <DollarSign className="w-4 h-4" />;
            case "activity": return <Activity className="w-4 h-4" />;
            case "wallet": return <Wallet className="w-4 h-4" />;
            case "trend": return <TrendingUp className="w-4 h-4" />;
            default: return <DollarSign className="w-4 h-4" />;
        }
    };

    const getColors = () => {
        switch (variant) {
            case "success": return { bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-600 dark:text-emerald-400", stroke: "#10b981", fill: "#10b981" };
            case "warning": return { bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-600 dark:text-amber-400", stroke: "#f59e0b", fill: "#f59e0b" };
            case "danger": return { bg: "bg-rose-50 dark:bg-rose-950/30", text: "text-rose-600 dark:text-rose-400", stroke: "#f43f5e", fill: "#f43f5e" };
            case "info": return { bg: "bg-primary/10 dark:bg-orange-950/30", text: "text-primary", stroke: "#3b82f6", fill: "#3b82f6" };
            default: return { bg: "bg-muted/50", text: "text-muted-foreground text-muted-foreground", stroke: "#6b7280", fill: "#6b7280" };
        }
    };

    const colors = getColors();

    return (
        <Card
            className={`overflow-hidden transition-all hover:shadow-md cursor-pointer border-l-4 ${onClick ? 'active:scale-[0.98]' : ''}`}
            style={{ borderLeftColor: colors.stroke }}
            onClick={onClick}
        >
            <CardContent className="p-0 relative">
                <div className="p-5 relative z-10">
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-sm font-medium text-muted-foreground">{title}</p>
                        <div className={`p-2 rounded-full ${colors.bg} ${colors.text}`}>
                            {getIcon()}
                        </div>
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-2xl font-bold tracking-tight">{formatCurrency(value)}</h3>
                        {trend && (
                            <div className="flex items-center text-xs">
                                <span className={`flex items-center font-medium ${trend.isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {trend.isPositive ? <ArrowUp className="w-3 h-3 mr-1" /> : <ArrowDown className="w-3 h-3 mr-1" />}
                                    {Math.abs(trend.value)}%
                                </span>
                                <span className="text-muted-foreground ml-1">{trend.label}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Sparkline Background */}
                {data && data.length > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 opacity-10" style={{ height: '64px', minWidth: 0 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data}>
                                <Area
                                    type="monotone"
                                    dataKey={dataKey || "value"}
                                    stroke={colors.stroke}
                                    fill={colors.fill}
                                    strokeWidth={2}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
