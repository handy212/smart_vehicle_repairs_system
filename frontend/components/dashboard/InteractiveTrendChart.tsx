"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useState } from "react";
import { format } from "date-fns";

type TrendChartPoint = {
    date: string;
    revenue: number;
    expense: number;
    cash_flow: number;
};

type TooltipPayloadEntry = {
    color?: string;
    name?: string;
    value?: number | string;
};

type TrendTooltipProps = {
    active?: boolean;
    payload?: TooltipPayloadEntry[];
    label?: string;
    formatCurrency: (value: number) => string;
};

interface InteractiveTrendChartProps {
    data: TrendChartPoint[];
    title: string;
}

function TrendTooltip({ active, payload, label, formatCurrency }: TrendTooltipProps) {
    if (!active || !payload?.length || !label) {
        return null;
    }

    return (
        <div className="rounded-lg border bg-background p-3 text-sm shadow-sm">
            <p className="mb-2 font-semibold">{format(new Date(label), "MMM d, yyyy")}</p>
            {payload.map((entry, index) => (
                <div key={`${entry.name}-${index}`} className="mb-1 flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="capitalize text-muted-foreground">{entry.name}:</span>
                    <span className="font-mono font-medium">{formatCurrency(Number(entry.value ?? 0))}</span>
                </div>
            ))}
        </div>
    );
}

export function InteractiveTrendChart({ data, title }: InteractiveTrendChartProps) {
    const { formatCurrency } = useCurrency();
    const [activeTab, setActiveTab] = useState("profitability");

    return (
        <Card className="col-span-full lg:col-span-2">
            <CardHeader className="flex flex-col gap-3 pb-2 md:flex-row md:items-center md:justify-between">
                <CardTitle className="text-base font-medium">{title}</CardTitle>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-[340px]">
                    <TabsList className="grid h-8 w-full grid-cols-3">
                        <TabsTrigger value="profitability" className="text-xs">Profitability</TabsTrigger>
                        <TabsTrigger value="cashflow" className="text-xs">Cash Flow</TabsTrigger>
                        <TabsTrigger value="revenue" className="text-xs">Revenue</TabsTrigger>
                    </TabsList>
                </Tabs>
            </CardHeader>
            <CardContent className="pt-4">
                <div style={{ height: "340px", width: "100%", minWidth: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        {activeTab === "profitability" ? (
                            <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis
                                    dataKey="date"
                                    tickFormatter={(str) => format(new Date(str), "MMM d")}
                                    tick={{ fontSize: 12 }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    tickFormatter={(val) => `$${val / 1000}k`}
                                    tick={{ fontSize: 12 }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.5} />
                                <Tooltip content={<TrendTooltip formatCurrency={formatCurrency} />} />
                                <Area
                                    type="monotone"
                                    dataKey="revenue"
                                    name="Revenue"
                                    stroke="#10b981"
                                    fillOpacity={1}
                                    fill="url(#colorRevenue)"
                                    strokeWidth={2}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="expense"
                                    name="Expense"
                                    stroke="#f43f5e"
                                    fillOpacity={1}
                                    fill="url(#colorExpense)"
                                    strokeWidth={2}
                                />
                            </AreaChart>
                        ) : activeTab === "cashflow" ? (
                            <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorCash" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis
                                    dataKey="date"
                                    tickFormatter={(str) => format(new Date(str), "MMM d")}
                                    tick={{ fontSize: 12 }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    tickFormatter={(val) => `$${val / 1000}k`}
                                    tick={{ fontSize: 12 }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.5} />
                                <Tooltip content={<TrendTooltip formatCurrency={formatCurrency} />} />
                                <ReferenceLine y={0} stroke="#000" strokeOpacity={0.2} />
                                <Area
                                    type="monotone"
                                    dataKey="cash_flow"
                                    name="Net Cash Flow"
                                    stroke="#3b82f6"
                                    fillOpacity={1}
                                    fill="url(#colorCash)"
                                    strokeWidth={2}
                                />
                            </AreaChart>
                        ) : (
                            <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorRevOnly" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis
                                    dataKey="date"
                                    tickFormatter={(str) => format(new Date(str), "MMM d")}
                                    tick={{ fontSize: 12 }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    tickFormatter={(val) => `$${val / 1000}k`}
                                    tick={{ fontSize: 12 }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.5} />
                                <Tooltip content={<TrendTooltip formatCurrency={formatCurrency} />} />
                                <Area
                                    type="monotone"
                                    dataKey="revenue"
                                    name="Total Revenue"
                                    stroke="#3b82f6"
                                    fillOpacity={1}
                                    fill="url(#colorRevOnly)"
                                    strokeWidth={2}
                                />
                            </AreaChart>
                        )}
                        {/* ... (chart content remains) ... */}
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}
