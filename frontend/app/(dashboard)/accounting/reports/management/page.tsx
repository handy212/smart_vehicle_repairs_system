"use client";

import { AccountingReportSkeleton } from "../../components/AccountingReportSkeleton";

import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow} from "@/components/ui/table";
import { format, startOfMonth } from "date-fns";
import { useState } from "react";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useBranchStore } from "@/store/branchStore";
import { BranchReportChip } from "@/components/reporting/BranchReportChip";
import { ReportExportMenu } from "@/components/reports/ReportExportMenu";
import type { TableExportPayload } from "@/lib/utils/report-export";
import Link from "next/link";

type MgmtTab = "executive" | "scorecard" | "consolidated" | "cash" | "mix";

type ScorecardBranch = {
    rank: number;
    branch_name: string;
    revenue: number;
    expenses: number;
    net_income: number;
    margin_percent: number;
};

type CashSegment = {
    label: string;
    invoiced: number;
    collected: number;
    collection_rate_percent: number;
    invoice_count: number;
};

export default function ManagementReportsPage() {
    const { formatCurrency } = useCurrency();
    const { activeBranchId } = useBranchStore();
    const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
    const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
    const [activeTab, setActiveTab] = useState<MgmtTab>("executive");

    const dateParams = { startDate, endDate, branchId: activeBranchId || undefined };

    const { data: scorecard, isLoading: loadingScorecard } = useQuery({
        queryKey: ["mgmt", "scorecard", startDate, endDate],
        queryFn: () => accountingApi.getBranchPLScorecard(startDate, endDate)});

    const { data: consolidated, isLoading: loadingConsolidated } = useQuery({
        queryKey: ["mgmt", "consolidated", startDate, endDate],
        queryFn: () => accountingApi.getConsolidatedProfitLoss(startDate, endDate)});

    const { data: cashCollection, isLoading: loadingCash } = useQuery({
        queryKey: ["mgmt", "cash", startDate, endDate, activeBranchId],
        queryFn: () =>
            accountingApi.getCashCollectionReport(startDate, endDate, activeBranchId || undefined)});

    const { data: revenueMix, isLoading: loadingMix } = useQuery({
        queryKey: ["mgmt", "mix", startDate, endDate, activeBranchId],
        queryFn: () => accountingApi.getRevenueMix(startDate, endDate, activeBranchId || undefined)});

    const { data: mgmtMetrics, isLoading: loadingMetrics } = useQuery({
        queryKey: ["mgmt", "dashboard", startDate, endDate, activeBranchId],
        queryFn: () => accountingApi.getManagementMetrics(startDate, endDate)});

    const kpis = (mgmtMetrics as { kpis?: Record<string, number> })?.kpis;
    const topExpenses = (mgmtMetrics as { top_expenses?: Array<{ name: string; amount: number }> })?.top_expenses ?? [];

    const scorecardBranches = (scorecard as { branches?: ScorecardBranch[] })?.branches ?? [];
    const consolidatedTotals = (consolidated as { consolidated?: { totals?: Record<string, number> } })
        ?.consolidated?.totals;
    const cashSegments = (cashCollection as { segments?: CashSegment[] })?.segments ?? [];
    const cashTotals = (cashCollection as { totals?: { collection_rate_percent?: number } })?.totals;
    const byProduct = (revenueMix as { by_product?: Array<{ label: string; invoiced: number; collected: number }> })
        ?.by_product ?? [];
    const byBranch = (revenueMix as { by_branch?: Array<{ branch_name: string; invoiced: number; share_percent: number }> })
        ?.by_branch ?? [];

    const buildExportPayload = (): TableExportPayload | null => {
        const stamp = `${startDate}_${endDate}`;
        const dateInfo = `Period: ${startDate} to ${endDate}`;

        if (activeTab === "executive") {
            if (topExpenses.length > 0) {
                return {
                    filename: `management-expenses_${stamp}`,
                    reportTitle: "Management — Top operating expenses",
                    dateInfo,
                    headers: ["Account", "Amount"],
                    rows: topExpenses.map((e) => [e.name, e.amount]),
                    currencyColumnIndexes: [1]};
            }
            if (kpis) {
                return {
                    filename: `management-kpis_${stamp}`,
                    reportTitle: "Management — Executive KPIs",
                    dateInfo,
                    headers: ["Metric", "Value"],
                    rows: [
                        ["Revenue", kpis.revenue ?? 0],
                        ["Net income", kpis.net_income ?? 0],
                        ["Cash balance", kpis.cash_balance ?? 0],
                        ["AR outstanding", kpis.ar_outstanding ?? 0],
                        ["AP outstanding", kpis.ap_outstanding ?? 0],
                        ["Runway (months)", `${(kpis.runway_months ?? 0).toFixed(1)}`],
                    ],
                    currencyColumnIndexes: [1]};
            }
        }
        if (activeTab === "scorecard" && scorecardBranches.length > 0) {
            return {
                filename: `branch-scorecard_${stamp}`,
                reportTitle: "Branch P&L Scorecard",
                dateInfo,
                headers: ["Rank", "Branch", "Revenue", "Expenses", "Net income", "Margin %"],
                rows: scorecardBranches.map((b) => [
                    b.rank,
                    b.branch_name,
                    b.revenue,
                    b.expenses,
                    b.net_income,
                    b.margin_percent,
                ]),
                currencyColumnIndexes: [2, 3, 4]};
        }
        if (activeTab === "consolidated") {
            const branchRows =
                (
                    consolidated as {
                        branches?: Array<{
                            branch_name: string;
                            totals: { income: number; net_income: number };
                        }>;
                    }
                )?.branches?.map((b) => [b.branch_name, b.totals.income, b.totals.net_income]) ?? [];
            if (branchRows.length === 0 && !consolidatedTotals) return null;
            return {
                filename: `consolidated-pl_${stamp}`,
                reportTitle: "Consolidated P&L",
                dateInfo,
                headers: ["Branch", "Revenue", "Net income"],
                rows: branchRows,
                currencyColumnIndexes: [1, 2]};
        }
        if (activeTab === "cash" && cashSegments.length > 0) {
            return {
                filename: `cash-collection_${stamp}`,
                reportTitle: "Cash Collection",
                dateInfo,
                headers: ["Segment", "Invoiced", "Collected", "Rate %", "Invoices"],
                rows: cashSegments.map((s) => [
                    s.label,
                    s.invoiced,
                    s.collected,
                    s.collection_rate_percent,
                    s.invoice_count,
                ]),
                currencyColumnIndexes: [1, 2]};
        }
        if (activeTab === "mix" && byProduct.length > 0) {
            return {
                filename: `revenue-mix_${stamp}`,
                reportTitle: "Revenue Mix — By product",
                dateInfo,
                headers: ["Product", "Invoiced", "Collected"],
                rows: byProduct.map((p) => [p.label, p.invoiced, p.collected]),
                currencyColumnIndexes: [1, 2]};
        }
        return null;
    };

    return (
        <div className="space-y-6 p-4 md:p-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Management Reports</h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Branch scorecard, consolidated P&L, cash collection, and revenue mix.
                    Board pack PDF includes MoM/YoY (export from{" "}
                    <Link href="/accounting" className="text-primary underline">Accounting overview</Link>).
                </p>
                <div className="flex flex-wrap gap-3 mt-3 text-sm">
                    <Link href="/accounting/reports/profit-loss" className="text-primary underline">P&L (MoM/YoY)</Link>
                    <Link href="/accounting/reports/aging" className="text-primary underline">AP by supplier</Link>
                    <Link href="/accounting/reports/margin-analysis" className="text-primary underline">Margin analysis</Link>
                    <Link href="/accounting/reports/cost-control" className="text-primary underline">Cost control</Link>
                    <Link href="/accounting/reports/opex-variance" className="text-primary underline">OPEX variance</Link>
                    <Link href="/inventory/reports/compliance" className="text-primary underline">Inventory compliance</Link>
                    <Link href="/reports/operations" className="text-primary underline">Operations intelligence</Link>
                </div>
            </div>

            <div className="flex flex-wrap gap-4 items-end justify-between">
                <div className="flex flex-wrap gap-4 items-end">
                    <div>
                        <label className="text-sm font-medium">From</label>
                        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
                    </div>
                    <div>
                        <label className="text-sm font-medium">To</label>
                        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <ReportExportMenu getPayload={buildExportPayload} />
                    <BranchReportChip />
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as MgmtTab)}>
                <TabsList className="flex flex-wrap h-auto">
                    <TabsTrigger value="executive">Executive KPIs</TabsTrigger>
                    <TabsTrigger value="scorecard">Branch Scorecard</TabsTrigger>
                    <TabsTrigger value="consolidated">Consolidated P&L</TabsTrigger>
                    <TabsTrigger value="cash">Cash Collection</TabsTrigger>
                    <TabsTrigger value="mix">Revenue Mix</TabsTrigger>
                </TabsList>

                <TabsContent value="executive" className="space-y-4">
                    {loadingMetrics ? (
                        <AccountingReportSkeleton compact rows={3} />
      ) : kpis ? (
                        <>
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                <Card>
                                    <CardHeader className="pb-2"><CardTitle className="text-xs">Revenue</CardTitle></CardHeader>
                                    <CardContent className="text-lg font-semibold">{formatCurrency(kpis.revenue ?? 0)}</CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="pb-2"><CardTitle className="text-xs">Net income</CardTitle></CardHeader>
                                    <CardContent className="text-lg font-semibold">{formatCurrency(kpis.net_income ?? 0)}</CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="pb-2"><CardTitle className="text-xs">Cash</CardTitle></CardHeader>
                                    <CardContent className="text-lg font-semibold">{formatCurrency(kpis.cash_balance ?? 0)}</CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="pb-2"><CardTitle className="text-xs">AR outstanding</CardTitle></CardHeader>
                                    <CardContent className="text-lg font-semibold">{formatCurrency(kpis.ar_outstanding ?? 0)}</CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="pb-2"><CardTitle className="text-xs">AP outstanding</CardTitle></CardHeader>
                                    <CardContent className="text-lg font-semibold">{formatCurrency(kpis.ap_outstanding ?? 0)}</CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="pb-2"><CardTitle className="text-xs">Runway</CardTitle></CardHeader>
                                    <CardContent className="text-lg font-semibold">{(kpis.runway_months ?? 0).toFixed(1)} mo</CardContent>
                                </Card>
                            </div>
                            {topExpenses.length > 0 && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base">Top operating expenses</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Account</TableHead>
                                                    <TableHead className="text-right">Amount</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {topExpenses.map((e) => (
                                                    <TableRow key={e.name}>
                                                        <TableCell>{e.name}</TableCell>
                                                        <TableCell className="text-right">{formatCurrency(e.amount)}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </CardContent>
                                </Card>
                            )}
                        </>
                    ) : (
                        <p className="text-sm text-muted-foreground">No management metrics for this period.</p>
                    )}
                </TabsContent>

                <TabsContent value="scorecard">
                    <Card>
                        <CardHeader>
                            <CardTitle>Branch P&L Scorecard</CardTitle>
                            <CardDescription>Ranked by net income for the period</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {loadingScorecard ? (
                        <AccountingReportSkeleton compact rows={3} />
      ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Rank</TableHead>
                                            <TableHead>Branch</TableHead>
                                            <TableHead className="text-right">Revenue</TableHead>
                                            <TableHead className="text-right">Expenses</TableHead>
                                            <TableHead className="text-right">Net Income</TableHead>
                                            <TableHead className="text-right">Margin %</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {scorecardBranches.map((b) => (
                                            <TableRow key={b.branch_name}>
                                                <TableCell>{b.rank}</TableCell>
                                                <TableCell>{b.branch_name}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(b.revenue)}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(b.expenses)}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(b.net_income)}</TableCell>
                                                <TableCell className="text-right">{b.margin_percent}%</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="consolidated">
                    <Card>
                        <CardHeader>
                            <CardTitle>Consolidated P&L</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {loadingConsolidated ? (
                        <AccountingReportSkeleton compact rows={4} />
      ) : consolidatedTotals ? (
                                <>
                                    <div className="grid grid-cols-3 gap-4 max-w-xl">
                                        <div>
                                            <p className="text-sm text-muted-foreground">Income</p>
                                            <p className="text-lg font-semibold">
                                                {formatCurrency(consolidatedTotals.income)}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-muted-foreground">Expenses</p>
                                            <p className="text-lg font-semibold">
                                                {formatCurrency(consolidatedTotals.expenses)}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-muted-foreground">Net Income</p>
                                            <p className="text-lg font-semibold">
                                                {formatCurrency(consolidatedTotals.net_income)}
                                            </p>
                                        </div>
                                    </div>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Branch</TableHead>
                                                <TableHead className="text-right">Revenue</TableHead>
                                                <TableHead className="text-right">Net Income</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {(
                                                consolidated as {
                                                    branches?: Array<{
                                                        branch_name: string;
                                                        totals: { income: number; net_income: number };
                                                    }>;
                                                }
                                            )?.branches?.map((b) => (
                                                <TableRow key={b.branch_name}>
                                                    <TableCell>{b.branch_name}</TableCell>
                                                    <TableCell className="text-right">
                                                        {formatCurrency(b.totals.income)}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {formatCurrency(b.totals.net_income)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </>
                            ) : null}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="cash">
                    <Card>
                        <CardHeader>
                            <CardTitle>Cash Collection</CardTitle>
                            <CardDescription>
                                % of invoiced amount collected — Individual vs Corporate
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {loadingCash ? (
                        <AccountingReportSkeleton compact rows={3} />
      ) : (
                                <>
                                    <p className="text-sm mb-4">
                                        Overall collection rate:{" "}
                                        <strong>{cashTotals?.collection_rate_percent ?? 0}%</strong>
                                    </p>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Segment</TableHead>
                                                <TableHead className="text-right">Invoiced</TableHead>
                                                <TableHead className="text-right">Collected</TableHead>
                                                <TableHead className="text-right">Rate %</TableHead>
                                                <TableHead className="text-right">Invoices</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {cashSegments.map((s) => (
                                                <TableRow key={s.label}>
                                                    <TableCell>{s.label}</TableCell>
                                                    <TableCell className="text-right">
                                                        {formatCurrency(s.invoiced)}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {formatCurrency(s.collected)}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {s.collection_rate_percent}%
                                                    </TableCell>
                                                    <TableCell className="text-right">{s.invoice_count}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="mix">
                    <Card>
                        <CardHeader>
                            <CardTitle>Revenue Mix</CardTitle>
                            <CardDescription>By product and branch share</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {loadingMix ? (
                        <AccountingReportSkeleton compact rows={3} />
      ) : (
                                <>
                                    <div>
                                        <h3 className="font-medium mb-2">By product</h3>
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Product</TableHead>
                                                    <TableHead className="text-right">Invoiced</TableHead>
                                                    <TableHead className="text-right">Collected</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {byProduct.map((p) => (
                                                    <TableRow key={p.label}>
                                                        <TableCell>{p.label}</TableCell>
                                                        <TableCell className="text-right">
                                                            {formatCurrency(p.invoiced)}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {formatCurrency(p.collected)}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                    <div>
                                        <h3 className="font-medium mb-2">By branch</h3>
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Branch</TableHead>
                                                    <TableHead className="text-right">Invoiced</TableHead>
                                                    <TableHead className="text-right">Share %</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {byBranch.map((b) => (
                                                    <TableRow key={b.branch_name}>
                                                        <TableCell>{b.branch_name}</TableCell>
                                                        <TableCell className="text-right">
                                                            {formatCurrency(b.invoiced)}
                                                        </TableCell>
                                                        <TableCell className="text-right">{b.share_percent}%</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
