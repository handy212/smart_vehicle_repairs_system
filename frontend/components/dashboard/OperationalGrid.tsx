"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, AlertTriangle, CheckCircle, FileText, Plus } from "lucide-react";
import Link from "next/link";
import { useCurrency } from "@/lib/hooks/useCurrency";

type Insight = {
    type: "danger" | "warning" | "info";
    title: string;
    message: string;
    action_link?: string;
};

type TopJob = {
    work_order_id: number | string;
    customer: string;
    vehicle: string;
    gross_profit: number;
    margin_percent: number;
};

interface OperationalGridProps {
    insights: Insight[];
    topJobs: TopJob[];
}

export function OperationalGrid({ insights = [], topJobs = [] }: OperationalGridProps) {
    const { formatCurrency } = useCurrency();

    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card className="h-full">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-warning" />
                        Insights & Actions
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {insights.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm">
                            <CheckCircle className="w-8 h-8 mb-2 text-success/50" />
                            All systems normal.
                        </div>
                    ) : (
                        insights.map((insight, idx) => (
                            <div
                                key={idx}
                                className={`rounded-lg border p-3 text-sm ${
                                    insight.type === "danger"
                                        ? "border-destructive/20 bg-destructive/10 text-destructive"
                                        : insight.type === "warning"
                                            ? "border-warning/20 bg-warning/10 text-warning"
                                            : "border-primary/20 bg-primary/10 text-primary"
                                }`}
                            >
                                <p className="font-semibold mb-1">{insight.title}</p>
                                <p className="opacity-90 mb-2 text-xs">{insight.message}</p>
                                {insight.action_link && (
                                    <Link href={insight.action_link} className="inline-flex items-center text-xs font-medium hover:underline">
                                        Take Action <ArrowRight className="w-3 h-3 ml-1" />
                                    </Link>
                                )}
                            </div>
                        ))
                    )}
                </CardContent>
            </Card>

            <Card className="h-full">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <FileText className="w-4 h-4 text-primary" />
                        Top Performing Jobs
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {topJobs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm">
                            <FileText className="w-8 h-8 mb-2 opacity-40" />
                            No profitable jobs in this period.
                        </div>
                    ) : (
                    <div className="space-y-3">
                        {topJobs.map((job) => (
                            <Link
                                key={job.work_order_id}
                                href={`/workorders/${job.work_order_id}`}
                                className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0 hover:bg-muted/30 -mx-1 px-1 rounded transition-colors"
                            >
                                <div>
                                    <p className="font-medium text-sm">{job.customer}</p>
                                    <p className="text-xs text-muted-foreground">{job.vehicle}</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-mono text-sm font-medium text-success">
                                        {formatCurrency(job.gross_profit)}
                                    </p>
                                    <Badge variant="outline" className="text-[10px] h-4">
                                        {Math.round(job.margin_percent ?? 0)}% Margin
                                    </Badge>
                                </div>
                            </Link>
                        ))}
                    </div>
                    )}
                    <div className="mt-4 pt-2 border-t">
                        <Link href="/accounting/reports/job-profitability">
                            <Button variant="ghost" size="sm" className="w-full text-xs">View All Jobs</Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>

            <Card className="h-full">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3">
                    <Link href="/accounting/journal-entries/new">
                        <Button variant="outline" className="h-16 w-full flex-col gap-1.5">
                            <FileText className="w-5 h-5" />
                            <span className="text-xs">New Journal Entry</span>
                        </Button>
                    </Link>
                    <Link href="/accounting/banking/reconciliation">
                        <Button variant="outline" className="h-16 w-full flex-col gap-1.5">
                            <CheckCircle className="w-5 h-5" />
                            <span className="text-xs">Reconcile Bank</span>
                        </Button>
                    </Link>
                    <Link href="/accounting/reports/profit-loss">
                        <Button variant="outline" className="h-16 w-full flex-col gap-1.5">
                            <FileText className="w-5 h-5" />
                            <span className="text-xs">View P&L</span>
                        </Button>
                    </Link>
                    <Link href="/accounting/budgets">
                        <Button variant="outline" className="h-16 w-full flex-col gap-1.5">
                            <Plus className="w-5 h-5" />
                            <span className="text-xs">New Budget</span>
                        </Button>
                    </Link>
                </CardContent>
            </Card>
        </div>
    );
}
