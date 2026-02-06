"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2, Save, Loader2 } from "lucide-react";
import { useToast } from "@/lib/hooks/useToast";
import Link from "next/link";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { useCurrency } from "@/lib/hooks/useCurrency";

export default function NewJournalEntryPage() {
    const router = useRouter();
    const { toast } = useToast();
    const { formatCurrency } = useCurrency();
    const queryClient = useQueryClient();

    const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
    const [description, setDescription] = useState("");
    const [reference, setReference] = useState("");

    // Initial lines: 2 empty lines
    const [lines, setLines] = useState([
        { account_id: "", description: "", debit: "", credit: "" },
        { account_id: "", description: "", debit: "", credit: "" },
    ]);

    // Fetch Accounts
    const { data: accounts, isLoading: accountsLoading } = useQuery({
        queryKey: ["accounting", "accounts"],
        queryFn: () => accountingApi.getAccounts(),
    });

    const createMutation = useMutation({
        mutationFn: (data: any) => accountingApi.createJournalEntry(data),
        onSuccess: () => {
            toast({
                title: "Journal Entry Created",
                description: "The journal entry has been successfully posted.",
                variant: 'default', // 'success' is not standard in some toast libs, using default
            });
            queryClient.invalidateQueries({ queryKey: ["accounting"] });
            router.push("/accounting");
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.response?.data?.detail || "Failed to create journal entry.",
                variant: "destructive",
            });
        },
    });

    const updateLine = (index: number, field: string, value: string) => {
        const newLines = [...lines];
        (newLines[index] as any)[field] = value;

        // Auto-clear opposite field if debit/credit is entered
        if (field === 'debit' && value) (newLines[index] as any).credit = "";
        if (field === 'credit' && value) (newLines[index] as any).debit = "";

        setLines(newLines);
    };

    const addLine = () => {
        setLines([...lines, { account_id: "", description: "", debit: "", credit: "" }]);
    };

    const removeLine = (index: number) => {
        if (lines.length <= 2) return; // Prevent removing below 2 lines
        const newLines = lines.filter((_, i) => i !== index);
        setLines(newLines);
    };

    const totalDebits = lines.reduce((sum, line) => sum + (parseFloat(line.debit) || 0), 0);
    const totalCredits = lines.reduce((sum, line) => sum + (parseFloat(line.credit) || 0), 0);
    const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;
    const isValid = description && lines.every(l => l.account_id && (l.debit || l.credit)) && isBalanced && totalDebits > 0;

    const handleSubmit = () => {
        if (!isValid) return;

        const transactions = lines.map(line => ({
            account_id: parseInt(line.account_id),
            description: line.description || description, // Fallback to header description if line desc empty
            amount: parseFloat(line.debit) || parseFloat(line.credit),
            transaction_type: parseFloat(line.debit) ? 'debit' : 'credit'
        }));

        createMutation.mutate({
            date,
            description,
            reference,
            transactions
        });
    };

    if (accountsLoading) return <div>Loading...</div>;

    return (
        <div className="space-y-6 p-6 max-w-5xl mx-auto">
            <div className="flex items-center gap-4">
                <Link href="/accounting">
                    <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-foreground text-muted-foreground dark:hover:text-gray-100">
                        <ArrowLeft className="w-4 h-4 mr-1" />
                        Back
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold">New Journal Entry</h1>
                    <p className="text-sm text-muted-foreground">Create a manual double-entry record</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Entry Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Date</label>
                            <Input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <label className="text-sm font-medium">Description</label>
                            <Input
                                placeholder="e.g. Monthly Depreciation"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Reference (Optional)</label>
                            <Input
                                placeholder="e.g. ADJ-001"
                                value={reference}
                                onChange={(e) => setReference(e.target.value)}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[30%]">Account</TableHead>
                                <TableHead className="w-[30%]">Line Description</TableHead>
                                <TableHead className="w-[15%] text-right">Debit</TableHead>
                                <TableHead className="w-[15%] text-right">Credit</TableHead>
                                <TableHead className="w-[5%]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {lines.map((line, index) => (
                                <TableRow key={index}>
                                    <TableCell>
                                        <Select
                                            value={line.account_id}
                                            onValueChange={(val) => updateLine(index, 'account_id', val)}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select Account" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {accounts?.map((acc: any) => (
                                                    <SelectItem key={acc.id} value={acc.id.toString()}>
                                                        {acc.code} - {acc.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            placeholder="Description..."
                                            value={line.description}
                                            onChange={(e) => updateLine(index, 'description', e.target.value)}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            className="text-right"
                                            placeholder="0.00"
                                            value={line.debit}
                                            onChange={(e) => updateLine(index, 'debit', e.target.value)}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            className="text-right"
                                            placeholder="0.00"
                                            value={line.credit}
                                            onChange={(e) => updateLine(index, 'credit', e.target.value)}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => removeLine(index)}
                                            disabled={lines.length <= 2}
                                            className="text-muted-foreground hover:text-red-500"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <div className="p-4 border-t bg-muted/50 flex justify-between items-center">
                        <Button variant="outline" size="sm" onClick={addLine}>
                            <Plus className="w-4 h-4 mr-2" /> Add Line
                        </Button>
                        <div className="flex gap-8 text-sm font-medium">
                            <div className="flex flex-col items-end">
                                <span className="text-muted-foreground text-xs">Total Debits</span>
                                <span>{formatCurrency(totalDebits)}</span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-muted-foreground text-xs">Total Credits</span>
                                <span>{formatCurrency(totalCredits)}</span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-muted-foreground text-xs">Difference</span>
                                <span className={isBalanced ? "text-success" : "text-red-600"}>
                                    {formatCurrency(Math.abs(totalDebits - totalCredits))}
                                </span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end gap-4">
                <Button variant="outline" onClick={() => router.push("/accounting")}>Cancel</Button>
                <Button
                    onClick={handleSubmit}
                    disabled={!isValid || createMutation.isPending}
                    className="w-32"
                >
                    {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                        <>
                            <Save className="w-4 h-4 mr-2" />
                            Post Entry
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}
