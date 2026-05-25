"use client";

import { AccountingReportSkeleton } from "../../components/AccountingReportSkeleton";

import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { useState } from "react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { Download, ArrowLeft } from "lucide-react";
import { useCurrency } from "@/lib/hooks/useCurrency";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buildAgingExportPayload } from "@/lib/utils/accounting-report-export";
import { AccountingReportToolbar } from "../../components/AccountingReportToolbar";
import { AccountingReportPrintHeader } from "../../components/AccountingReportPrintHeader";

type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

type AgingSummary = {
    current: number;
    "1-30": number;
    "31-60": number;
    "61-90": number;
    "90+": number;
    total: number;
};

type AgingDetail = {
    id: number | string;
    number: string;
    entity: string;
    date: string;
    due_date?: string | null;
    bucket: AgingBucket;
    amount: number;
};

type AgingReport = {
    summary: AgingSummary;
    details: AgingDetail[];
};

type ExportCell = string | number;

const bucketCardStyles = {
    current: "border-border bg-muted/20 text-foreground",
    soon: "border-warning/20 bg-warning/10 text-warning-foreground",
    elevated: "border-primary/20 bg-primary/10 text-primary",
    overdue: "border-destructive/15 bg-destructive/10 text-destructive",
    critical: "border-destructive/20 bg-destructive/15 text-destructive",
};

type SupplierAgingRow = {
    supplier_name: string;
    payment_terms: string;
    amount_due: number;
    expected_payment_date: string | null;
    bill_count: number;
};

