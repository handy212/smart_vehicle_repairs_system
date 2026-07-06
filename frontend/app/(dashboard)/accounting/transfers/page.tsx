"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, Check, X, ArrowRightLeft } from "lucide-react";
import { format } from "date-fns";
import { useCurrency } from "@/lib/hooks/useCurrency";
import apiClient from "@/lib/api/client";
import { accountingApi, type Account, type ApiError, type FundTransfer } from "@/lib/api/accounting";
import { SortableHeader, SortConfig } from "@/components/ui/sortable-header";
import { sortOrderingParam, toggleSortConfig } from "@/lib/utils/table-sort";

type BadgeVariant = "default" | "secondary" | "danger" | "outline" | "success";

interface TransferFormData {
    from_account: string;
    to_account: string;
    amount: string;
    transfer_date: string;
    description: string;
    reference: string;
}

export default function FundTransfersPage() {
    const queryClient = useQueryClient();
    const { formatCurrency } = useCurrency();
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [formData, setFormData] = useState({
        from_account: "",
        to_account: "",
        amount: "",
        transfer_date: new Date().toISOString().split('T')[0],
        description: "",
        reference: ""
    });
    const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

    const handleSort = (field: string) => {
        setSortConfig((current) => toggleSortConfig(current, field));
    };

    // Fetch transfers
    const { data: transfers, isLoading } = useQuery({
        queryKey: ["fund-transfers", sortConfig],
        queryFn: () => accountingApi.getFundTransfers({
            ordering: sortOrderingParam(sortConfig) || "-transfer_date",
        }),
    });

    const transferRows = transfers ?? [];

    // Fetch accounts for dropdown
    const { data: accounts } = useQuery({
        queryKey: ["accounts"],
        queryFn: async () => {
            const response = await apiClient.get("/accounting/accounts/");
            return response.data;
        }
    });

    // Create transfer mutation
    const createMutation = useMutation({

        mutationFn: async (data: TransferFormData) => {
            const response = await apiClient.post("/accounting/fund-transfers/", data);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["fund-transfers"] });
            setShowCreateForm(false);
            setFormData({
                from_account: "",
                to_account: "",
                amount: "",
                transfer_date: new Date().toISOString().split('T')[0],
                description: "",
                reference: ""
            });
        },

        onError: (error: ApiError) => {
            console.error("Failed to create transfer:", error);
        }
    });

    const submitMutation = useMutation({
        mutationFn: async (id: number) => {
            const response = await apiClient.post(`/accounting/fund-transfers/${id}/submit/`);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["fund-transfers"] });
        }
    });

    const approveMutation = useMutation({
        mutationFn: async (id: number) => {
            const response = await apiClient.post(`/accounting/fund-transfers/${id}/approve/`);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["fund-transfers"] });
        }
    });

    // Complete transfer mutation
    const completeMutation = useMutation({
        mutationFn: async (id: number) => {
            const response = await apiClient.post(`/accounting/fund-transfers/${id}/complete/`);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["fund-transfers"] });
        }
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        createMutation.mutate(formData);
    };

    const getStatusBadge = (status: string) => {

        const variants: Record<string, BadgeVariant> = {
            draft: "outline",
            pending: "default",
            approved: "success",
            completed: "success",
            cancelled: "danger"
        };
        return <Badge variant={variants[status] || "outline"}>{status.toUpperCase()}</Badge>;
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Fund Transfers</h1>
                    <p className="text-muted-foreground">
                        Move funds between accounts with GL integration
                    </p>
                </div>
                <Button onClick={() => setShowCreateForm(!showCreateForm)}>
                    {showCreateForm ? <X className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                    {showCreateForm ? "Cancel" : "New Transfer"}
                </Button>
            </div>

            {showCreateForm && (
                <Card>
                    <CardHeader>
                        <CardTitle>Create Fund Transfer</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label htmlFor="from_account">From Account</Label>
                                    <select
                                        id="from_account"
                                        className="w-full border rounded px-3 py-2"
                                        value={formData.from_account}
                                        onChange={(e) => setFormData({ ...formData, from_account: e.target.value })}
                                        required
                                    >
                                        <option value="">Select account...</option>

                                        {accounts?.map((acc: Account) => (
                                            <option key={acc.id} value={acc.id}>
                                                {acc.code} - {acc.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <Label htmlFor="to_account">To Account</Label>
                                    <select
                                        id="to_account"
                                        className="w-full border rounded px-3 py-2"
                                        value={formData.to_account}
                                        onChange={(e) => setFormData({ ...formData, to_account: e.target.value })}
                                        required
                                    >
                                        <option value="">Select account...</option>

                                        {accounts?.map((acc: Account) => (
                                            <option key={acc.id} value={acc.id}>
                                                {acc.code} - {acc.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label htmlFor="amount">Amount</Label>
                                    <Input
                                        id="amount"
                                        type="number"
                                        step="0.01"
                                        value={formData.amount}
                                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                        required
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="transfer_date">Transfer Date</Label>
                                    <Input
                                        id="transfer_date"
                                        type="date"
                                        value={formData.transfer_date}
                                        onChange={(e) => setFormData({ ...formData, transfer_date: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <Label htmlFor="description">Description</Label>
                                <Textarea
                                    id="description"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    required
                                />
                            </div>

                            <div>
                                <Label htmlFor="reference">Reference (Optional)</Label>
                                <Input
                                    id="reference"
                                    value={formData.reference}
                                    onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                                />
                            </div>

                            <Button type="submit" disabled={createMutation.isPending}>
                                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Create Transfer
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Transfer History</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <SortableHeader field="transfer_number" sortConfig={sortConfig} onSort={handleSort}>Number</SortableHeader>
                                    <SortableHeader field="transfer_date" sortConfig={sortConfig} onSort={handleSort}>Date</SortableHeader>
                                    <SortableHeader field="from_account__name" sortConfig={sortConfig} onSort={handleSort}>From</SortableHeader>
                                    <SortableHeader field="to_account__name" sortConfig={sortConfig} onSort={handleSort}>To</SortableHeader>
                                    <SortableHeader field="amount" sortConfig={sortConfig} onSort={handleSort}>Amount</SortableHeader>
                                    <SortableHeader field="status" sortConfig={sortConfig} onSort={handleSort}>Status</SortableHeader>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>

                                {transferRows.map((transfer: FundTransfer & { journal_entry?: number | null }) => (
                                    <TableRow key={transfer.id}>
                                        <TableCell className="font-medium">{transfer.transfer_number}</TableCell>
                                        <TableCell>{format(new Date(transfer.transfer_date), "MMM d, yyyy")}</TableCell>
                                        <TableCell>{transfer.from_account_name}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
                                                {transfer.to_account_name}
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-semibold">{formatCurrency(transfer.amount)}</TableCell>
                                        <TableCell>{getStatusBadge(transfer.status)}</TableCell>
                                        <TableCell>
                                            {transfer.status === 'draft' && (
                                                <Button
                                                    size="sm"
                                                    onClick={() => submitMutation.mutate(transfer.id)}
                                                    disabled={submitMutation.isPending}
                                                >
                                                    Submit
                                                </Button>
                                            )}
                                            {transfer.status === 'pending' && (
                                                <Button
                                                    size="sm"
                                                    onClick={() => approveMutation.mutate(transfer.id)}
                                                    disabled={approveMutation.isPending}
                                                >
                                                    Approve
                                                </Button>
                                            )}
                                            {transfer.status === 'approved' && (
                                                <Button
                                                    size="sm"
                                                    onClick={() => completeMutation.mutate(transfer.id)}
                                                    disabled={completeMutation.isPending}
                                                >
                                                    <Check className="w-4 h-4 mr-1" />
                                                    Complete
                                                </Button>
                                            )}
                                            {transfer.status === 'completed' && transfer.journal_entry && (
                                                <span className="text-xs text-muted-foreground">
                                                    JE #{transfer.journal_entry}
                                                </span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {transferRows.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                                            No fund transfers found. Create your first transfer to get started.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
