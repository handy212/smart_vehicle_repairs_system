"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { accountingApi, type CreateJournalEntryRequest } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus, Trash2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/lib/hooks/useToast";

interface TransactionLine {
    id: string;
    account_code: string;
    tx_type: 'debit' | 'credit';
    amount: string;
    description: string;
}

export default function NewJournalEntryPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const [description, setDescription] = useState("");
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [lines, setLines] = useState<TransactionLine[]>([
        { id: '1', account_code: '', tx_type: 'debit', amount: '', description: '' },
        { id: '2', account_code: '', tx_type: 'credit', amount: '', description: '' },
    ]);

    const { data: accounts } = useQuery({
        queryKey: ['chart-of-accounts'],
        queryFn: () => accountingApi.getChartOfAccounts(),
    });

    const createMutation = useMutation({
        mutationFn: (data: CreateJournalEntryRequest) => accountingApi.createJournalEntry(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
            toast({ title: "Success", description: "Journal entry created successfully" });
            router.push('/accounting/journal-entries');
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.response?.data?.error || "Failed to create journal entry",
                variant: "destructive",
            });
        },
    });

    const addLine = () => {
        setLines([...lines, {
            id: Date.now().toString(),
            account_code: '',
            tx_type: 'debit',
            amount: '',
            description: '',
        }]);
    };

    const removeLine = (id: string) => {
        if (lines.length > 2) {
            setLines(lines.filter(line => line.id !== id));
        }
    };

    const updateLine = (id: string, field: keyof TransactionLine, value: string) => {
        setLines(lines.map(line =>
            line.id === id ? { ...line, [field]: value } : line
        ));
    };

    const calculateTotals = () => {
        const totalDebit = lines
            .filter(l => l.tx_type === 'debit')
            .reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);

        const totalCredit = lines
            .filter(l => l.tx_type === 'credit')
            .reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);

        return { totalDebit, totalCredit, difference: totalDebit - totalCredit };
    };

    const totals = calculateTotals();
    const isBalanced = Math.abs(totals.difference) < 0.01;

    const handleSubmit = () => {
        // Validation
        if (!description.trim()) {
            toast({ title: "Error", description: "Description is required", variant: "destructive" });
            return;
        }

        if (lines.length < 2) {
            toast({ title: "Error", description: "At least 2 transaction lines required", variant: "destructive" });
            return;
        }

        for (const line of lines) {
            if (!line.account_code || !line.amount || parseFloat(line.amount) <= 0) {
                toast({ title: "Error", description: "All lines must have account and amount", variant: "destructive" });
                return;
            }
        }

        if (!isBalanced) {
            toast({ title: "Error", description: "Debits must equal credits", variant: "destructive" });
            return;
        }

        // Submit
        createMutation.mutate({
            description,
            timestamp: date,
            transactions: lines.map(line => ({
                account_code: line.account_code,
                tx_type: line.tx_type,
                amount: line.amount,
                description: line.description || description,
            })),
        });
    };

    return (
        <div className="p-8 space-y-6">
            {/* Back Button */}
            <Button variant="ghost" onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Journal Entries
            </Button>

            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold">New Journal Entry</h1>
                <p className="text-muted-foreground mt-1">
                    Create a manual journal entry
                </p>
            </div>

            {/* Form */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Form */}
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Entry Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label htmlFor="date">Date</Label>
                                    <Input
                                        id="date"
                                        type="date"
                                        value={date}
                                        onChange={(e) => setDate(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="description">Description *</Label>
                                    <Input
                                        id="description"
                                        placeholder="Entry description..."
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Transaction Lines */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>Transaction Lines</CardTitle>
                            <Button variant="outline" size="sm" onClick={addLine}>
                                <Plus className="mr-2 h-4 w-4" />
                                Add Line
                            </Button>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {lines.map((line, index) => (
                                    <div key={line.id} className="grid grid-cols-12 gap-2 items-end">
                                        <div className="col-span-1 text-sm font-medium text-muted-foreground">
                                            {index + 1}
                                        </div>
                                        <div className="col-span-3">
                                            <Label className="text-xs">Account</Label>
                                            <select
                                                value={line.account_code}
                                                onChange={(e) => updateLine(line.id, 'account_code', e.target.value)}
                                                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
                                            >
                                                <option value="">Select account...</option>
                                                {accounts?.accounts.map((acc) => (
                                                    <option key={acc.id} value={acc.code}>
                                                        {acc.code} - {acc.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="col-span-2">
                                            <Label className="text-xs">Type</Label>
                                            <select
                                                value={line.tx_type}
                                                onChange={(e) => updateLine(line.id, 'tx_type', e.target.value as 'debit' | 'credit')}
                                                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
                                            >
                                                <option value="debit">Debit</option>
                                                <option value="credit">Credit</option>
                                            </select>
                                        </div>
                                        <div className="col-span-2">
                                            <Label className="text-xs">Amount</Label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                placeholder="0.00"
                                                value={line.amount}
                                                onChange={(e) => updateLine(line.id, 'amount', e.target.value)}
                                                className="text-sm"
                                            />
                                        </div>
                                        <div className="col-span-3">
                                            <Label className="text-xs">Description</Label>
                                            <Input
                                                placeholder="Line description..."
                                                value={line.description}
                                                onChange={(e) => updateLine(line.id, 'description', e.target.value)}
                                                className="text-sm"
                                            />
                                        </div>
                                        <div className="col-span-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => removeLine(line.id)}
                                                disabled={lines.length <= 2}
                                                className="h-9 w-9 p-0"
                                            >
                                                <Trash2 className="h-4 w-4 text-red-600" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Summary Sidebar */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-muted-foreground">Total Debits:</span>
                                    <span className="font-mono font-semibold">
                                        ${totals.totalDebit.toFixed(2)}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-muted-foreground">Total Credits:</span>
                                    <span className="font-mono font-semibold">
                                        ${totals.totalCredit.toFixed(2)}
                                    </span>
                                </div>
                                <div className="border-t pt-2 mt-2">
                                    <div className="flex justify-between font-semibold">
                                        <span>Difference:</span>
                                        <span className={`font-mono ${isBalanced ? 'text-green-600' : 'text-red-600'
                                            }`}>
                                            ${Math.abs(totals.difference).toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className={`p-3 rounded-lg text-sm ${isBalanced
                                    ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                                    : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                                }`}>
                                {isBalanced ? '✓ Entry is balanced' : '✗ Entry must be balanced'}
                            </div>

                            <div className="space-y-2">
                                <Button
                                    className="w-full"
                                    onClick={handleSubmit}
                                    disabled={!isBalanced || createMutation.isPending}
                                >
                                    <Save className="mr-2 h-4 w-4" />
                                    {createMutation.isPending ? 'Creating...' : 'Create Entry'}
                                </Button>
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => router.back()}
                                >
                                    Cancel
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