export default function AgingReportPage() {
    const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
    const [activeTab, setActiveTab] = useState("ar");
    const [apView, setApView] = useState<"bills" | "suppliers">("bills");
    const { formatCurrency, currencySymbol } = useCurrency();

    const { data: report, isLoading, isError } = useQuery({
        queryKey: ["accounting", "aging", activeTab, date, apView],
        queryFn: () => accountingApi.getAgingReport(activeTab as "ar" | "ap", date) as Promise<AgingReport>,
        enabled: activeTab === "ar" || apView === "bills",
    });

    const { data: supplierAp, isLoading: loadingSuppliers } = useQuery({
        queryKey: ["accounting", "supplier-ap-aging", date],
        queryFn: () => accountingApi.getSupplierAPAging(date),
        enabled: activeTab === "ap" && apView === "suppliers",
    });

    const supplierRows = (supplierAp as { suppliers?: SupplierAgingRow[] })?.suppliers ?? [];
    const supplierSummary = (supplierAp as { summary?: AgingSummary })?.summary;
    const showSupplierAp = activeTab === "ap" && apView === "suppliers";
    const loading = showSupplierAp ? loadingSuppliers : isLoading;

    const getExportPayload = () => {
        if (showSupplierAp || !report) return null;
        return buildAgingExportPayload(report, activeTab, date);
    };

    return (
        <div className="space-y-4 p-4 sm:p-6">
            <div className="no-print flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
                <div className="flex items-center gap-3">
                    <Link href="/accounting">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">Aging Report</h1>
                        <p className="text-sm text-muted-foreground">
                            For {format(new Date(date), "MMMM d, yyyy")}
                        </p>
                    </div>
                </div>
                <AccountingReportToolbar
                    getExportPayload={getExportPayload}
                    disabled={!report || showSupplierAp}
                    isLoading={loading}
                    reportPrint={{
                        slug: showSupplierAp ? "supplier-ap-aging" : "aging",
                        getQueryParams: () =>
                            showSupplierAp
                                ? { date }
                                : { type: activeTab, date },
                        pdfFilename: showSupplierAp
                            ? `supplier-ap-aging_${date}`
                            : `aging-${activeTab}_${date}`,
                    }}
                >
                    <Input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full sm:w-40 h-9 text-sm"
                    />
                </AccountingReportToolbar>
            </div>

            <AccountingReportPrintHeader
                title={`${activeTab.toUpperCase()} Aging Report`}
                dateInfo={`As of ${date}`}
            />

            <Tabs
                value={activeTab}
                onValueChange={(v) => {
                    setActiveTab(v);
                    if (v === "ar") setApView("bills");
                }}
                className="no-print space-y-4"
            >
                <TabsList>
                    <TabsTrigger value="ar">Accounts Receivable (Invoices)</TabsTrigger>
                    <TabsTrigger value="ap">Accounts Payable</TabsTrigger>
                </TabsList>

                {activeTab === "ap" && (
                    <Tabs value={apView} onValueChange={(v) => setApView(v as "bills" | "suppliers")}>
                        <TabsList>
                            <TabsTrigger value="bills">By bill</TabsTrigger>
                            <TabsTrigger value="suppliers">By supplier (terms & expected pay)</TabsTrigger>
                        </TabsList>
                    </Tabs>
                )}

                <TabsContent value={activeTab} className="space-y-4 print-container">
                    {loading ? (
                        <AccountingReportSkeleton />
                    ) : showSupplierAp ? (
                        supplierRows.length === 0 ? (
                            <div className="p-4 text-muted-foreground">No open supplier balances.</div>
                        ) : (
                            <Card>
                                <CardHeader className="border-b bg-muted/10">
                                    <CardTitle className="text-base">Suppliers — amount due & expected payment</CardTitle>
                                </CardHeader>
                                <CardContent className="pt-4">
                                    {supplierSummary && (
                                        <p className="text-sm mb-4">
                                            Total due: <strong>{formatCurrency(supplierSummary.total)}</strong>
                                        </p>
                                    )}
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Supplier</TableHead>
                                                <TableHead>Payment terms</TableHead>
                                                <TableHead>Expected pay date</TableHead>
                                                <TableHead className="text-right">Amount due</TableHead>
                                                <TableHead className="text-right">Bills</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {supplierRows.map((s) => (
                                                <TableRow key={s.supplier_name}>
                                                    <TableCell className="font-medium">{s.supplier_name}</TableCell>
                                                    <TableCell>{s.payment_terms || "—"}</TableCell>
                                                    <TableCell>{s.expected_payment_date || "—"}</TableCell>
                                                    <TableCell className="text-right">{formatCurrency(s.amount_due)}</TableCell>
                                                    <TableCell className="text-right">{s.bill_count}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        )
                    ) : isError || !report ? (
                        <div className="p-4 text-destructive">Error loading report</div>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                                <Card className={bucketCardStyles.current}>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium text-muted-foreground">Current</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-lg font-semibold">{formatCurrency(report?.summary.current)}</div>
                                    </CardContent>
                                </Card>
                                <Card className={bucketCardStyles.soon}>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium">1-30 Days</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-lg font-semibold">{formatCurrency(report?.summary["1-30"])}</div>
                                    </CardContent>
                                </Card>
                                <Card className={bucketCardStyles.elevated}>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium">31-60 Days</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-lg font-semibold">{formatCurrency(report?.summary["31-60"])}</div>
                                    </CardContent>
                                </Card>
                                <Card className={bucketCardStyles.overdue}>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium">61-90 Days</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-lg font-semibold">{formatCurrency(report?.summary["61-90"])}</div>
                                    </CardContent>
                                </Card>
                                <Card className={bucketCardStyles.critical}>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium">90+ Days</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-lg font-semibold">{formatCurrency(report?.summary["90+"])}</div>
                                    </CardContent>
                                </Card>
                                <Card className={bucketCardStyles.current}>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium text-foreground">Total</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-lg font-semibold">{formatCurrency(report?.summary.total)}</div>
                                    </CardContent>
                                </Card>
                            </div>

                            <Card>
                                <CardHeader className="border-b bg-muted/10">
                                    <CardTitle className="text-base">Details</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Number</TableHead>
                                                <TableHead>Entity</TableHead>
                                                <TableHead>Date</TableHead>
                                                <TableHead>Due Date</TableHead>
                                                <TableHead>Bucket</TableHead>
                                                <TableHead className="text-right">Amount Due</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {report?.details.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                                        No {activeTab.toUpperCase()} records found.
                                                    </TableCell>
                                                </TableRow>
                                            ) : (

                                                report?.details.map((item) => (
                                                    <TableRow key={item.id}>
                                                        <TableCell className="font-medium">
                                                            {activeTab === "ar" ? (
                                                                <Link
                                                                    href={`/billing/invoices/${item.id}`}
                                                                    className="text-primary hover:underline"
                                                                >
                                                                    {item.number}
                                                                </Link>
                                                            ) : (
                                                                item.number
                                                            )}
                                                        </TableCell>
                                                        <TableCell>{item.entity}</TableCell>
                                                        <TableCell>{item.date}</TableCell>
                                                        <TableCell>{item.due_date || 'N/A'}</TableCell>
                                                        <TableCell>
                                                            <Badge variant={
                                                                item.bucket === 'current' ? 'outline' :
                                                                    item.bucket === '1-30' ? 'secondary' :
                                                                        'danger'
                                                            }>
                                                                {item.bucket}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right font-medium">
                                                            {formatCurrency(item.amount)}
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}
