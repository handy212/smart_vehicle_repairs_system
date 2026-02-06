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
import { AlertCircle, Package } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useState } from "react";
import { format, subDays } from "date-fns";

export default function ServiceBundleReportPage() {
    const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
        from: subDays(new Date(), 30),
        to: new Date()
    });

    const { data, isLoading, error } = useQuery({
        queryKey: ["bundle-popularity", dateRange.from, dateRange.to],
        queryFn: () => reportingApi.serviceBundlePopularity({
            start_date: format(dateRange.from, "yyyy-MM-dd"),
            end_date: format(dateRange.to, "yyyy-MM-dd")
        })
    });

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Service Bundle Popularity</h1>
                    <p className="text-gray-500 text-sm">Analyze service bundle usage, conversion, and revenue.</p>
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
                    <p>Error loading report</p>
                </div>
            ) : (
                <Card className="border-none shadow-sm">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Package className="w-5 h-5 text-gray-500" />
                            <CardTitle>Bundle Performance</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Bundle Name</TableHead>
                                    <TableHead className="text-right">Price</TableHead>
                                    <TableHead className="text-center">Appointments</TableHead>
                                    <TableHead className="text-center">Work Orders</TableHead>
                                    <TableHead className="text-right">Conversion Rate</TableHead>
                                    <TableHead className="text-right">Total Revenue</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data?.bundles.map((item: any) => (
                                    <TableRow key={item.id}>
                                        <TableCell>
                                            <div className="font-medium">{item.name}</div>
                                            <div className="text-xs text-gray-500 truncate max-w-[200px]">{item.description}</div>
                                        </TableCell>
                                        <TableCell className="text-right font-mono">
                                            ${item.price.toFixed(2)}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant="outline">{item.appointment_count}</Badge>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant="outline">{item.work_order_count}</Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {item.conversion_rate.toFixed(1)}%
                                        </TableCell>
                                        <TableCell className="text-right font-bold font-mono text-success">
                                            ${item.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {data?.bundles.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center text-gray-500">
                                            No service bundle activity found in this period.
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
