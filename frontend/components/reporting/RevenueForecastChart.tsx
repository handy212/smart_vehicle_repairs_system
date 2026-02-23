"use client";

import React, { useMemo } from "react";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    ReferenceArea,
} from "recharts";
import { format, addDays, parseISO } from "date-fns";
import { useCurrency } from "@/lib/hooks/useCurrency";

interface RevenueData {
    period: string;
    revenue: number;
}

interface RevenueForecastChartProps {
    data: RevenueData[];
    forecastDays?: number;
}

export function RevenueForecastChart({ data, forecastDays = 30 }: RevenueForecastChartProps) {
    const { formatCurrency } = useCurrency();

    const forecastData = useMemo(() => {
        if (data.length < 2) return data;

        // Simple Linear Regression for forecasting
        const n = data.length;
        let sumX = 0;
        let sumY = 0;
        let sumXY = 0;
        let sumXX = 0;

        for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += data[i].revenue;
            sumXY += i * data[i].revenue;
            sumXX += i * i;
        }

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        const result = data.map((d, i) => ({
            ...d,
            type: "actual",
            predicted: intercept + slope * i,
        }));

        // Add forecast points
        const lastDate = parseISO(data[n - 1].period);
        for (let i = 1; i <= forecastDays; i++) {
            const nextDate = addDays(lastDate, i);
            result.push({
                period: format(nextDate, "yyyy-MM-dd"),
                revenue: 0, // Actual is unknown
                type: "forecast",
                predicted: intercept + slope * (n + i - 1),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any);
}

return result;
    }, [data, forecastDays]);

const lastActualIndex = data.length - 1;

return (
    <div className="h-[400px] w-full">
        <ResponsiveContainer width="100%" height="100%">
            <LineChart data={forecastData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                <XAxis
                    dataKey="period"
                    tickFormatter={(str) => format(parseISO(str), "MMM d")}
                    style={{ fontSize: "12px", fill: "currentColor", opacity: 0.5 }}
                />
                <YAxis
                    tickFormatter={(val) => `$${val / 1000}k`}
                    style={{ fontSize: "12px", fill: "currentColor", opacity: 0.5 }}
                />
                <Tooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number) => [formatCurrency(value), ""]}
                    labelFormatter={(label) => format(parseISO(label), "MMMM d, yyyy")}
                />
                <Legend verticalAlign="top" height={36} />

                <ReferenceArea
                    x1={forecastData[lastActualIndex]?.period}
                    x2={forecastData[forecastData.length - 1]?.period}
                    strokeOpacity={0.3}
                    fill="#3B82F6"
                    fillOpacity={0.05}
                />

                <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#3B82F6"
                    strokeWidth={3}
                    dot={{ r: 4, strokeWidth: 2, fill: "#fff" }}
                    activeDot={{ r: 6 }}
                    name="Actual Revenue"
                    connectNulls
                />
                <Line
                    type="monotone"
                    dataKey="predicted"
                    stroke="#10B981"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    name="Forecasted Trend"
                />
            </LineChart>
        </ResponsiveContainer>
    </div>
);
}
