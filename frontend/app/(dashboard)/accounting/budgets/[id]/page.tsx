"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { Loader2, Plus, ArrowLeft, Save, Trash2 } from "lucide-react";
import apiClient from "@/lib/api/client";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useToast } from "@/lib/hooks/useToast";

interface Account {
    id: number;
    code: string;
    name: string;
    account_type: string;
}

interface BudgetLine {
    id?: number;
    account: number;
    account_code?: string;
    account_name?: string;
    amount: number;
    period: string;
    notes?: string;
}

export default function BudgetDetailEditPage() {
    const params = useParams();
    const router = useRouter();
    const budgetId = params.id;
    const { formatCurrency } = useCurrency();
    const { success, error } = useToast();
    const queryClient = useQueryClient();


    const [newLine, setNewLine] = useState<Partial<BudgetLine>>({
        amount: 0,
        period: "annual",
    });

    // Fetch budget details
    const { data: budget, isLoading: isLoadingBudget } = useQuery({
        queryKey: ["budget", budgetId],
        queryFn: async () => {
            const response = await apiClient.get(`/accounting/budgets/${budgetId}/`);
            return response.data;
        },
    });

    // Fetch budget lines
    const { data: lines, isLoading: isLoadingLines } = useQuery({
        queryKey: ["budget-lines", budgetId],
        queryFn: async () => {
            const response = await apiClient.get(`/accounting/budget-lines/?budget=${budgetId}`);
            return response.data.results || response.data;
        },
    });

    // Fetch accounts for selection
    const { data: accounts } = useQuery({
        queryKey: ["accounts-options"],
        queryFn: async () => {
            const response = await apiClient.get("/accounting/accounts/?is_active=true");
            return response.data.results || response.data;
        },
    });

    const createLineMutation = useMutation({

        mutationFn: async (data: Partial<BudgetLine>) => {
            return apiClient.post("/accounting/budget-lines/", { ...data, budget: budgetId });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["budget-lines", budgetId] });
            setNewLine({ amount: 0, period: "annual" });
            success("Budget line added successfully");
        },
        onError: () => error("Failed to add budget line"),
    });

    const deleteLineMutation = useMutation({
        mutationFn: async (id: number) => {
            return apiClient.delete(`/accounting/budget-lines/${id}/`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["budget-lines", budgetId] });
            success("Budget line removed");
        },
        onError: () => error("Failed to remove line"),
    });

    const handleAddLine = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newLine.account || !newLine.amount) {
            error("Please select an account and enter an amount");
            return;
        }
        createLineMutation.mutate(newLine);
    };

    if (isLoadingBudget) return <div className="flex justify-center p-12"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" onClick={() => router.back()}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                </Button>
                <div>
                    <h1 className="text-xl font-bold tracking-tight">{budget.name}</h1>
                    <p className="text-muted-foreground">FY{budget.fiscal_year} Allocations</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Add Line Form */}
                <Card className="md:col-span-1 border shadow-sm h-fit">
                    <CardHeader className="bg-muted/50 pb-3">
                        <CardTitle className="text-base font-medium">Add Allocation</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-4">
                        <div className="space-y-2">
                            <Label className="text-xs">Account</Label>
                            <select
                                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                value={newLine.account || ""}
                                onChange={(e) => setNewLine({ ...newLine, account: parseInt(e.target.value) })}
                            >
                                <option value="">Select Account...</option>
                                {accounts?.map((acc: Account) => (
                                    <option key={acc.id} value={acc.id}>
                                        {acc.code} - {acc.name} ({acc.account_type})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs">Period</Label>
                            <select
                                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                value={newLine.period}
                                onChange={(e) => setNewLine({ ...newLine, period: e.target.value })}
                            >
                                <option value="annual">Annual (Full Year)</option>
                                <option value="q1">Q1</option>
                                <option value="q2">Q2</option>
                                <option value="q3">Q3</option>
                                <option value="q4">Q4</option>
                                <option value="jan">January</option>
                                <option value="feb">February</option>
                                {/* Add remaining months if needed */}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs">Amount</Label>
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={newLine.amount}
                                onChange={(e) => setNewLine({ ...newLine, amount: parseFloat(e.target.value) })}
                                className="h-9"
                            />
                        </div>

                        <Button
                            className="w-full"
                            size="sm"
                            onClick={handleAddLine}
                            disabled={createLineMutation.isPending}
                        >
                            {createLineMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                            Add Line
                        </Button>
                    </CardContent>
                </Card>

                {/* Lines List */}
                <Card className="md:col-span-2 border shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Allocated Lines ({lines?.length || 0})</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[100px]">Code</TableHead>
                                    <TableHead>Account</TableHead>
                                    <TableHead>Period</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoadingLines ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8">
                                            <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                                        </TableCell>
                                    </TableRow>
                                ) : lines?.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                                            No budget lines allocated yet.
                                        </TableCell>
                                    </TableRow>
                                ) : (

                                    lines?.map((line: BudgetLine) => (
                                        <TableRow key={line.id}>
                                            <TableCell className="font-mono text-xs">{line.account_code}</TableCell>
                                            <TableCell className="text-sm">{line.account_name}</TableCell>
                                            <TableCell className="uppercase text-xs">{line.period}</TableCell>
                                            <TableCell className="text-right font-mono text-sm">
                                                {formatCurrency(line.amount)}
                                            </TableCell>
                                            <TableCell>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                    onClick={() => line.id && deleteLineMutation.mutate(line.id)}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
