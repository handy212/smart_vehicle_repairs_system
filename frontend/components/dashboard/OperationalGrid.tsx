"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, AlertTriangle, CheckCircle, FileText, Plus } from "lucide-react";
import Link from "next/link";
import { useCurrency } from "@/lib/hooks/useCurrency";

interface OperationalGridProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
insights: any[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
topJobs: any[];
}

export function OperationalGrid({ insights, topJobs }: OperationalGridProps) {
    const { formatCurrency } = useCurrency();

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Insights / Action Required */}
            <Card className="shadow-sm border-none ring-1 ring-gray-200 dark:ring-gray-800 h-full">
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        Insights & Actions
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {insights.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm">
                            <CheckCircle className="w-8 h-8 mb-2 text-emerald-500 opacity-50" />
                            All systems normal.
                        </div>
                    ) : (
                        insights.map((insight, idx) => (
                            <div
                                key={idx}
                                className={`p-3 rounded-lg border text-sm ${insight.type === 'danger' ? 'bg-rose-50 border-rose-100 text-rose-800' :
                                    insight.type === 'warning' ? 'bg-amber-50 border-amber-100 text-amber-800' :
                                        'bg-primary/10 border-orange-100 text-orange-800'
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

            {/* Top Jobs */}
            <Card className="shadow-sm border-none ring-1 ring-gray-200 dark:ring-gray-800 h-full">
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <FileText className="w-4 h-4 text-primary" />
                        Top Performing Jobs
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {topJobs.map((job) => (
                            <div key={job.work_order_id} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                                <div>
                                    <p className="font-medium text-sm">{job.customer}</p>
                                    <p className="text-xs text-muted-foreground">{job.vehicle}</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-mono text-sm font-medium text-emerald-600">
                                        {formatCurrency(job.gross_profit)}
                                    </p>
                                    <Badge variant="outline" className="text-[10px] h-4">
                                        {Math.round(job.margin_percent)}% Margin
                                    </Badge>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 pt-2 border-t">
                        <Link href="/accounting/reports/job-profitability">
                            <Button variant="ghost" size="sm" className="w-full text-xs">View All Jobs</Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card className="shadow-sm border-none ring-1 ring-gray-200 dark:ring-gray-800 h-full bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
                <CardHeader>
                    <CardTitle className="text-base">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3">
                    <Link href="/accounting/journal-entries/new">
                        <Button variant="outline" className="w-full h-20 flex flex-col gap-2 hover:border-primary hover:text-primary hover:bg-primary/10 transition-all">
                            <FileText className="w-5 h-5" />
                            <span className="text-xs">New Journal Entry</span>
                        </Button>
                    </Link>
                    <Link href="/accounting/banking/reconciliation">
                        <Button variant="outline" className="w-full h-20 flex flex-col gap-2 hover:border-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 transition-all">
                            <CheckCircle className="w-5 h-5" />
                            <span className="text-xs">Reconcile Bank</span>
                        </Button>
                    </Link>
                    <Link href="/accounting/reports/profit-loss">
                        <Button variant="outline" className="w-full h-20 flex flex-col gap-2 hover:border-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
                            <FileText className="w-5 h-5" />
                            <span className="text-xs">View P&L</span>
                        </Button>
                    </Link>
                    <Link href="/accounting/budgets">
                        <Button variant="outline" className="w-full h-20 flex flex-col gap-2 hover:border-amber-500 hover:text-amber-600 hover:bg-amber-50 transition-all">
                            <Plus className="w-5 h-5" />
                            <span className="text-xs">New Budget</span>
                        </Button>
                    </Link>
                </CardContent>
            </Card>
        </div>
    );
}
