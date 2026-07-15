"use client";

import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Check, Plus, Upload } from "lucide-react";
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
import { getUserFacingError } from "@/lib/api/errors";

type ApiError = {
    response?: {
        data?: {
            error?: string;
            detail?: string;
        };
    };
};

type BankLine = {
    id: string | number;
    transaction_date: string;
    description: string;
    debit_amount: string;
    credit_amount: string;
    matched: boolean;
};

type SystemTransaction = {
    id: string | number;
    account: {
        id: string | number;
    };
    amount: string;
    transaction_type: "debit" | "credit";
    description?: string;
    date?: string;
};

type BankStatement = {
    id: string | number;
    bank_account: string | number;
    bank_account_name: string;
    statement_date: string;
    opening_balance: string;
    closing_balance: string;
    reconciled: boolean;
    lines?: BankLine[];
};

type AccountOption = {
    id: string | number;
    code: string;
    name: string;
};

type CreatedJournalEntry = {
    transactions: SystemTransaction[];
};

export default function ReconciliationDetailPage() {
    const params = useParams();
    const id = params?.id as string;
    const router = useRouter();
    const { formatCurrency } = useCurrency();
    const { toast } = useToast();

    // State

    const [selectedBankLine, setSelectedBankLine] = useState<BankLine | null>(null);
    const [selectedSysTx, setSelectedSysTx] = useState<SystemTransaction | null>(null);
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
    const { data: statement, isLoading: isStatementLoading, refetch: refetchStatement } = useQuery<BankStatement>({
        queryKey: ["bank-statement", id],
        queryFn: () => accountingApi.getBankStatement(id) as Promise<BankStatement>,
        enabled: !!id
    });

    // Fetch Unreconciled Transactions (only if statement loaded)
    const { data: transactions, isLoading: isTxLoading, refetch: refetchTx } = useQuery<SystemTransaction[]>({
        queryKey: ["unreconciled-transactions", statement?.bank_account],
        queryFn: () => {
            if (!statement) return [];
            return accountingApi.getUnreconciledTransactions(
                String(statement.bank_account),
                undefined,
                new Date(new Date(statement.statement_date).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            ) as Promise<SystemTransaction[]>;
        },
        enabled: !!statement?.bank_account
    });

    // Fetch All Accounts (for Create Dialog)
    const { data: allAccounts } = useQuery<AccountOption[]>({
        queryKey: ["all-accounts"],
        queryFn: async () => {
            const accs = await accountingApi.getAccounts() as AccountOption[];
            return accs.filter((account) => account.id.toString() !== statement?.bank_account?.toString());
        },
        enabled: isCreateTxDialogOpen
    });

    // Derived State
    const bankLines = useMemo<BankLine[]>(() => statement?.lines || [], [statement]);

    const unmatchedBankLines = useMemo(() => bankLines.filter((line) => !line.matched), [bankLines]);

    const matchedBankLines = useMemo(() => bankLines.filter((line) => line.matched), [bankLines]);

    const visibleBankLines = viewMatched === "matched" ? matchedBankLines : unmatchedBankLines;

    // Calculate balances
    const reconciledBalance = useMemo(() => {
        if (!statement) return 0;
        const balance = parseFloat(statement.opening_balance);
        let movement = 0;

        matchedBankLines.forEach((line) => {
            const debit = parseFloat(line.debit_amount) || 0;
            const credit = parseFloat(line.credit_amount) || 0;
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
            toast({
                title: "Cannot Match",
                description: `Amounts must match exactly. Bank ${formatCurrency(bankVal)} vs System ${formatCurrency(sysVal)}.`,
                variant: "destructive"
            });
            return;
        }

        try {
            setIsMatchLoading(true);
            await accountingApi.matchBankLine(String(selectedBankLine.id), String(selectedSysTx.id));
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
                description: getUserFacingError(error, "Failed to match transaction"),
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
            await accountingApi.unmatchBankLine(String(selectedBankLine.id));
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
                description: getUserFacingError(error, "Failed to unmatch transaction"),
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
                description: getUserFacingError(error, "Failed to complete reconciliation"),
                variant: "destructive"
            });
        } finally {
            setIsReconciling(false);
        }
    };


    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
                description: getUserFacingError(error, "Failed to upload statement"),
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
        if (!selectedBankLine || !createTxAccount || !statement) return;

        try {
            setIsCreatingTx(true);

            const bankDebit = parseFloat(selectedBankLine.debit_amount) || 0;
            const bankCredit = parseFloat(selectedBankLine.credit_amount) || 0;
            const amount = Math.abs(bankDebit - bankCredit);
            const isMoneyIn = bankDebit > 0;

            const bankTx = {
                account_id: Number(statement.bank_account),
                amount: amount,
                transaction_type: isMoneyIn ? 'debit' as const : 'credit' as const,
                description: createTxDescription
            };

            const otherTx = {
                account_id: Number(createTxAccount),
                amount: amount,
                transaction_type: isMoneyIn ? 'credit' as const : 'debit' as const,
                description: createTxDescription
            };

            const jePayload = {
                date: selectedBankLine.transaction_date,
                description: createTxDescription,
                reference: "Bank Rec Auto-Create",
                transactions: [bankTx, otherTx]
            };

            const je = await accountingApi.createJournalEntry(jePayload) as unknown as CreatedJournalEntry;

            const createdBankTx = je.transactions.find((transaction) => transaction.account.id.toString() === statement.bank_account.toString());

            if (createdBankTx) {
                await accountingApi.matchBankLine(String(selectedBankLine.id), String(createdBankTx.id));
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
                description: getUserFacingError(error, "Failed to create transaction"),
                variant: 'destructive'
            });
            console.error(error);
        } finally {
            setIsCreatingTx(false);
        }
    };

    if (isStatementLoading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading reconciliation...</div>;

    if (!statement) {
        return <div className="p-8 text-center text-sm text-muted-foreground">Bank statement not found.</div>;
    }

    return (
        <div className="space-y-3 h-[calc(100vh-100px)] flex flex-col">
            <div className="flex justify-between items-start border-b border-border pb-3 flex-shrink-0">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => router.push('/accounting/banking/reconciliation')}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <h1 className="text-lg font-semibold tracking-tight text-foreground">
                            {statement?.bank_account_name} &middot; {format(new Date(statement?.statement_date), 'MMMM yyyy')}
                        </h1>
                        {statement?.reconciled &&
                            <Badge variant="outline" className="bg-success/15 text-success border-success/20">Reconciled</Badge>
                        }
                    </div>
                </div>
                <div className="flex gap-2">
                    {!statement?.reconciled && (
                        <>
                            <Button variant="outline" size="sm" onClick={() => setIsUploadDialogOpen(true)}>
                                <Upload className="w-4 h-4 mr-2" />
                                Upload Excel
                            </Button>
                            <Button
                                variant={Math.abs(difference) < 0.01 ? "default" : "secondary"}
                                size="sm"
                                onClick={handleReconcileComplete}
                                disabled={isReconciling}
                                className={Math.abs(difference) < 0.01 ? "bg-success hover:bg-success text-white" : ""}
                            >
                                {isReconciling ? "Saving..." : "Finish Reconciliation"}
                            </Button>
                        </>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 flex-shrink-0">
                <Card className="border shadow-none bg-muted/50">
                    <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Statement Opening</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-1">
                        <div className="text-base font-mono">{formatCurrency(statement?.opening_balance)}</div>
                    </CardContent>
                </Card>
                <Card className="border shadow-none bg-muted/50">
                    <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Statement Closing</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-1">
                        <div className="text-base font-mono">{formatCurrency(statement?.closing_balance)}</div>
                    </CardContent>
                </Card>
                <Card className={cn("border shadow-none", Math.abs(difference) < 0.01 ? "bg-success/10 dark:bg-success/10 border-success/20" : "bg-card")}>
                    <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Reconciled Balance</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-1">
                        <div className="text-base font-mono font-semibold">{formatCurrency(reconciledBalance)}</div>
                        <div className="text-xs text-muted-foreground mt-1">Based on matched lines</div>
                    </CardContent>
                </Card>
                <Card className={cn("border shadow-none", Math.abs(difference) < 0.01 ? "bg-success/10 dark:bg-success/10 border-success/20" : "bg-destructive/10 dark:bg-destructive/10 border-destructive/20")}>
                    <CardHeader className="p-3 pb-1">
                        <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Difference</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-1">
                        <div className={cn("text-base font-mono font-bold", Math.abs(difference) < 0.01 ? "text-success" : "text-destructive")}>
                            {formatCurrency(difference)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">{Math.abs(difference) < 0.01 ? "Perfectly balanced" : "Review needed"}</div>
                    </CardContent>
                </Card>
            </div>

            <div className="flex-1 grid grid-cols-2 gap-4 min-h-0 overflow-hidden">
                <Card className="border flex flex-col h-full overflow-hidden">
                    <CardHeader className="py-2 px-4 border-b bg-muted text-sm font-medium flex justify-between items-center flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <span>Statement Lines</span>
                            <Badge variant="secondary" className="text-xs">{visibleBankLines.length}</Badge>
                        </div>

                        <Tabs value={viewMatched} onValueChange={(value) => {
                            setViewMatched(value as "unmatched" | "matched");
                            setSelectedBankLine(null);
                        }} className="w-auto">
                            <TabsList className="grid w-full grid-cols-2 h-7 bg-muted/50">
                                <TabsTrigger value="unmatched" className="text-xs px-2 h-6 data-[state=active]:bg-card">Unmatched</TabsTrigger>
                                <TabsTrigger value="matched" className="text-xs px-2 h-6 data-[state=active]:bg-card">Matched</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </CardHeader>
                    <div className="overflow-auto flex-1 p-0">
                        {visibleBankLines.length === 0 && (
                            <div className="p-8 text-center text-muted-foreground text-sm">
                                {viewMatched === 'unmatched' ? 'No unmatched lines found. Good job!' : 'No matched lines yet.'}
                            </div>
                        )}
                        <div className="divide-y relative">

                            {visibleBankLines.map((line) => (
                                <div
                                    key={line.id}
                                    className={cn(
                                        "p-3 text-sm cursor-pointer transition-colors flex justify-between items-center group relative",
                                        selectedBankLine?.id === line.id ? "bg-primary/10 dark:bg-warning/20 border-l-4 border-primary pl-2" : "hover:bg-muted hover:bg-muted"
                                    )}
                                    onClick={() => setSelectedBankLine(selectedBankLine?.id === line.id ? null : line)}
                                >
                                    <div className="flex-1">
                                        <div className="text-foreground font-medium">{format(new Date(line.transaction_date), 'MMM d')}</div>
                                        <div className="text-xs text-muted-foreground truncate max-w-[200px]" title={line.description}>{line.description}</div>
                                        {line.matched && <div className="text-xs text-success flex items-center mt-0.5"><Check className="w-3 h-3 mr-1" /> Matched</div>}
                                    </div>
                                    <div className="font-mono text-right">
                                        {parseFloat(line.debit_amount) > 0 ? (
                                            <span className="text-success">+{formatCurrency(line.debit_amount)}</span>
                                        ) : (
                                            <span className="text-foreground">-{formatCurrency(line.credit_amount)}</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </Card>

                <Card className="border flex flex-col h-full overflow-hidden">
                    <CardHeader className="py-3 px-4 border-b bg-muted text-sm font-medium flex justify-between items-center flex-shrink-0">
                        <span>Unmatched System Transactions</span>
                    </CardHeader>
                    <div className="overflow-auto flex-1 p-0">
                        {isTxLoading ? (
                            <div className="p-4 text-center text-sm">Loading transactions...</div>
                        ) : (
                            <div className="divide-y">
                                {transactions?.length === 0 ? (
                                    <div className="p-8 text-center text-muted-foreground text-sm">
                                        No matching transactions found.
                                    </div>
                                ) : (

                                    transactions?.map((tx) => (
                                        <div
                                            key={tx.id}
                                            className={cn(
                                                "p-3 text-sm cursor-pointer transition-colors flex justify-between items-center",
                                                selectedSysTx?.id === tx.id ? "bg-primary/10 dark:bg-warning/20 border-l-4 border-primary pl-2" : "hover:bg-muted hover:bg-muted"
                                            )}
                                            onClick={() => setSelectedSysTx(selectedSysTx?.id === tx.id ? null : tx)}
                                        >
                                            <div className="flex-1">
                                                <div className="text-foreground font-medium">
                                                    {tx.date ? format(new Date(tx.date), 'MMM d') : '-'}
                                                </div>
                                                <div className="text-xs text-muted-foreground truncate max-w-[200px]">{tx.description || 'Journal Entry'}</div>
                                            </div>
                                            <div className="font-mono text-right">
                                                {tx.transaction_type === 'debit' ? (
                                                    <span className="text-success">+{formatCurrency(tx.amount)}</span>
                                                ) : (
                                                    <span className="text-foreground">-{formatCurrency(tx.amount)}</span>
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

            <div className="h-14 flex items-center justify-center border-t bg-muted flex-shrink-0 gap-4">
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
                        <Button onClick={handleUnmatch} disabled={isMatchLoading || statement?.reconciled} size="sm" variant="destructive">
                            {statement?.reconciled ? "Statement Reconciled" : isMatchLoading ? "Unmatching..." : "Unmatch Line"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedBankLine(null)}>
                            Cancel
                        </Button>
                    </div>
                )}

                {!selectedBankLine && !selectedSysTx && (
                    <div className="text-sm text-muted-foreground">
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
                        <Label htmlFor="file" className="mb-2 block">Excel File</Label>
                        <Input id="file" type="file" accept=".xlsx" onChange={handleUpload} />
                        <p className="text-xs text-muted-foreground mt-2">
                            Required columns: Date (YYYY-MM-DD), Description, Amount (+/-)
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

                                    {allAccounts?.map((acc) => (
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
