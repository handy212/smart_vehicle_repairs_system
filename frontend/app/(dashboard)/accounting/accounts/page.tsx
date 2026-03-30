"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { Plus, Loader2, Search, Edit, Trash2, MoreVertical } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import apiClient from "@/lib/api/client";
import { useCurrency } from "@/lib/hooks/useCurrency";

type AccountFormData = {
    code: string;
    name: string;
    account_type: string;
    balance_type: string;
    description: string;
    is_active: boolean;
};

type Account = {
    id: number;
    code: string;
    name: string;
    account_type: string;
    balance_type: string;
    description?: string | null;
    is_active: boolean;
    balance?: number;
};

type ApiError = {
    response?: {
        data?: {
            error?: string;
        };
    };
};

function getErrorMessage(error: unknown, fallback: string) {
    return (error as ApiError)?.response?.data?.error || fallback;
}

export default function ChartOfAccountsPage() {
    const { formatCurrency } = useCurrency();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingAccount, setEditingAccount] = useState<Account | null>(null);
    const [formData, setFormData] = useState<AccountFormData>({
        code: "",
        name: "",
        account_type: "asset",
        balance_type: "debit",
        description: "",
        is_active: true
    });

    const { data: accounts, isLoading } = useQuery({
        queryKey: ["accounting", "accounts"],
        queryFn: () => accountingApi.getAccounts() as Promise<Account[]>,
    });

    const createMutation = useMutation({
        mutationFn: async (data: AccountFormData) => {
            const response = await apiClient.post("/accounting/accounts/", data);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["accounting", "accounts"] });
            setDialogOpen(false);
            resetForm();
        },
        onError: (error: unknown) => {
            console.error("Failed to create account:", error);
            alert(getErrorMessage(error, "Failed to create account"));
        }
    });

    const updateMutation = useMutation({
        mutationFn: async ({ id, data }: { id: number; data: AccountFormData }) => {
            const response = await apiClient.put(`/accounting/accounts/${id}/`, data);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["accounting", "accounts"] });
            setDialogOpen(false);
            setEditingAccount(null);
            resetForm();
        },
        onError: (error: unknown) => {
            console.error("Failed to update account:", error);
            alert(getErrorMessage(error, "Failed to update account"));
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: number) => {
            const response = await apiClient.delete(`/accounting/accounts/${id}/`);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["accounting", "accounts"] });
        },
        onError: (error: unknown) => {
            console.error("Failed to delete account:", error);
            alert(getErrorMessage(error, "Failed to delete account"));
        }
    });

    const resetForm = () => {
        setFormData({
            code: "",
            name: "",
            account_type: "asset",
            balance_type: "debit",
            description: "",
            is_active: true
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (editingAccount) {
            updateMutation.mutate({ id: editingAccount.id, data: formData });
        } else {
            createMutation.mutate(formData);
        }
    };


    const handleEdit = (account: Account) => {
        setEditingAccount(account);
        setFormData({
            code: account.code,
            name: account.name,
            account_type: account.account_type,
            balance_type: account.balance_type,
            description: account.description || "",
            is_active: account.is_active
        });
        setDialogOpen(true);
    };

    const handleDelete = (account: Account) => {
        if (confirm(`Are you sure you want to delete account "${account.name}" (${account.code})?`)) {
            deleteMutation.mutate(account.id);
        }
    };

    const handleNew = () => {
        setEditingAccount(null);
        resetForm();
        setDialogOpen(true);
    };

    const filteredAccounts = (accounts ?? []).filter((account) =>
        account.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        account.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const accountsByType = filteredAccounts.reduce<Record<string, Account[]>>((acc, account) => {
        if (!acc[account.account_type]) {
            acc[account.account_type] = [];
        }
        acc[account.account_type].push(account);
        return acc;
    }, {});

    return (
        <div className="space-y-4">
            {/* Compact Header */}
            <div className="flex justify-between items-center pt-2">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Chart of Accounts</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Manage GL accounts and categories
                    </p>
                </div>
                <Button onClick={handleNew} size="sm" className="h-9">
                    <Plus className="w-4 h-4 mr-2" />
                    New Account
                </Button>
            </div>

            {/* Create/Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>{editingAccount ? "Edit Account" : "Create New Account"}</DialogTitle>
                        <DialogDescription className="text-xs">
                            {editingAccount ? "Update account details below" : "Add a new account to your chart of accounts"}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="px-6 pb-6">
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label htmlFor="code" className="mb-2 block text-sm font-medium">Account Code *</Label>
                                    <Input
                                        id="code"
                                        value={formData.code}
                                        onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                        placeholder="e.g., 1000"
                                        className="h-9 text-sm"
                                        required
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="name" className="mb-2 block text-sm font-medium">Account Name *</Label>
                                    <Input
                                        id="name"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="e.g., Cash on Hand"
                                        className="h-9 text-sm"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label htmlFor="account_type" className="mb-2 block text-sm font-medium">Account Type *</Label>
                                    <select
                                        id="account_type"
                                        className="h-9 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                                        value={formData.account_type}
                                        onChange={(e) => setFormData({ ...formData, account_type: e.target.value })}
                                    >
                                        <option value="asset">Asset</option>
                                        <option value="liability">Liability</option>
                                        <option value="equity">Equity</option>
                                        <option value="income">Income</option>
                                        <option value="expense">Expense</option>
                                    </select>
                                </div>
                                <div>
                                    <Label htmlFor="balance_type" className="mb-2 block text-sm font-medium">Balance Type *</Label>
                                    <select
                                        id="balance_type"
                                        className="h-9 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                                        value={formData.balance_type}
                                        onChange={(e) => setFormData({ ...formData, balance_type: e.target.value })}
                                    >
                                        <option value="debit">Debit</option>
                                        <option value="credit">Credit</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <Label htmlFor="description" className="mb-2 block text-sm font-medium">Description (Optional)</Label>
                                <Textarea
                                    id="description"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Brief description"
                                    className="text-sm resize-none w-full"
                                    rows={2}
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="is_active"
                                    checked={formData.is_active}
                                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                    className="h-3.5 w-3.5"
                                />
                                <Label htmlFor="is_active" className="text-sm font-medium">Active</Label>
                            </div>
                        </div>

                        <DialogFooter className="mt-6">
                            <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                {editingAccount ? "Update" : "Create"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Card className="overflow-hidden">
                <CardHeader className="border-b border-border bg-muted/10 pb-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <CardTitle className="text-base">All Accounts ({filteredAccounts.length})</CardTitle>
                        <div className="relative w-full md:w-64">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Search accounts..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="h-9 bg-background pl-9 text-sm"
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <div>

                            {Object.entries(accountsByType).map(([type, typeAccounts]) => (
                                <div key={type} className="border-b border-border last:border-b-0">
                                    <div className="border-b border-border bg-muted/20 px-4 py-2">
                                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            {type} ({typeAccounts.length})
                                        </h3>
                                    </div>
                                    <Table>
                                        <TableHeader className="bg-muted/10">
                                            <TableRow className="hover:bg-transparent border-none">
                                                <TableHead className="h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4">Code</TableHead>
                                                <TableHead className="h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4">Name</TableHead>
                                                <TableHead className="h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4">Type</TableHead>
                                                <TableHead className="h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4 text-right">Balance</TableHead>
                                                <TableHead className="h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4">Status</TableHead>
                                                <TableHead className="h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4 text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>

                                            {typeAccounts.map((account) => (
                                                <TableRow key={account.id} className="border-b border-border hover:bg-muted/20">
                                                    <TableCell className="px-4 py-2 font-mono text-xs font-medium text-card-foreground">
                                                        {account.code}
                                                    </TableCell>
                                                    <TableCell className="px-4 py-2 text-sm font-medium text-foreground">{account.name}</TableCell>
                                                    <TableCell className="px-4 py-2 text-xs text-muted-foreground capitalize">{account.balance_type}</TableCell>
                                                    <TableCell className="px-4 py-2 text-xs text-foreground text-right font-mono font-medium">
                                                        {account.balance !== undefined ? formatCurrency(account.balance) : "-"}
                                                    </TableCell>
                                                    <TableCell className="px-4 py-2">
                                                        <Badge variant="outline" className={`px-2 py-0 text-[10px] ${account.is_active
                                                            ? "border-success/20 bg-success/10 text-success"
                                                            : "border-border bg-muted text-muted-foreground"
                                                            }`}>
                                                            {account.is_active ? "Active" : "Inactive"}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="px-4 py-2 text-right">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-muted text-muted-foreground">
                                                                    <MoreVertical className="w-3.5 h-3.5" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end" className="w-40">
                                                                <DropdownMenuItem onClick={() => handleEdit(account)} className="cursor-pointer">
                                                                    <Edit className="w-4 h-4 mr-2" />
                                                                    Edit
                                                                </DropdownMenuItem>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem
                                                                    onClick={() => handleDelete(account)}
                                                                    disabled={deleteMutation.isPending}
                                                                    className="text-red-600 focus:text-red-700 cursor-pointer"
                                                                >
                                                                    <Trash2 className="w-4 h-4 mr-2" />
                                                                    Delete
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            ))}
                            {filteredAccounts.length === 0 && (
                                <div className="text-center text-muted-foreground py-12 text-sm">
                                    {searchTerm ? "No accounts match your search." : "No accounts found."}
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
