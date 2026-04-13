"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Package, Wrench, BarChart3, DollarSign } from "lucide-react";
import apiClient from "@/lib/api/client";
import { useBranchStore } from "@/store/branchStore";
import { useCurrency } from "@/lib/hooks/useCurrency";

function ProgressBar({ value, color }: { value: number; color: string }) {
    return (
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
                className={`h-2 rounded-full transition-all duration-500 ${color}`}
                style={{ width: `${Math.min(value, 100)}%` }}
            />
        </div>
    );
}

export default function ExpenseBreakdownPage() {
    const { formatCurrency } = useCurrency();
    const { activeBranchId } = useBranchStore();
    const [filters, setFilters] = useState({
        start_date: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split("T")[0],
        end_date: new Date().toISOString().split("T")[0],
    });

    const { data: report, isLoading } = useQuery({
        queryKey: ["expense-breakdown", filters, activeBranchId],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (filters.start_date) params.append("start_date", filters.start_date);
            if (filters.end_date) params.append("end_date", filters.end_date);
            if (activeBranchId) params.append("branch_id", activeBranchId.toString());
            const response = await apiClient.get(`/accounting/reports/expense-breakdown/?${params}`);
            return response.data;
        },
    });

    const categories = report?.categories ?? {};
    const total = report?.total_expenses ?? 0;

    const categoryConfig = [
        {
            key: "parts",
            label: "Parts & Inventory",
            description: "Cost of parts issued to work orders",
            icon: Package,
            color: "bg-amber-500",
            textColor: "text-amber-600 dark:text-amber-400",
        },
        {
            key: "labor",
            label: "Direct Labor",
            description: "Technician labor costs on work orders",
            icon: Wrench,
            color: "bg-blue-500",
            textColor: "text-blue-600 dark:text-blue-400",
        },
        {
            key: "overhead",
            label: "Overhead & Operating",
            description: "Rent, utilities, admin and other indirect costs",
            icon: BarChart3,
            color: "bg-purple-500",
            textColor: "text-purple-600 dark:text-purple-400",
        },
    ];

    return (
        <div className="space-y-4">
            <div className="pt-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">Expense Breakdown</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Business expenses categorized by parts, labor, and overhead
                </p>
            </div>

            {/* Filters */}
            <Card className="border shadow-sm">
                <CardContent className="p-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label htmlFor="start_date" className="text-xs">Start Date</Label>
                            <Input
                                id="start_date"
                                type="date"
                                value={filters.start_date}
                                onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
                                className="h-9 text-sm"
                            />
                        </div>
                        <div>
                            <Label htmlFor="end_date" className="text-xs">End Date</Label>
                            <Input
                                id="end_date"
                                type="date"
                                value={filters.end_date}
                                onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
                                className="h-9 text-sm"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {isLoading ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            ) : report ? (
                <>
                    {/* Total banner */}
                    <Card className="shadow-sm border bg-muted/30">
                        <CardContent className="p-4 flex items-center gap-4">
                            <DollarSign className="w-10 h-10 text-foreground/50 shrink-0" />
                            <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Expenses</p>
                                <p className="text-3xl font-bold text-foreground">{formatCurrency(total)}</p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Category Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {categoryConfig.map(({ key, label, description, icon: Icon, color, textColor }) => {
                            const cat = categories[key] ?? { amount: 0, percent: 0 };
                            return (
                                <Card key={key} className="shadow-sm border">
                                    <CardContent className="p-4 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <div className={`p-2 rounded-lg ${color} bg-opacity-10`}>
                                                <Icon className={`w-5 h-5 ${textColor}`} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-foreground">{label}</p>
                                                <p className="text-xs text-muted-foreground">{description}</p>
                                            </div>
                                        </div>
                                        <p className={`text-2xl font-bold ${textColor}`}>{formatCurrency(cat.amount)}</p>
                                        <div className="space-y-1">
                                            <ProgressBar value={cat.percent} color={color} />
                                            <p className="text-xs text-muted-foreground text-right">{cat.percent.toFixed(1)}% of total</p>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>

                    {/* Overhead detail breakdown */}
                    {categories.overhead?.detail?.length > 0 && (
                        <Card className="border shadow-sm">
                            <CardHeader className="pb-3 border-b border-border">
                                <CardTitle className="text-base">Overhead Detail</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="divide-y divide-border">
                                    {categories.overhead.detail.map((item: { code: string; name: string; amount: number }) => (
                                        <div key={item.code} className="flex items-center justify-between px-4 py-2.5">
                                            <div className="flex items-center gap-3">
                                                <span className="font-mono text-xs text-muted-foreground w-12">{item.code}</span>
                                                <span className="text-sm text-foreground">{item.name}</span>
                                            </div>
                                            <span className="text-sm font-medium font-mono text-foreground">
                                                {formatCurrency(item.amount)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </>
            ) : (
                <div className="text-center text-muted-foreground py-12 text-sm">
                    No expense data for the selected period.
                </div>
            )}
        </div>
    );
}
