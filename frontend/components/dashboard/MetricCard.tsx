"use client";

import { Card, CardContent } from "@/components/ui/card";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ArrowDown, ArrowUp, DollarSign, TrendingUp, TrendingDown, Activity, Wallet } from "lucide-react";
import { useCurrency } from "@/lib/hooks/useCurrency";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

    data?: Array<Record<string, number | string>>;
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
            case "success":
                return { bg: "bg-success/10", text: "text-success", stroke: "#10b981", fill: "#10b981" };
            case "warning":
                return { bg: "bg-warning/10", text: "text-warning-foreground", stroke: "#f59e0b", fill: "#f59e0b" };
            case "danger":
                return { bg: "bg-destructive/10", text: "text-destructive", stroke: "#f43f5e", fill: "#f43f5e" };
            case "info":
                return { bg: "bg-primary/10", text: "text-primary", stroke: "#3b82f6", fill: "#3b82f6" };
            default:
                return { bg: "bg-muted/50", text: "text-muted-foreground", stroke: "#6b7280", fill: "#6b7280" };
        }
    };

    const colors = getColors();

    return (
        <Card
            className={`overflow-hidden border transition-colors ${onClick ? "cursor-pointer hover:border-primary/20 hover:bg-muted/10" : ""}`}
            onClick={onClick}
        >
            <CardContent className="p-0 relative">
                <div className="relative z-10 p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
                        <div className={`rounded-md border p-2 ${colors.bg} ${colors.text}`}>
                            {getIcon()}
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <h3 className="text-xl font-semibold tracking-tight text-foreground">{formatCurrency(value)}</h3>
                        {trend && (
                            <div className="flex items-center text-xs">
                                <span className={`flex items-center font-medium ${trend.isPositive ? "text-success" : "text-destructive"}`}>
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
                    <div className="absolute bottom-0 left-0 right-0 opacity-[0.08]" style={{ height: "56px", minWidth: 0 }}>
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
