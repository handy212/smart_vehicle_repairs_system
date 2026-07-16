"use client";

import { ArrowDown, ArrowUp, DollarSign, TrendingUp, Activity, Wallet } from "lucide-react";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { Area, AreaChart, YAxis } from "recharts";
import { ChartContainer } from "@/components/ui/chart-container";
import { WORKSHOP_PANEL_CLASS } from "@/lib/constants/table-typography";
import { cn } from "@/lib/utils";

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
    /** When set, shows this string instead of formatting value as currency */
    displayValue?: string;
}

export function MetricCard({ title, value, trend, icon, variant = "default", data, dataKey, onClick, displayValue }: MetricCardProps) {
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
                return { bg: "bg-success/10", text: "text-success", stroke: "var(--success)", fill: "var(--success)" };
            case "warning":
                return { bg: "bg-warning/10", text: "text-warning", stroke: "var(--warning)", fill: "var(--warning)" };
            case "danger":
                return { bg: "bg-destructive/10", text: "text-destructive", stroke: "var(--destructive)", fill: "var(--destructive)" };
            case "info":
                return { bg: "bg-primary/10", text: "text-primary", stroke: "var(--primary)", fill: "var(--primary)" };
            default:
                return { bg: "bg-muted/50", text: "text-muted-foreground", stroke: "var(--muted-foreground)", fill: "var(--muted-foreground)" };
        }
    };

    const colors = getColors();

    return (
        <div
            className={cn(
                WORKSHOP_PANEL_CLASS,
                "flex flex-col justify-between gap-3 p-4 transition-all duration-150",
                onClick && "cursor-pointer hover:-translate-y-0.5 hover:border-primary/25"
            )}
            onClick={onClick}
        >
            <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
                <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", colors.bg, colors.text)}>
                    {getIcon()}
                </div>
            </div>
            <div>
                <p className="text-2xl font-bold leading-none tracking-tight text-foreground tabular-nums">
                    {displayValue ?? formatCurrency(value)}
                </p>
                {trend && (
                    <p className={cn("mt-1.5 flex items-center text-xs font-medium", trend.isPositive ? "text-success" : "text-destructive")}>
                        {trend.isPositive ? <ArrowUp className="mr-1 h-3 w-3" /> : <ArrowDown className="mr-1 h-3 w-3" />}
                        {Math.abs(trend.value)}%{" "}
                        <span className="ml-1 font-normal text-muted-foreground">{trend.label}</span>
                    </p>
                )}
            </div>
            {data && dataKey && data.length > 0 && (
                <div className="h-12 w-full opacity-80">
                    <ChartContainer className="h-full w-full">
                        <AreaChart data={data}>
                            <YAxis hide domain={["dataMin", "dataMax"]} />
                            <Area
                                type="monotone"
                                dataKey={dataKey}
                                stroke={colors.stroke}
                                fill={colors.fill}
                                fillOpacity={0.15}
                                strokeWidth={1.5}
                                isAnimationActive={false}
                            />
                        </AreaChart>
                    </ChartContainer>
                </div>
            )}
        </div>
    );
}
