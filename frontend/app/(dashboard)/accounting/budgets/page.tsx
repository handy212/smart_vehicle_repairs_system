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
import { Plus, Loader2, Check, X, TrendingUp, Eye, Edit } from "lucide-react";
import { format } from "date-fns";
import apiClient from "@/lib/api/client";
import Link from "next/link";
import { useBranchStore } from "@/store/branchStore";

export default function BudgetsPage() {
    const { activeBranchId } = useBranchStore();
    const queryClient = useQueryClient();
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        fiscal_year: new Date().getFullYear(),
        start_date: `${new Date().getFullYear()}-01-01`,
        end_date: `${new Date().getFullYear()}-12-31`,
        description: "",
        branch: activeBranchId || ""
    });

    // Fetch budgets
    const { data: budgets, isLoading } = useQuery({
        queryKey: ["budgets"],
        queryFn: async () => {
            const response = await apiClient.get("/accounting/budgets/");
            return response.data.results || response.data;
        }
    });

    // Fetch branches
    const { data: branches } = useQuery({
        queryKey: ["branches"],
        queryFn: async () => {
            const response = await apiClient.get("/branches/");
            return response.data.results || response.data;
        }
    });

    // Create budget mutation
    const createMutation = useMutation({
        mutationFn: async (data: any) => {
            const response = await apiClient.post("/accounting/budgets/", data);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["budgets"] });
            setShowCreateForm(false);
            setFormData({
                name: "",
                fiscal_year: new Date().getFullYear(),
                start_date: `${new Date().getFullYear()}-01-01`,
                end_date: `${new Date().getFullYear()}-12-31`,
                description: "",
                branch: ""
            });
        }
    });

    // Approve mutation
    const approveMutation = useMutation({
        mutationFn: async (id: number) => {
            const response = await apiClient.post(`/accounting/budgets/${id}/approve/`);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["budgets"] });
        }
    });

    // Activate mutation
    const activateMutation = useMutation({
        mutationFn: async (id: number) => {
            const response = await apiClient.post(`/accounting/budgets/${id}/activate/`);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["budgets"] });
        }
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        createMutation.mutate(formData);
    };

    const getBadgeVariant = (status: string) => {
        const variants: Record<string, "default" | "secondary" | "danger" | "outline" | "success"> = {
            draft: "secondary",
            approved: "outline",
            active: "success",
            closed: "danger"
        };
        return <Badge variant={variants[status] || "outline"} className="text-[10px] px-2 py-0">{status.toUpperCase()}</Badge>;
    };

    return (
        <div className="space-y-4">
            {/* Compact Header */}
            <div className="flex justify-between items-center pt-2">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Budgets</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Manage fiscal year budgets and track variance
                    </p>
                </div>
                <Button onClick={() => setShowCreateForm(!showCreateForm)} size="sm" className="h-9">
                    {showCreateForm ? <X className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                    {showCreateForm ? "Cancel" : "New Budget"}
                </Button>
            </div>

            {/* Create Form - Compact */}
            {showCreateForm && (
                <Card className="border shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Create Budget</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-4">
                        <form onSubmit={handleSubmit} className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label htmlFor="name" className="text-xs">Budget Name</Label>
                                    <Input
                                        id="name"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="FY2024 Operating Budget"
                                        className="h-9 text-sm"
                                        required
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="fiscal_year" className="text-xs">Fiscal Year</Label>
                                    <Input
                                        id="fiscal_year"
                                        type="number"
                                        value={formData.fiscal_year}
                                        onChange={(e) => setFormData({ ...formData, fiscal_year: parseInt(e.target.value) })}
                                        className="h-9 text-sm"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label htmlFor="start_date" className="text-xs">Start Date</Label>
                                    <Input
                                        id="start_date"
                                        type="date"
                                        value={formData.start_date}
                                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                                        className="h-9 text-sm"
                                        required
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="end_date" className="text-xs">End Date</Label>
                                    <Input
                                        id="end_date"
                                        type="date"
                                        value={formData.end_date}
                                        onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                                        className="h-9 text-sm"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <Label htmlFor="branch" className="text-xs">Branch</Label>
                                <select
                                    id="branch"
                                    className="w-full border rounded px-3 py-2 h-9 text-sm"
                                    value={formData.branch}
                                    onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                                >
                                    <option value="">Company-wide</option>
                                    {branches?.map((branch: any) => (
                                        <option key={branch.id} value={branch.id}>{branch.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <Label htmlFor="description" className="text-xs">Description (Optional)</Label>
                                <Textarea
                                    id="description"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Budget description"
                                    className="text-sm resize-none"
                                    rows={2}
                                />
                            </div>

                            <Button type="submit" disabled={createMutation.isPending} size="sm" className="h-9">
                                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Create Budget
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            )}

            {/* Budgets Table - Compact */}
            <Card className="border-none shadow-sm overflow-hidden ring-1 ring-gray-200 dark:ring-gray-800">
                <CardHeader className="pb-3 border-b border-border">
                    <CardTitle className="text-base">All Budgets ({budgets?.length || 0})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        </div>
                    ) : budgets?.length > 0 ? (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-muted/50 border-y border-border">
                                    <TableRow className="hover:bg-transparent border-none">
                                        <TableHead className="h-8 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4">Name</TableHead>
                                        <TableHead className="h-8 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4">Fiscal Year</TableHead>
                                        <TableHead className="h-8 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4">Period</TableHead>
                                        <TableHead className="h-8 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4">Branch</TableHead>
                                        <TableHead className="h-8 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4">Status</TableHead>
                                        <TableHead className="h-8 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4 text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {budgets.map((budget: any) => (
                                        <TableRow key={budget.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 border-b border-border">
                                            <TableCell className="px-4 py-2 text-sm font-medium text-foreground">
                                                {budget.name}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-xs text-muted-foreground">
                                                {budget.fiscal_year}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-xs text-muted-foreground">
                                                {format(new Date(budget.start_date), 'MMM d')} - {format(new Date(budget.end_date), 'MMM d, yyyy')}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-xs text-muted-foreground">
                                                {budget.branch_name || "Company-wide"}
                                            </TableCell>
                                            <TableCell className="px-4 py-2">
                                                {getBadgeVariant(budget.status)}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {budget.status === 'draft' && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => approveMutation.mutate(budget.id)}
                                                            disabled={approveMutation.isPending}
                                                            className="h-7 text-xs"
                                                        >
                                                            <Check className="w-3 h-3 mr-1" />
                                                            Approve
                                                        </Button>
                                                    )}
                                                    {budget.status === 'approved' && (
                                                        <Button
                                                            size="sm"
                                                            onClick={() => activateMutation.mutate(budget.id)}
                                                            disabled={activateMutation.isPending}
                                                            className="h-7 text-xs bg-success hover:bg-green-700"
                                                        >
                                                            <TrendingUp className="w-3 h-3 mr-1" />
                                                            Activate
                                                        </Button>
                                                    )}
                                                    <Link href={`/accounting/budgets/${budget.id}/report`}>
                                                        <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-500 hover:text-gray-700">
                                                            <Eye className="w-3 h-3 mr-1" />
                                                            Report
                                                        </Button>
                                                    </Link>
                                                    <Link href={`/accounting/budgets/${budget.id}`}>
                                                        <Button size="sm" variant="ghost" className="h-7 text-xs text-primary hover:text-primary hover:bg-primary/10">
                                                            <Edit className="w-3 h-3 mr-1" />
                                                            Manage
                                                        </Button>
                                                    </Link>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="text-center text-muted-foreground py-12 text-sm">
                            No budgets found. Create your first budget to get started.
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
