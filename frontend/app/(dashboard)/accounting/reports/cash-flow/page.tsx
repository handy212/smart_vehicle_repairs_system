"use client";

import { AccountingReportSkeleton } from "../../components/AccountingReportSkeleton";

import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format, startOfYear } from "date-fns";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { buildCashFlowExportPayload } from "@/lib/utils/accounting-report-export";
import { AccountingReportToolbar } from "../../components/AccountingReportToolbar";
import { AccountingReportPrintHeader } from "../../components/AccountingReportPrintHeader";

type CashFlowActivity = {
    inflows: number;
    outflows: number;
    net: number;
};

type CashFlowReport = {
    opening_balance: number;
    operating_activities: CashFlowActivity;
    investing_activities: CashFlowActivity;
    financing_activities: CashFlowActivity;
    net_increase_decrease: number;
    closing_balance: number;
};

type ExportCell = string | number;

function ActivitySection({
    title,
    data,
    formatCurrency}: {
    title: string;
    data: CashFlowActivity;
    formatCurrency: (value: number) => string;
}) {
    return (
        <div className="space-y-3">
            <h3 className="text-base font-semibold">{title}</h3>
            <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/10 p-4 text-sm">
                <div className="text-muted-foreground">Cash Inflows</div>
                <div className="text-right font-medium text-success">{formatCurrency(data.inflows)}</div>

                <div className="text-muted-foreground">Cash Outflows</div>
                <div className="text-right font-medium text-destructive">({formatCurrency(data.outflows)})</div>

                <div className="border-t pt-2 font-semibold">Net Cash from {title}</div>
                <div className={cn(
                    "border-t pt-2 text-right font-semibold",
                    data.net >= 0 ? "text-success" : "text-destructive"
                )}>
                    {formatCurrency(data.net)}
                </div>
            </div>
        </div>
    );
}

export default function CashFlowPage() {
    const [startDate, setStartDate] = useState(format(startOfYear(new Date()), "yyyy-MM-dd"));
    const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
    const { formatCurrency, currencySymbol } = useCurrency();

    const { data: report, isLoading, isError } = useQuery({
        queryKey: ["accounting", "cash-flow", startDate, endDate],
        queryFn: () => accountingApi.getCashFlowStatement(startDate, endDate) as Promise<CashFlowReport>});

    const getExportPayload = () =>
        report ? buildCashFlowExportPayload(report, startDate, endDate) : null;

    return (
        <div className="w-full space-y-4">
            <div className="no-print flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
                <div className="flex items-center gap-3">
                    <Link href="/accounting">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight">Statement of Cash Flows</h1>
                        <p className="text-sm text-muted-foreground">
                            {format(new Date(startDate), "MMM d, yyyy")} - {format(new Date(endDate), "MMM d, yyyy")}
                        </p>
                    </div>
                </div>
                <AccountingReportToolbar
                    getExportPayload={getExportPayload}
                    disabled={!report}
                    isLoading={isLoading}
                    reportPrint={{
                        slug: "cash-flow",
                        getQueryParams: () => ({
                            start_date: startDate,
                            end_date: endDate,
                        }),
                        pdfFilename: `cash-flow_${startDate}_${endDate}`,
                    }}
                >
                    <Input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full sm:w-40 h-9 text-sm"
                    />
                    <span className="text-muted-foreground">-</span>
                    <Input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full sm:w-40 h-9 text-sm"
                    />
                </AccountingReportToolbar>
            </div>

            <AccountingReportPrintHeader
                title="Statement of Cash Flows"
                dateInfo={`${startDate} to ${endDate}`}
            />

            {isLoading ? (
                <AccountingReportSkeleton />
      ) : isError || !report ? (
                <div className="p-4 text-destructive">Error loading report</div>
            ) : (
                <Card className="print-container">
                    <CardHeader className="border-b bg-muted/10">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <CardTitle className="text-base">Cash Flow Summary</CardTitle>
                            <div className="text-sm font-medium">
                                Opening Balance: <span className="text-foreground">{formatCurrency(report?.opening_balance)}</span>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6 pt-6">
                        <ActivitySection title="Operating Activities" data={report?.operating_activities} formatCurrency={formatCurrency} />
                        <Separator />
                        <ActivitySection title="Investing Activities" data={report?.investing_activities} formatCurrency={formatCurrency} />
                        <Separator />
                        <ActivitySection title="Financing Activities" data={report?.financing_activities} formatCurrency={formatCurrency} />
                        <Separator />

                        <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-4">
                            <span className="text-lg font-semibold">Net Increase / Decrease in Cash</span>
                            <span className={cn(
                                "text-xl font-semibold",
                                report?.net_increase_decrease >= 0 ? "text-success" : "text-destructive"
                            )}>
                                {formatCurrency(report?.net_increase_decrease)}
                            </span>
                        </div>

                        <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/10 p-4">
                            <span className="text-lg font-semibold text-foreground">Closing Cash Balance</span>
                            <span className="text-xl font-semibold text-primary">
                                {formatCurrency(report?.closing_balance)}
                            </span>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
