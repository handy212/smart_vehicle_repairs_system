"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { refundApi, type Refund } from "@/lib/api/till-refund";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, CheckCircle, XCircle, Eye } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";

export default function RefundsPage() {
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const queryClient = useQueryClient();
    const router = useRouter();
    const { toast } = useToast();

    const { data, isLoading } = useQuery({
        queryKey: ['refunds', statusFilter, search],
        queryFn: () => refundApi.list({
            status: statusFilter || undefined,
            search: search || undefined
        }),
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

    // Client-side filtering removed since API now handles search
    const filteredRefunds = data?.results || [];

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
        <div className="space-y-4 min-h-screen">
            <div className="flex items-center justify-between pt-2">
                <div>
                    <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
                        <Link href="/dashboard" className="hover:text-primary transition-colors">Dashboard</Link>
                        <span>/</span>
                        <Link href="/billing" className="hover:text-primary transition-colors">Billing</Link>
                        <span>/</span>
                        <span className="text-foreground font-medium">Refunds</span>
                    </div>
                    <h1 className="text-xl font-bold text-foreground tracking-tight">Refunds</h1>
                </div>
                <Link href="/billing/refunds/new">
                    <Button size="sm" className="h-9">
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        New Refund
                    </Button>
                </Link>
            </div>

            {/* Filters */}
            <Card className="border-none shadow-sm bg-gray-50/50">
                <CardContent className="p-3">
                    <div className="flex flex-col md:flex-row gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                            <Input
                                type="text"
                                placeholder="Search by refund # or customer..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9 h-8 text-sm bg-card w-64 focus:w-80 transition-all duration-300"
                            />
                        </div>

                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-3 py-1 h-8 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                            <option value="">All Statuses</option>
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="completed">Completed</option>
                            <option value="rejected">Rejected</option>
                        </select>

                        {(search || statusFilter) && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setSearch("");
                                    setStatusFilter("");
                                }}
                                className="h-8 text-gray-500 hover:text-red-600"
                            >
                                <XCircle className="w-4 h-4 mr-1" />
                                Clear
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Refunds Table */}
            <Card className="border-t shadow-sm">
                <CardHeader className="py-3 px-4 border-b bg-gray-50/30">
                    <CardTitle className="text-sm font-semibold text-card-foreground">
                        All Refunds
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {filteredRefunds.length > 0 ? (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Refund #</TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Customer</TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Amount</TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Method</TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Status</TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Requested</TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredRefunds.map((refund: Refund) => (
                                        <TableRow
                                            key={refund.id}
                                            className="group hover:bg-gray-50/80 transition-colors border-b border-gray-100 last:border-0 cursor-pointer"
                                            onDoubleClick={() => router.push(`/billing/refunds/${refund.id}`)}
                                        >
                                            <TableCell className="px-4 py-2 font-mono text-xs font-medium text-gray-700">
                                                {refund.refund_number}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-sm text-gray-900">
                                                {refund.customer_name}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 font-mono font-semibold text-sm text-gray-700">
                                                ${parseFloat(refund.amount).toLocaleString()}
                                            </TableCell>
                                            <TableCell className="px-4 py-2">
                                                <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-transparent shadow-none border">{refund.refund_method}</Badge>
                                            </TableCell>
                                            <TableCell className="px-4 py-2">
                                                <div className="scale-90 origin-left">
                                                    {getStatusBadge(refund.status)}
                                                </div>
                                            </TableCell>
                                            <TableCell className="px-4 py-2">
                                                <div>
                                                    <div className="text-xs text-gray-900">{format(new Date(refund.requested_at), 'MMM dd, yyyy')}</div>
                                                    <div className="text-[10px] text-muted-foreground">{refund.requested_by_name}</div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-right">
                                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Link href={`/billing/refunds/${refund.id}`}>
                                                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-500 hover:text-primary">
                                                            <Eye className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </Link>
                                                    {refund.status === 'pending' && (
                                                        <>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => approveMutation.mutate(refund.id)}
                                                                disabled={approveMutation.isPending}
                                                                className="h-7 w-7 p-0 text-gray-500 hover:text-green-600"
                                                            >
                                                                <CheckCircle className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => rejectMutation.mutate(refund.id)}
                                                                disabled={rejectMutation.isPending}
                                                                className="h-7 w-7 p-0 text-gray-500 hover:text-red-600"
                                                            >
                                                                <XCircle className="h-3.5 w-3.5" />
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
                            <p className="text-sm text-gray-500">No refunds found.</p>
                            <Link href="/billing/refunds/new">
                                <Button className="mt-4 h-8" variant="outline" size="sm">
                                    <Plus className="mr-1.5 h-3.5 w-3.5" />
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
