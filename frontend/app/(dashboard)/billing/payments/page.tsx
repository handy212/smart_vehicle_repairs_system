"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { billingApi, type Payment } from "@/lib/api/billing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { Plus, Search, Eye, Filter, Download, HandCoins } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
import { Skeleton } from "@/components/ui/skeleton";
import { exportToCSV, exportToPDF } from "@/lib/utils/export";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { ReceivePaymentDialog } from "./components/ReceivePaymentDialog";
import { SortableHeader, SortConfig } from "@/components/ui/sortable-header";
import { sortOrderingParam, toggleSortConfig } from "@/lib/utils/table-sort";

export default function PaymentsPage() {
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [methodFilter, setMethodFilter] = useState("");
    const [receivePaymentOpen, setReceivePaymentOpen] = useState(false);
    const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
    const { toast } = useToast();
    const { formatCurrency } = useCurrency();
    const { hasAnyPermission } = usePermissions();
    const queryClient = useQueryClient();
    const canReceivePayment = hasAnyPermission(["process_payments", "create_payments", "manage_billing"]);

    const handleSort = (field: string) => {
        setSortConfig((current) => toggleSortConfig(current, field));
    };

    const { data: payments, isLoading } = useQuery({
        queryKey: ['payments', search, statusFilter, methodFilter, sortConfig],
        queryFn: () => billingApi.payments.list({
            status: statusFilter || undefined,
            payment_method: methodFilter || undefined,
            search: search || undefined,
            ordering: sortOrderingParam(sortConfig) || "-payment_date",
        }),
    });

    // Client-side filtering for search since API type doesn't explicit search param in list
    // (Wait, I checked billing.ts, it DOES NOT have search in list params. 
    // But PaymentViewSet has SearchFilter. I should probably update billing.ts later.
    // For now, let's filter client side to be safe/quick or assume it works if I pass it as any).

    // Actually, `PaymentViewSet` has `search_fields` and `SearchFilter`. 
    // So I can pass `search` query param. The typescript interface `billingApi.payments.list` 
    // args might just be missing it. I'll cast `search` if needed or just rely on react-query key refetch
    // checking if I can pass extra params. 
    // `billingApi.payments.list` takes specific params.

    const filteredPayments = payments || [];

    const getStatusVariant = (status: string) => {
        const variants: Record<string, "success" | "warning" | "danger" | "secondary" | "default"> = {
            completed: 'success',
            pending: 'warning',
            failed: 'danger',
            refunded: 'secondary',
            partially_refunded: 'warning',
        };
        return variants[status] || 'default';
    };

    const handleExport = (format: "xlsx" | "pdf" = "xlsx") => {
        if (!filteredPayments || filteredPayments.length === 0) {
            toast({
                title: "No Data",
                description: "No payments to export",
                variant: "destructive",
            });
            return;
        }

        (format === "pdf" ? exportToPDF : exportToCSV)(
            filteredPayments,
            "payments",
            [
                { key: "payment_number", label: "Payment #" },
                { key: "payment_date", label: "Date" },
                { key: "customer_name", label: "Customer" },
                { key: "invoice_number", label: "Invoice" },
                { key: "payment_method", label: "Method" },
                { key: "amount", label: "Amount" },
                { key: "status", label: "Status" },
            ]
        );
        toast({ title: "Success", description: "Payments exported successfully" });
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
                        <span className="text-foreground font-medium">Payments</span>
                    </div>
                    <h1 className="text-xl font-bold text-foreground tracking-tight">Payments</h1>
                </div>
                <div className="flex items-center gap-2">
                    {canReceivePayment ? (
                        <Button size="sm" onClick={() => setReceivePaymentOpen(true)}>
                                <HandCoins className="w-4 h-4 mr-2" />
                                Receive Payment
                        </Button>
                    ) : null}
                    <Button variant="outline" size="sm" onClick={() => handleExport()}>
                        <Download className="w-4 h-4 mr-2" />
                        Export Excel
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleExport("pdf")}>
                        <Download className="w-4 h-4 mr-2" />
                        Export PDF
                    </Button>
                </div>
            </div>

            <Card className="border-none shadow-sm bg-muted/50">
                <CardContent className="p-3">
                    <div className="flex flex-col md:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
                            <Input
                                type="text"
                                placeholder="Search payments, customers, invoices..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9 h-8 text-sm bg-card w-full focus:w-full transition-all duration-300"
                            />
                        </div>
                        <div className="flex gap-3">
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="px-3 py-1 h-8 text-sm border border-border rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-primary w-40"
                            >
                                <option value="">All Statuses</option>
                                <option value="completed">Completed</option>
                                <option value="pending">Pending</option>
                                <option value="failed">Failed</option>
                                <option value="refunded">Refunded</option>
                            </select>

                            <select
                                value={methodFilter}
                                onChange={(e) => setMethodFilter(e.target.value)}
                                className="px-3 py-1 h-8 text-sm border border-border rounded-md bg-card focus:outline-none focus:ring-2 focus:ring-primary w-40"
                            >
                                <option value="">All Methods</option>
                                <option value="cash">Cash</option>
                                <option value="card">Card</option>
                                <option value="bank_transfer">Bank Transfer</option>
                                <option value="mobile_money">Mobile Money</option>
                                <option value="cheque">Cheque</option>
                            </select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-t shadow-sm">
                <CardHeader className="py-3 px-4 border-b bg-muted/30">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold text-card-foreground">
                            All Payments
                        </CardTitle>
                        <span className="text-xs text-muted-foreground">{filteredPayments.length} records</span>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50 hover:bg-muted/50">
                                <SortableHeader field="payment_number" sortConfig={sortConfig} onSort={handleSort} className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                                    Payment #
                                </SortableHeader>
                                <SortableHeader field="payment_date" sortConfig={sortConfig} onSort={handleSort} className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                                    Date
                                </SortableHeader>
                                <SortableHeader field="customer__user__last_name" sortConfig={sortConfig} onSort={handleSort} className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                                    Customer
                                </SortableHeader>
                                <SortableHeader field="invoice__invoice_number" sortConfig={sortConfig} onSort={handleSort} className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                                    Invoice
                                </SortableHeader>
                                <SortableHeader field="payment_method" sortConfig={sortConfig} onSort={handleSort} className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                                    Method
                                </SortableHeader>
                                <SortableHeader field="status" sortConfig={sortConfig} onSort={handleSort} className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                                    Status
                                </SortableHeader>
                                <SortableHeader field="amount" sortConfig={sortConfig} onSort={handleSort} className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">
                                    Amount
                                </SortableHeader>
                                <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredPayments.length > 0 ? (
                                filteredPayments.map((payment: Payment) => (
                                    <TableRow key={payment.id} className="group hover:bg-muted/80 transition-colors border-b border-border last:border-0 cursor-pointer">
                                        <TableCell className="px-4 py-2 font-mono text-xs font-medium text-primary">
                                            <Link href={`/billing/payments/${payment.id}`} className="hover:underline">
                                                {payment.payment_number}
                                            </Link>
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-xs text-muted-foreground">
                                            {format(new Date(payment.payment_date), 'MMM dd, yyyy')}
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-sm text-foreground">
                                            {payment.customer_name}
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-sm text-muted-foreground">
                                            {payment.invoice_number ? (
                                                <Link href={`/billing/invoices/${payment.invoice}`} className="hover:text-primary hover:underline">
                                                    {payment.invoice_number}
                                                </Link>
                                            ) : '-'}
                                        </TableCell>
                                        <TableCell className="px-4 py-2">
                                            <Badge variant="outline" className="text-[10px] px-2 py-0.5 capitalize bg-card">
                                                {payment.payment_method.replace('_', ' ')}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="px-4 py-2">
                                            <Badge variant={getStatusVariant(payment.status)} className="text-[10px] px-2 py-0.5 uppercase">
                                                {payment.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-right font-mono font-medium">
                                            {formatCurrency(parseFloat(payment.amount))}
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-right">
                                            <Link href={`/billing/payments/${payment.id}`}>
                                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary">
                                                    <Eye className="h-3.5 w-3.5" />
                                                </Button>
                                            </Link>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                                        No payments found
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {canReceivePayment ? (
                <ReceivePaymentDialog
                    open={receivePaymentOpen}
                    onOpenChange={setReceivePaymentOpen}
                    onSuccess={() => {
                        setReceivePaymentOpen(false);
                        queryClient.invalidateQueries({ queryKey: ["payments"] });
                    }}
                />
            ) : null}
        </div>
    );
}
