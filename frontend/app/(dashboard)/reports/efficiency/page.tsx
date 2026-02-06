"use client";

import { useQuery } from "@tanstack/react-query";
import { reportingApi } from "@/lib/api/reporting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useState } from "react";
import { format, subDays } from "date-fns";

export default function TechnicianEfficiencyPage() {
    const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
        from: subDays(new Date(), 30),
        to: new Date()
    });

    const { data, isLoading, error } = useQuery({
        queryKey: ["technician-efficiency", dateRange.from, dateRange.to],
        queryFn: () => reportingApi.technicianPerformance({
            start_date: format(dateRange.from, "yyyy-MM-dd"),
            end_date: format(dateRange.to, "yyyy-MM-dd")
        })
    });

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Technician Efficiency</h1>
                    <p className="text-gray-500 text-sm">Monitor technician performance and labor efficiency.</p>
                </div>
                <DateRangePicker
                    startDate={format(dateRange.from, "yyyy-MM-dd")}
                    endDate={format(dateRange.to, "yyyy-MM-dd")}
                    onStartDateChange={(date) => {
                        const d = new Date(date);
                        if (!isNaN(d.getTime())) setDateRange(prev => ({ ...prev, from: d }));
                    }}
                    onEndDateChange={(date) => {
                        const d = new Date(date);
                        if (!isNaN(d.getTime())) setDateRange(prev => ({ ...prev, to: d }));
                    }}
                />
            </div>

            {isLoading ? (
                <div className="space-y-4">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
            ) : error ? (
                <div className="p-8 text-center text-red-500 bg-red-50 rounded-lg">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                    <p>Error loading efficiency report</p>
                </div>
            ) : (
                <Card className="border-none shadow-sm">
                    <CardHeader>
                        <CardTitle>Technician Performance Metrics</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Technician</TableHead>
                                    <TableHead className="text-right">Completed WOs</TableHead>
                                    <TableHead className="text-right">Avg Completion Time</TableHead>
                                    <TableHead className="text-right">Estimated Hours</TableHead>
                                    <TableHead className="text-right">Actual Hours</TableHead>
                                    <TableHead className="text-right">Efficiency</TableHead>
                                    <TableHead className="text-right">Revenue Generated</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data?.technicians.map((item: any) => {
                                    const efficiency = item.metrics.efficiency_percentage || 0;
                                    // Efficiency color logic: >100 excellent (green), 80-100 good (blue), <80 concern (yellow/red)
                                    // Wait, if Actual < Estimated, Efficiency > 100%. That's good.
                                    // If Actual > Estimated, Efficiency < 100%.
                                    // Formula used: (Estimated / Actual) * 100
                                    let badgeVariant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" = "secondary";
                                    if (efficiency >= 100) badgeVariant = "success";
                                    else if (efficiency >= 80) badgeVariant = "secondary"; // or info/blue
                                    else badgeVariant = "warning";

                                    return (
                                        <TableRow key={item.technician.id}>
                                            <TableCell className="font-medium">{item.technician.name}</TableCell>
                                            <TableCell className="text-right">{item.metrics.completed}</TableCell>
                                            <TableCell className="text-right">
                                                {item.metrics.average_completion_hours ?
                                                    `${item.metrics.average_completion_hours.toFixed(1)} hrs` : '-'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {item.metrics.total_estimated_hours?.toFixed(1) || '0.0'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {item.metrics.total_actual_hours?.toFixed(1) || '0.0'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <span className={efficiency >= 100 ? "text-success font-bold" : efficiency < 80 ? "text-yellow-600" : ""}>
                                                        {efficiency.toFixed(1)}%
                                                    </span>
                                                    {efficiency >= 100 && <TrendingUp className="w-4 h-4 text-success" />}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-mono">
                                                ${item.metrics.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                                {data?.technicians.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-24 text-center text-gray-500">
                                            No data found for the selected period.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
