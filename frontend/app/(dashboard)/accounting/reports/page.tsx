"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, TrendingUp, BarChart3, ArrowRight, DollarSign } from "lucide-react";
import Link from "next/link";

export default function ReportsPage() {
    const reports = [
        {
            title: "Trial Balance",
            description: "Verify that total debits equal total credits across all accounts",
            icon: BarChart3,
            href: "/accounting/reports/trial-balance",
            color: "text-blue-600",
            bgColor: "bg-blue-50 dark:bg-blue-900/20",
        },
        {
            title: "Income Statement",
            description: "Profit & Loss statement showing revenue and expenses",
            icon: TrendingUp,
            href: "/accounting/reports/income-statement",
            color: "text-green-600",
            bgColor: "bg-green-50 dark:bg-green-900/20",
        },
        {
            title: "Balance Sheet",
            description: "Statement of financial position showing assets, liabilities, and equity",
            icon: FileText,
            href: "/accounting/reports/balance-sheet",
            color: "text-purple-600",
            bgColor: "bg-purple-50 dark:bg-purple-900/20",
        },
        {
            title: "Cash Flow Statement",
            description: "Cash inflows and outflows from operations, investing, and financing",
            icon: DollarSign,
            href: "/accounting/reports/cash-flow",
            color: "text-orange-600",
            bgColor: "bg-orange-50 dark:bg-orange-900/20",
        },
    ];

    return (
        <div className="p-8 space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold">Financial Reports</h1>
                <p className="text-muted-foreground mt-1">
                    Access comprehensive financial statements and reports
                </p>
            </div>

            {/* Report Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {reports.map((report) => (
                    <Card key={report.href} className="hover:shadow-lg transition-shadow">
                        <CardHeader>
                            <div className={`w-12 h-12 rounded-lg ${report.bgColor} flex items-center justify-center mb-4`}>
                                <report.icon className={`h-6 w-6 ${report.color}`} />
                            </div>
                            <CardTitle className="text-xl">{report.title}</CardTitle>
                            <CardDescription className="text-sm">
                                {report.description}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Link href={report.href}>
                                <Button variant="outline" className="w-full justify-between">
                                    View Report
                                    <ArrowRight className="h-4 w-4" />
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Additional Resources */}
            <Card>
                <CardHeader>
                    <CardTitle>Additional Resources</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Link href="/accounting/general-ledger">
                        <Button variant="ghost" className="w-full justify-between">
                            <div className="flex items-center gap-3">
                                <FileText className="h-5 w-5" />
                                <div className="text-left">
                                    <div className="font-semibold">General Ledger</div>
                                    <div className="text-xs text-muted-foreground">Detailed transaction history by account</div>
                                </div>
                            </div>
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                    </Link>

                    <Link href="/accounting/accounts">
                        <Button variant="ghost" className="w-full justify-between">
                            <div className="flex items-center gap-3">
                                <FileText className="h-5 w-5" />
                                <div className="text-left">
                                    <div className="font-semibold">Chart of Accounts</div>
                                    <div className="text-xs text-muted-foreground">Browse all accounting accounts</div>
                                </div>
                            </div>
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                    </Link>
                </CardContent>
            </Card>
        </div>
    );
}
