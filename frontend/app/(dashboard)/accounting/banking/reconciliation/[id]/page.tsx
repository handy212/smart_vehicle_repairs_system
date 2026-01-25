"use client";

import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Check, Plus, Upload, RefreshCw, AlertCircle, Link as LinkIcon, X, Filter } from "lucide-react";
import { useRouter, useParams } from "next/navigation";
import { format } from "date-fns";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/lib/hooks/useToast";
import { cn } from "@/lib/utils/cn";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ReconciliationDetailPage() {
    const params = useParams();
    const id = params?.id as string;
    const router = useRouter();
    const { formatCurrency } = useCurrency();
    const { toast } = useToast();

    // State
    const [selectedBankLine, setSelectedBankLine] = useState<any>(null);
    const [selectedSysTx, setSelectedSysTx] = useState<any>(null);
    const [isMatchLoading, setIsMatchLoading] = useState(false);
    const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
    const [isReconciling, setIsReconciling] = useState(false);
    const [viewMatched, setViewMatched] = useState<"unmatched" | "matched">("unmatched");

    // Create Transaction State
    const [isCreateTxDialogOpen, setIsCreateTxDialogOpen] = useState(false);
    const [createTxAccount, setCreateTxAccount] = useState("");
    const [createTxDescription, setCreateTxDescription] = useState("");
    const [isCreatingTx, setIsCreatingTx] = useState(false);

    // Fetch Statement
    const { data: statement, isLoading: isStatementLoading, refetch: refetchStatement } = useQuery({
        queryKey: ["bank-statement", id],
        queryFn: () => accountingApi.getBankStatement(id),
        enabled: !!id
    });

    // Fetch Unreconciled Transactions (only if statement loaded)
    const { data: transactions, isLoading: isTxLoading, refetch: refetchTx } = useQuery({
        queryKey: ["unreconciled-transactions", statement?.bank_account],
        queryFn: () => accountingApi.getUnreconciledTransactions(
            statement.bank_account,
            undefined,
            new Date(new Date(statement.statement_date).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        ),
        enabled: !!statement?.bank_account
    });

    // Fetch All Accounts (for Create Dialog)
    const { data: allAccounts } = useQuery({
        queryKey: ["all-accounts"],
        queryFn: async () => {
            const accs = await accountingApi.getAccounts();
            // Filter out current bank account
            return accs.filter((a: any) => a.id.toString() !== statement?.bank_account?.toString());
        },
        enabled: isCreateTxDialogOpen
    });

    // Derived State
    const bankLines = useMemo(() => statement?.lines || [], [statement]);
    const unmatchedBankLines = useMemo(() => bankLines.filter((l: any) => !l.matched), [bankLines]);
    const matchedBankLines = useMemo(() => bankLines.filter((l: any) => l.matched), [bankLines]);

    const visibleBankLines = viewMatched === "matched" ? matchedBankLines : unmatchedBankLines;

    // Calculate balances
    const reconciledBalance = useMemo(() => {
        if (!statement) return 0;
        let balance = parseFloat(statement.opening_balance);
        let movement = 0;
        matchedBankLines.forEach((l: any) => {
            const debit = parseFloat(l.debit_amount) || 0;
            const credit = parseFloat(l.credit_amount) || 0;
            movement += (debit - credit);
        });
        return balance + movement;
    }, [statement, matchedBankLines]);

    const difference = useMemo(() => {
        if (!statement) return 0;
        return reconciledBalance - parseFloat(statement.closing_balance);
    }, [reconciledBalance, statement]);

    // Handlers
    const handleMatch = async () => {
        if (!selectedBankLine || !selectedSysTx) return;

        const bankVal = (parseFloat(selectedBankLine.debit_amount) || 0) - (parseFloat(selectedBankLine.credit_amount) || 0);
        const sysVal = selectedSysTx.transaction_type === 'debit'
            ? parseFloat(selectedSysTx.amount)
            : -parseFloat(selectedSysTx.amount);

        if (Math.abs(bankVal - sysVal) > 0.01) {
            if (!confirm(`Amounts differ: Bank ${formatCurrency(bankVal)} vs System ${formatCurrency(sysVal)}. Match anyway?`)) {
                return;
            }
        }

        try {
            setIsMatchLoading(true);
            await accountingApi.matchBankLine(selectedBankLine.id, selectedSysTx.id);
            toast({
                title: "Matched",
                description: "Transaction matched successfully",
                variant: 'success'
            });
            setSelectedBankLine(null);
            setSelectedSysTx(null);
            refetchStatement();
            refetchTx();
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to match transaction",
                variant: "destructive"
            });
        } finally {
            setIsMatchLoading(false);
        }
    };

    const handleUnmatch = async () => {
        if (!selectedBankLine) return;

        try {
            setIsMatchLoading(true);
            await accountingApi.unmatchBankLine(selectedBankLine.id);
            toast({
                title: "Unmatched",
                description: "Transaction unmatched successfully",
                variant: 'success'
            });
            setSelectedBankLine(null);
            refetchStatement();
            refetchTx();
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to unmatch transaction",
                variant: "destructive"
            });
        } finally {
            setIsMatchLoading(false);
        }
    };

    const handleReconcileComplete = async () => {
        if (Math.abs(difference) > 0.01) {
            toast({
                title: "Cannot Reconcile",
                description: `Difference of ${formatCurrency(difference)} must be zero.`,
                variant: "destructive"
            });
            return;
        }

        try {
            setIsReconciling(true);
            await accountingApi.reconcileStatement(id);
            toast({
                title: "Reconciled",
                description: "Statement marked as reconciled",
                variant: 'success'
            });
            router.push('/accounting/banking/reconciliation');
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to complete reconciliation",
                variant: "destructive"
            });
        } finally {
            setIsReconciling(false);
        }
    };

    const handleUpload = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const formData = new FormData();
            formData.append('statement_file', file);
            await accountingApi.uploadBankStatement(id, file);

            toast({
                title: "Uploaded",
                description: "Statement lines imported",
                variant: 'success'
            });
            setIsUploadDialogOpen(false);
            refetchStatement();
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to upload statement",
                variant: "destructive"
            });
        }
    };

    const handleOpenCreateDialog = () => {
        if (!selectedBankLine) return;
        setCreateTxDescription(selectedBankLine.description);
        setCreateTxAccount("");
        setIsCreateTxDialogOpen(true);
    };

    const handleCreateAndMatch = async () => {
        if (!selectedBankLine || !createTxAccount) return;

        try {
            setIsCreatingTx(true);

            const bankDebit = parseFloat(selectedBankLine.debit_amount) || 0;
            const bankCredit = parseFloat(selectedBankLine.credit_amount) || 0;
            const amount = Math.abs(bankDebit - bankCredit);
            const isMoneyIn = bankDebit > 0;

            const bankTx = {
                account_id: statement.bank_account,
                amount: amount,
                transaction_type: isMoneyIn ? 'debit' : 'credit',
                description: createTxDescription
            };

            const otherTx = {
                account_id: createTxAccount,
                amount: amount,
                transaction_type: isMoneyIn ? 'credit' : 'debit',
                description: createTxDescription
            };

            const jePayload = {
                date: selectedBankLine.transaction_date,
                description: createTxDescription,
                reference: "Bank Rec Auto-Create",
                transactions: [bankTx, otherTx]
            };

            const je = await accountingApi.createJournalEntry(jePayload);
            const createdBankTx = je.transactions.find((t: any) => t.account.id.toString() === statement.bank_account.toString());

            if (createdBankTx) {
                await accountingApi.matchBankLine(selectedBankLine.id, createdBankTx.id);
                toast({
                    title: "Created & Matched",
                    description: "Transaction created and matched to bank line",
                    variant: 'success'
                });
            } else {
                toast({
                    title: "Warning",
                    description: "Transaction created but auto-match failed. Please match manually.",
                    variant: 'warning'
                });
            }

            setIsCreateTxDialogOpen(false);
            setSelectedBankLine(null);
            refetchStatement();
            refetchTx();

        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to create transaction",
                variant: 'destructive'
            });
            console.error(error);
        } finally {
            setIsCreatingTx(false);
        }
    };

    if (isStatementLoading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading reconciliation...</div>;

    return (
        <div className="space-y-4 h-[calc(100vh-100px)] flex flex-col">
            <div className="flex justify-between items-start pt-2 flex-shrink-0">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => router.push('/accounting/banking/reconciliation')}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
                            {statement?.bank_account_name} &middot; {format(new Date(statement?.statement_date), 'MMMM yyyy')}
                        </h1>
                        {statement?.reconciled &&
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Reconciled</Badge>
                        }
                    </div>
                </div>
                <div className="flex gap-2">
                    {!statement?.reconciled && (
                        <>
                            <Button variant="outline" size="sm" onClick={() => setIsUploadDialogOpen(true)}>
                                <Upload className="w-4 h-4 mr-2" />
                                Upload CSV
                            </Button>
                            <Button
                                variant={Math.abs(difference) < 0.01 ? "default" : "secondary"}
                                size="sm"
                                onClick={handleReconcileComplete}
                                disabled={isReconciling}
                                className={Math.abs(difference) < 0.01 ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                            >
                                {isReconciling ? "Saving..." : "Finish Reconciliation"}
                            </Button>
                        </>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-4 gap-4 flex-shrink-0">
                {/* Cards Summary */}
                <Card className="border shadow-none bg-gray-50/50 dark:bg-gray-800/50">
                    <CardHeader className="p-4 pb-1">
                        <CardTitle className="text-xs font-medium text-gray-500 uppercase">Statement Opening</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <div className="text-xl font-mono">{formatCurrency(statement?.opening_balance)}</div>
                    </CardContent>
                </Card>
                <Card className="border shadow-none bg-gray-50/50 dark:bg-gray-800/50">
                    <CardHeader className="p-4 pb-1">
                        <CardTitle className="text-xs font-medium text-gray-500 uppercase">Statement Closing</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <div className="text-xl font-mono">{formatCurrency(statement?.closing_balance)}</div>
                    </CardContent>
                </Card>
                <Card className={cn("border shadow-none", Math.abs(difference) < 0.01 ? "bg-green-50 dark:bg-green-900/10 border-green-200" : "bg-white")}>
                    <CardHeader className="p-4 pb-1">
                        <CardTitle className="text-xs font-medium text-gray-500 uppercase">Reconciled Balance</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <div className="text-xl font-mono font-semibold">{formatCurrency(reconciledBalance)}</div>
                        <div className="text-[10px] text-muted-foreground mt-1">Based on matched lines</div>
                    </CardContent>
                </Card>
                <Card className={cn("border shadow-none", Math.abs(difference) < 0.01 ? "bg-green-50 dark:bg-green-900/10 border-green-200" : "bg-red-50 dark:bg-red-900/10 border-red-200")}>
                    <CardHeader className="p-4 pb-1">
                        <CardTitle className="text-xs font-medium text-gray-500 uppercase">Difference</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                        <div className={cn("text-xl font-mono font-bold", Math.abs(difference) < 0.01 ? "text-green-600" : "text-red-600")}>
                            {formatCurrency(difference)}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">{Math.abs(difference) < 0.01 ? "Perfectly balanced" : "Review needed"}</div>
                    </CardContent>
                </Card>
            </div>

            <div className="flex-1 grid grid-cols-2 gap-4 min-h-0 overflow-hidden">
                <Card className="border flex flex-col h-full overflow-hidden">
                    <CardHeader className="py-2 px-4 border-b bg-gray-50 text-sm font-medium flex justify-between items-center flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <span>Statement Lines</span>
                            <Badge variant="secondary" className="text-[10px]">{visibleBankLines.length}</Badge>
                        </div>
                        <Tabs value={viewMatched} onValueChange={(v: any) => {
                            setViewMatched(v);
                            setSelectedBankLine(null);
                        }} className="w-auto">
                            <TabsList className="grid w-full grid-cols-2 h-7 bg-gray-200/50">
                                <TabsTrigger value="unmatched" className="text-xs px-2 h-6 data-[state=active]:bg-white">Unmatched</TabsTrigger>
                                <TabsTrigger value="matched" className="text-xs px-2 h-6 data-[state=active]:bg-white">Matched</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </CardHeader>
                    <div className="overflow-auto flex-1 p-0">
                        {visibleBankLines.length === 0 && (
                            <div className="p-8 text-center text-gray-500 text-sm">
                                {viewMatched === 'unmatched' ? 'No unmatched lines found. Good job!' : 'No matched lines yet.'}
                            </div>
                        )}
                        <div className="divide-y relative">
                            {visibleBankLines.map((line: any) => (
                                <div
                                    key={line.id}
                                    className={cn(
                                        "p-3 text-sm cursor-pointer transition-colors flex justify-between items-center group relative",
                                        selectedBankLine?.id === line.id ? "bg-primary/10 dark:bg-orange-900/20 border-l-4 border-primary pl-2" : "hover:bg-gray-50 dark:hover:bg-gray-800"
                                    )}
                                    onClick={() => setSelectedBankLine(selectedBankLine?.id === line.id ? null : line)}
                                >
                                    <div className="flex-1">
                                        <div className="text-gray-900 dark:text-gray-100 font-medium">{format(new Date(line.transaction_date), 'MMM d')}</div>
                                        <div className="text-xs text-gray-500 truncate max-w-[200px]" title={line.description}>{line.description}</div>
                                        {line.matched && <div className="text-[10px] text-green-600 flex items-center mt-0.5"><Check className="w-3 h-3 mr-1" /> Matched</div>}
                                    </div>
                                    <div className="font-mono text-right">
                                        {parseFloat(line.debit_amount) > 0 ? (
                                            <span className="text-green-600">+{formatCurrency(line.debit_amount)}</span>
                                        ) : (
                                            <span className="text-gray-900">-{formatCurrency(line.credit_amount)}</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </Card>

                <Card className="border flex flex-col h-full overflow-hidden">
                    <CardHeader className="py-3 px-4 border-b bg-gray-50 text-sm font-medium flex justify-between items-center flex-shrink-0">
                        <span>Unmatched System Transactions</span>
                    </CardHeader>
                    <div className="overflow-auto flex-1 p-0">
                        {isTxLoading ? (
                            <div className="p-4 text-center text-sm">Loading transactions...</div>
                        ) : (
                            <div className="divide-y">
                                {transactions?.length === 0 ? (
                                    <div className="p-8 text-center text-gray-500 text-sm">
                                        No matching transactions found.
                                    </div>
                                ) : (
                                    transactions?.map((tx: any) => (
                                        <div
                                            key={tx.id}
                                            className={cn(
                                                "p-3 text-sm cursor-pointer transition-colors flex justify-between items-center",
                                                selectedSysTx?.id === tx.id ? "bg-primary/10 dark:bg-orange-900/20 border-l-4 border-primary pl-2" : "hover:bg-gray-50 dark:hover:bg-gray-800"
                                            )}
                                            onClick={() => setSelectedSysTx(selectedSysTx?.id === tx.id ? null : tx)}
                                        >
                                            <div className="flex-1">
                                                <div className="text-gray-900 dark:text-gray-100 font-medium">
                                                    {tx.date ? format(new Date(tx.date), 'MMM d') : '-'}
                                                </div>
                                                <div className="text-xs text-gray-500 truncate max-w-[200px]">{tx.description || 'Journal Entry'}</div>
                                            </div>
                                            <div className="font-mono text-right">
                                                {tx.transaction_type === 'debit' ? (
                                                    <span className="text-green-600">+{formatCurrency(tx.amount)}</span>
                                                ) : (
                                                    <span className="text-gray-900">-{formatCurrency(tx.amount)}</span>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </Card>
            </div>

            <div className="h-14 flex items-center justify-center border-t bg-gray-50 dark:bg-gray-900 flex-shrink-0 gap-4">
                {/* State: Unmatched Selected, No Tx Selected */}
                {viewMatched === 'unmatched' && selectedBankLine && !selectedSysTx && (
                    <div className="flex items-center gap-4 animate-in slide-in-from-bottom-2 fade-in">
                        <div className="text-sm">
                            Selected: <span className="font-medium">{formatCurrency((parseFloat(selectedBankLine.debit_amount) || 0) - (parseFloat(selectedBankLine.credit_amount) || 0))}</span>
                        </div>
                        <Button onClick={handleOpenCreateDialog} variant="secondary" size="sm">
                            <Plus className="w-4 h-4 mr-2" />
                            Create Transaction
                        </Button>
                    </div>
                )}

                {/* State: Unmatched Selected, Tx Selected --> Match */}
                {viewMatched === 'unmatched' && selectedBankLine && selectedSysTx && (
                    <div className="flex items-center gap-4 animate-in slide-in-from-bottom-2 fade-in">
                        <div className="text-sm">
                            Matching amounts...
                        </div>
                        <Button onClick={handleMatch} disabled={isMatchLoading} size="sm" className="bg-primary hover:bg-primary/90">
                            {isMatchLoading ? "Matching..." : "Confirm Match"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setSelectedBankLine(null); setSelectedSysTx(null); }}>
                            Cancel
                        </Button>
                    </div>
                )}

                {/* State: Matched Selected --> Unmatch */}
                {viewMatched === 'matched' && selectedBankLine && (
                    <div className="flex items-center gap-4 animate-in slide-in-from-bottom-2 fade-in">
                        <div className="text-sm">
                            Matched Line Selected
                        </div>
                        <Button onClick={handleUnmatch} disabled={isMatchLoading} size="sm" variant="destructive">
                            {isMatchLoading ? "Unmatching..." : "Unmatch Line"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedBankLine(null)}>
                            Cancel
                        </Button>
                    </div>
                )}

                {!selectedBankLine && !selectedSysTx && (
                    <div className="text-sm text-gray-500">
                        Select a line to match, unmatch, or create transaction.
                    </div>
                )}
            </div>

            <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Upload Bank Statement</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <Label htmlFor="file" className="mb-2 block">CSV File</Label>
                        <Input id="file" type="file" accept=".csv" onChange={handleUpload} />
                        <p className="text-xs text-muted-foreground mt-2">
                            Format: Date (YYYY-MM-DD), Description, Amount (+/-)
                        </p>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={isCreateTxDialogOpen} onOpenChange={setIsCreateTxDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create & Match Transaction</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label>Bank Line Amount</Label>
                            <div className="font-mono text-lg font-bold">
                                {selectedBankLine && formatCurrency((parseFloat(selectedBankLine.debit_amount) || 0) - (parseFloat(selectedBankLine.credit_amount) || 0))}
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="desc">Description</Label>
                            <Input
                                id="desc"
                                value={createTxDescription}
                                onChange={(e) => setCreateTxDescription(e.target.value)}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="account">Counterpart Account (e.g. Expense/Income)</Label>
                            <div className="relative">
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    value={createTxAccount}
                                    onChange={(e) => setCreateTxAccount(e.target.value)}
                                >
                                    <option value="" disabled>Select account...</option>
                                    {allAccounts?.map((acc: any) => (
                                        <option key={acc.id} value={acc.id}>
                                            {acc.code} - {acc.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateTxDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateAndMatch} disabled={isCreatingTx || !createTxAccount}>
                            {isCreatingTx ? "Creating..." : "Create & Match"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
