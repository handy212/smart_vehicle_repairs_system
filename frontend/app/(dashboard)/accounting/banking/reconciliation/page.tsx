"use client";

import { cn } from "@/lib/utils/cn";
import { ACCOUNTING_TABLE_HEAD_CLASS } from "@/lib/constants/table-typography";


import { useQuery } from "@tanstack/react-query";
import { accountingApi, type Account, type BankStatement } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Check, AlertCircle, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/lib/hooks/useToast";

export default function BankReconciliationPage() {
    const router = useRouter();
    const { formatCurrency } = useCurrency();
    const { toast } = useToast();
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

    // New Statement Form State
    const [selectedAccount, setSelectedAccount] = useState("");
    const [statementDate, setStatementDate] = useState("");
    const [openingBalance, setOpeningBalance] = useState("");
    const [closingBalance, setClosingBalance] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Fetch Bank Statements
    const { data: statements, isLoading, refetch } = useQuery({
        queryKey: ["bank-statements"],
        queryFn: () => accountingApi.getBankStatements(),
    });

    // Fetch Bank Accounts for dropdown
    const { data: accounts } = useQuery({
        queryKey: ["bank-accounts"],
        queryFn: async () => {
            const allAccounts = await accountingApi.getAccounts();
            // Filter only Asset accounts that look like banks

            return allAccounts.filter((acc: Account) =>
                acc.account_type === 'asset' &&
                (acc.code.startsWith('10') ||
                    acc.name.toLowerCase().includes('bank') ||
                    acc.name.toLowerCase().includes('cash'))
            );
        }
    });

    const handleCreateStatement = async () => {
        if (!selectedAccount || !statementDate || !closingBalance) {
            toast({
                title: "Error",
                description: "Please fill in all required fields",
                variant: "destructive"
            });
            return;
        }

        try {
            setIsSubmitting(true);
            const newStatement = await accountingApi.createBankStatement({
                bank_account: selectedAccount,
                statement_date: statementDate,
                opening_balance: openingBalance || 0,
                closing_balance: closingBalance,
            });

            toast({
                title: "Success",
                description: "Statement created successfully",
                variant: "success"
            });
            setIsCreateDialogOpen(false);
            refetch(); // Refresh list

            // Redirect to upload/reconcile page
            router.push(`/accounting/banking/reconciliation/${newStatement.id}`);
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to create statement",
                variant: "destructive"
            });
            console.error(error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center pt-2">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Bank Reconciliation</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Verify and match bank transactions
                    </p>
                </div>
                <Button onClick={() => setIsCreateDialogOpen(true)} size="sm" className="h-9">
                    <Plus className="w-4 h-4 mr-2" />
                    New Statement
                </Button>
            </div>

            <Card className="border shadow-sm">
                <CardHeader className="pb-3 border-b border-border">
                    <CardTitle className="text-base">Statement History</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-muted/50 border-y border-border">
                            <TableRow className="hover:bg-transparent border-none">
                                <TableHead className={ACCOUNTING_TABLE_HEAD_CLASS}>Statement Date</TableHead>
                                <TableHead className={ACCOUNTING_TABLE_HEAD_CLASS}>Bank Account</TableHead>
                                <TableHead className={cn(ACCOUNTING_TABLE_HEAD_CLASS, "text-right")}>Opening Balance</TableHead>
                                <TableHead className={cn(ACCOUNTING_TABLE_HEAD_CLASS, "text-right")}>Closing Balance</TableHead>
                                <TableHead className={ACCOUNTING_TABLE_HEAD_CLASS}>Status</TableHead>
                                <TableHead className={cn(ACCOUNTING_TABLE_HEAD_CLASS, "text-right")}>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">Loading statements...</TableCell>
                                </TableRow>
                            ) : statements?.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                                        No bank statements found. Create one to start reconciling.
                                    </TableCell>
                                </TableRow>
                            ) : (

                                (statements || []).map((statement: BankStatement) => (
                                    <TableRow key={statement.id} className="hover:bg-muted/50 hover:bg-muted/50 border-b border-border">
                                        <TableCell className="px-4 py-2 text-sm text-foreground">
                                            <div className="flex items-center">
                                                <FileText className="w-4 h-4 mr-2 text-muted-foreground" />
                                                {format(new Date(statement.statement_date), 'MMM d, yyyy')}
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-sm text-muted-foreground">
                                            {statement.bank_account_name || 'Bank Account'}
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-sm font-mono text-muted-foreground text-right">
                                            {formatCurrency(statement.opening_balance)}
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-sm font-mono text-foreground font-medium text-right">
                                            {formatCurrency(statement.closing_balance)}
                                        </TableCell>
                                        <TableCell className="px-4 py-2">
                                            {statement.reconciled ? (
                                                <Badge variant="outline" className="text-xs bg-success/10 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">
                                                    <Check className="w-3 h-3 mr-1" /> Reconciled
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-xs bg-warning/10 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800">
                                                    <AlertCircle className="w-3 h-3 mr-1" /> Pending
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-right">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 text-xs"
                                                onClick={() => router.push(`/accounting/banking/reconciliation/${statement.id}`)}
                                            >
                                                {statement.reconciled ? 'View' : 'Reconcile'}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Create Statement Dialog */}
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>New Bank Reconciliation</DialogTitle>
                        <DialogDescription>
                            Enter details from your physical bank statement.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="account">Bank Account</Label>
                            <Select
                                value={selectedAccount}
                                onValueChange={(value) => setSelectedAccount(value)}
                            >
                                <SelectTrigger className="w-full" id="account">
                                    <SelectValue placeholder="Select account" />
                                </SelectTrigger>
                                <SelectContent>

                                    {accounts?.map((acc: Account) => (
                                        <SelectItem key={acc.id} value={acc.id.toString()}>
                                            {acc.code} - {acc.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="date">Statement Date</Label>
                            <Input
                                id="date"
                                type="date"
                                value={statementDate}
                                onChange={(e) => setStatementDate(e.target.value)}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="opening">Opening Balance</Label>
                                <Input
                                    id="opening"
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={openingBalance}
                                    onChange={(e) => setOpeningBalance(e.target.value)}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="closing">Closing Balance</Label>
                                <Input
                                    id="closing"
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={closingBalance}
                                    onChange={(e) => setClosingBalance(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateStatement} disabled={isSubmitting}>
                            {isSubmitting ? "Creating..." : "Start Reconciliation"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
