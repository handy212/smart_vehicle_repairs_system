"use client";

import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format, startOfYear, endOfMonth } from "date-fns";
import { useState } from "react";
import { Download, Loader2, ArrowLeft } from "lucide-react";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

export default function CashFlowPage() {
    const [startDate, setStartDate] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
    const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
    const { formatCurrency } = useCurrency();

    const { data: report, isLoading, isError } = useQuery({
        queryKey: ["accounting", "cash-flow", startDate, endDate],
        queryFn: () => accountingApi.getCashFlowStatement(startDate, endDate),
    });

    const handleExport = () => {
        alert("Export feature coming soon");
    };

    const ActivitySection = ({ title, data }: { title: string, data: any }) => (
        <div className="space-y-2">
            <h3 className="font-semibold text-lg">{title}</h3>
            <div className="grid grid-cols-2 gap-4 pl-4 text-sm">
                <div className="text-muted-foreground">Cash Inflows</div>
                <div className="text-right text-green-600 font-medium">{formatCurrency(data.inflows)}</div>

                <div className="text-muted-foreground">Cash Outflows</div>
                <div className="text-right text-red-600 font-medium">({formatCurrency(data.outflows)})</div>

                <div className="font-semibold pt-2 border-t">Net Cash from {title}</div>
                <div className={cn(
                    "text-right font-bold pt-2 border-t",
                    data.net >= 0 ? "text-green-700" : "text-red-700"
                )}>
                    {formatCurrency(data.net)}
                </div>
            </div>
        </div>
    );

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/accounting">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Statement of Cash Flows</h1>
                        <p className="text-muted-foreground">
                            {format(new Date(startDate), "MMM d, yyyy")} - {format(new Date(endDate), "MMM d, yyyy")}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-40"
                    />
                    <span className="text-muted-foreground">-</span>
                    <Input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-40"
                    />
                    <Button variant="outline" onClick={handleExport}>
                        <Download className="w-4 h-4 mr-2" />
                        Export
                    </Button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-8 h-8 animate-spin" />
                </div>
            ) : isError ? (
                <div className="p-4 text-red-500">Error loading report</div>
            ) : (
                <Card>
                    <CardHeader className="bg-slate-50 border-b">
                        <div className="flex justify-between items-center">
                            <CardTitle>Cash Flow Summary</CardTitle>
                            <div className="text-sm font-medium">
                                Opening Balance: <span className="text-blue-600">{formatCurrency(report.opening_balance)}</span>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-8 pt-6">

                        <ActivitySection title="Operating Activities" data={report.operating_activities} />
                        <Separator />

                        <ActivitySection title="Investing Activities" data={report.investing_activities} />
                        <Separator />

                        <ActivitySection title="Financing Activities" data={report.financing_activities} />
                        <Separator />

                        <div className="flex justify-between items-center p-4 bg-slate-50 rounded-lg border">
                            <span className="font-bold text-lg">Net Increase / Decrease in Cash</span>
                            <span className={cn(
                                "font-bold text-xl",
                                report.net_increase_decrease >= 0 ? "text-green-700" : "text-red-700"
                            )}>
                                {formatCurrency(report.net_increase_decrease)}
                            </span>
                        </div>

                        <div className="flex justify-between items-center p-4 bg-blue-50 rounded-lg border border-blue-100">
                            <span className="font-bold text-lg text-blue-900">Closing Cash Balance</span>
                            <span className="font-bold text-xl text-blue-700">
                                {formatCurrency(report.closing_balance)}
                            </span>
                        </div>

                    </CardContent>
                </Card>
            )}
        </div>
    );
}
