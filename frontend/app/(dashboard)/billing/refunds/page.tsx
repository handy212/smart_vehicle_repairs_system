"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { refundApi, type Refund } from "@/lib/api/till-refund";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, CheckCircle, XCircle, Eye } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";

export default function RefundsPage() {
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const { data, isLoading } = useQuery({
        queryKey: ['refunds', statusFilter],
        queryFn: () => refundApi.list({ status: statusFilter || undefined }),
    });

    const approveMutation = useMutation({
        mutationFn: (id: number) => refundApi.approve(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['refunds'] });
            toast({ title: "Success", description: "Refund approved" });
        },
    });

    const rejectMutation = useMutation({
        mutationFn: (id: number) => refundApi.reject(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['refunds'] });
            toast({ title: "Success", description: "Refund rejected" });
        },
    });

    const filteredRefunds = data?.results?.filter((refund: Refund) => {
        if (search === "") return true;
        return refund.refund_number.toLowerCase().includes(search.toLowerCase()) ||
            refund.customer_name.toLowerCase().includes(search.toLowerCase());
    }) || [];

    const getStatusBadge = (status: string) => {
        const variants: Record<string, any> = {
            pending: 'warning',
            approved: 'default',
            completed: 'success',
            rejected: 'destructive',
            cancelled: 'secondary',
        };
        return <Badge variant={variants[status] || 'default'}>{status.toUpperCase()}</Badge>;
    };

    if (isLoading) {
        return (
            <div className="p-8 space-y-6">
                <Skeleton className="h-12 w-full" />
                <Card>
                    <CardContent className="pt-6">
                        <div className="space-y-2">
                            {[...Array(5)].map((_, i) => (
                                <Skeleton key={i} className="h-16 w-full" />
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="p-8 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Refunds</h1>
                    <p className="text-muted-foreground mt-1">
                        Manage refund requests • {data?.count || 0} total
                    </p>
                </div>
                <Link href="/billing/refunds/new">
                    <Button>
                        <Plus className="mr-2 h-4 w-4" />
                        New Refund
                    </Button>
                </Link>
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <Input
                                type="text"
                                placeholder="Search by refund # or customer..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9"
                            />
                        </div>

                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
                        >
                            <option value="">All Statuses</option>
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="completed">Completed</option>
                            <option value="rejected">Rejected</option>
                        </select>

                        {(search || statusFilter) && (
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setSearch("");
                                    setStatusFilter("");
                                }}
                            >
                                Clear
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Refunds Table */}
            <Card>
                <CardHeader>
                    <CardTitle>All Refunds</CardTitle>
                </CardHeader>
                <CardContent>
                    {filteredRefunds.length > 0 ? (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Refund #</TableHead>
                                        <TableHead>Customer</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead>Method</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Requested</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredRefunds.map((refund: Refund) => (
                                        <TableRow key={refund.id}>
                                            <TableCell>
                                                <code className="text-sm font-mono">{refund.refund_number}</code>
                                            </TableCell>
                                            <TableCell>{refund.customer_name}</TableCell>
                                            <TableCell className="font-mono font-semibold">
                                                ${parseFloat(refund.amount).toLocaleString()}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-xs">{refund.refund_method}</Badge>
                                            </TableCell>
                                            <TableCell>{getStatusBadge(refund.status)}</TableCell>
                                            <TableCell>
                                                <div>
                                                    <div className="text-sm">{format(new Date(refund.requested_at), 'MMM dd, yyyy')}</div>
                                                    <div className="text-xs text-muted-foreground">{refund.requested_by_name}</div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <Link href={`/billing/refunds/${refund.id}`}>
                                                        <Button variant="ghost" size="sm">
                                                            <Eye className="h-4 w-4" />
                                                        </Button>
                                                    </Link>
                                                    {refund.status === 'pending' && (
                                                        <>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => approveMutation.mutate(refund.id)}
                                                                disabled={approveMutation.isPending}
                                                            >
                                                                <CheckCircle className="h-4 w-4 text-green-600" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => rejectMutation.mutate(refund.id)}
                                                                disabled={rejectMutation.isPending}
                                                            >
                                                                <XCircle className="h-4 w-4 text-red-600" />
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <p className="text-muted-foreground">No refunds found.</p>
                            <Link href="/billing/refunds/new">
                                <Button className="mt-4" variant="outline">
                                    <Plus className="mr-2 h-4 w-4" />
                                    Create First Refund
                                </Button>
                            </Link>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
