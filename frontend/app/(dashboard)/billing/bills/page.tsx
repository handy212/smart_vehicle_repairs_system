"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { billingApi, type Bill, type BillPaymentCreatePayload } from "@/lib/api/billing";
import { accountingApi, type Account } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, FileText, AlertCircle, CheckCircle, Clock, Eye, X, DollarSign, Ban, CreditCard } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { AdvancedFilters, FilterOption } from "@/components/ui/advanced-filters";
import { SortableHeader, SortConfig } from "@/components/ui/sortable-header";
import { toggleSortConfig } from "@/lib/utils/table-sort";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { BadgeProps } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/lib/hooks/useToast";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const paymentSchema = z.object({
    amount: z.string().min(1, "Amount is required"),
    payment_date: z.string().min(1, "Payment date is required"),
    payment_method: z.enum(["cash", "check", "bank_transfer", "mobile_money", "credit_card", "other"]),
    cash_account: z.string().optional(),
    bank_account: z.string().optional(),
    reference_number: z.string().optional(),
    notes: z.string().optional(),
});

type PaymentValues = z.infer<typeof paymentSchema>;

export default function BillsPage() {
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [advancedFilters, setAdvancedFilters] = useState<Record<string, unknown>>({});
    const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

    const handleSort = (field: string) => {
        setSortConfig((current) => toggleSortConfig(current, field));
        setPage(1);
    };

    const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
    const router = useRouter();
    const queryClient = useQueryClient();
    const { formatCurrency } = useCurrency();
    const { toast } = useToast();
    const { hasPermission } = usePermissions();

    const paymentForm = useForm<PaymentValues>({
        resolver: zodResolver(paymentSchema),
        defaultValues: {
            amount: "",
            payment_date: format(new Date(), "yyyy-MM-dd"),
            payment_method: "bank_transfer",
            cash_account: "",
            bank_account: "",
            reference_number: "",
            notes: "",
        },
    });

    const paymentMethod = useWatch({ control: paymentForm.control, name: "payment_method" });
    const cashAccount = useWatch({ control: paymentForm.control, name: "cash_account" });
    const bankAccount = useWatch({ control: paymentForm.control, name: "bank_account" });

    const getFilterValue = (key: string) => {
        const value = advancedFilters[key];
        return typeof value === "string" && value.length > 0 ? value : undefined;
    };

    // Advanced filter options
    const filterOptions: FilterOption[] = [
        {
            key: "status",
            label: "Status",
            type: "select",
            options: [
                { value: "draft", label: "Draft" },
                { value: "pending_approval", label: "Pending Approval" },
                { value: "rejected", label: "Rejected" },
                { value: "open", label: "Open" },
                { value: "partially_paid", label: "Partially Paid" },
                { value: "paid", label: "Paid" },
                { value: "overdue", label: "Overdue" },
                { value: "void", label: "Void" },
            ],
        },
        {
            key: "bill_date",
            label: "Bill Date",
            type: "daterange",
        },
        {
            key: "due_date",
            label: "Due Date",
            type: "daterange",
        },
    ];


    const { data: stats } = useQuery({
        queryKey: ["bill-stats"],
        queryFn: () => billingApi.bills.stats(),
    });

    const { data, isLoading } = useQuery({
        queryKey: ["bills", page, search, advancedFilters, sortConfig],
        queryFn: () => {
            const ordering = sortConfig
                ? `${sortConfig.direction === "desc" ? "-" : ""}${sortConfig.field}`
                : undefined;
            return billingApi.bills.list({
                page,
                status: getFilterValue("status"),
                search: search || undefined,
                date_from: getFilterValue("bill_date_from"),
                date_to: getFilterValue("bill_date_to"),
                due_date_from: getFilterValue("due_date_from"),
                due_date_to: getFilterValue("due_date_to"),
                ordering,
            });
        },
    });

    const { data: tillAccounts = [], isLoading: tillAccountsLoading } = useQuery({
        queryKey: ["accounting", "till-enabled-accounts"],
        queryFn: () => accountingApi.getTillEnabledAccounts(),
        enabled: isPaymentDialogOpen && paymentMethod === "cash",
    });

    const { data: bankAccounts = [], isLoading: bankAccountsLoading } = useQuery({
        queryKey: ["accounting", "bank-accounts"],
        queryFn: () => accountingApi.getBankAccounts(),
        enabled: isPaymentDialogOpen && paymentMethod !== "cash",
    });

    const recordPaymentMutation = useMutation({
        mutationFn: ({ billId, payload }: { billId: number; payload: BillPaymentCreatePayload }) =>
            billingApi.bills.recordPayment(billId, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bills"] });
            if (selectedBill) {
                queryClient.invalidateQueries({ queryKey: ["bill", selectedBill.id] });
            }
            setIsPaymentDialogOpen(false);
            setSelectedBill(null);
            paymentForm.reset({
                amount: "",
                payment_date: format(new Date(), "yyyy-MM-dd"),
                payment_method: "bank_transfer",
                cash_account: "",
                bank_account: "",
                reference_number: "",
                notes: "",
            });
            toast({ title: "Payment Recorded", description: "Vendor bill payment was recorded successfully." });
        },
        onError: (error: unknown) => {
            const apiError = error as { response?: { data?: Record<string, string | string[]> } };
            const data = apiError.response?.data;
            const firstFieldError = data
                ? Object.values(data).map((value) => Array.isArray(value) ? value.join(" ") : value).find(Boolean)
                : undefined;
            toast({
                title: "Payment Failed",
                description: firstFieldError || "Failed to record bill payment.",
                variant: "destructive",
            });
        },
    });

    const openPaymentDialog = (bill: Bill) => {
        setSelectedBill(bill);
        paymentForm.reset({
            amount: bill.amount_due || "",
            payment_date: format(new Date(), "yyyy-MM-dd"),
            payment_method: "bank_transfer",
            cash_account: "",
            bank_account: "",
            reference_number: "",
            notes: "",
        });
        setIsPaymentDialogOpen(true);
    };

    const canRecordPayment = (bill: Bill) =>
        hasPermission("edit_bills") &&
        !["draft", "pending_approval", "rejected", "paid", "void"].includes(bill.status) &&
        Number.parseFloat(bill.amount_due || "0") > 0;

    function handleRecordPayment(data: PaymentValues) {
        if (!selectedBill) return;
        if (data.payment_method === "cash" && !data.cash_account) {
            paymentForm.setError("cash_account", {
                type: "manual",
                message: "Select the cash account/till for this payment.",
            });
            return;
        }
        if (data.payment_method !== "cash" && !data.bank_account) {
            paymentForm.setError("bank_account", {
                type: "manual",
                message: "Select the bank account for this payment.",
            });
            return;
        }

        const payload: BillPaymentCreatePayload = { ...data };
        if (payload.payment_method !== "cash") {
            delete payload.cash_account;
        } else {
            delete payload.bank_account;
        }
        recordPaymentMutation.mutate({ billId: selectedBill.id, payload });
    }

    const getStatusVariant = (status: string): BadgeProps["variant"] => {
        switch (status) {
            case "paid":
                return "success";
            case "open":
                return "info";
            case "draft":
                return "default";
            case "pending_approval":
                return "warning";
            case "rejected":
                return "danger";
            case "partially_paid":
                return "warning";
            case "overdue":
                return "danger";
            case "void":
                return "secondary";
            default:
                return "default";
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case "paid":
                return <CheckCircle className="w-4 h-4" />;
            case "overdue":
                return <AlertCircle className="w-4 h-4" />;
            case "void":
                return <Ban className="w-4 h-4" />;
            case "partially_paid":
                return <CreditCard className="w-4 h-4" />;
            case "open":
                return <Clock className="w-4 h-4" />;
            default:
                return <FileText className="w-4 h-4" />;
        }
    };

    const totalBills = stats?.counts.total ?? 0;
    const totalPaid = stats?.financials.total_paid ?? 0;
    const totalDue = stats?.financials.outstanding_total ?? 0;
    const overdueCount = stats?.counts.overdue ?? 0;

    return (
        <div className="space-y-4 min-h-screen">
            <div className="flex items-center justify-between pt-2">
                <div>
                    <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
                        <Link href="/dashboard" className="hover:text-primary transition-colors">Dashboard</Link>
                        <span>/</span>
                        <Link href="/billing" className="hover:text-primary transition-colors">Billing</Link>
                        <span>/</span>
                        <span className="text-foreground font-medium">Bills</span>
                    </div>
                    <h1 className="text-xl font-bold text-foreground tracking-tight">Vendor Bills</h1>
                </div>
                <div className="flex items-center space-x-2">
                    <PermissionGuard permission="create_bills">
                        <Link href="/billing/bills/new">
                            <Button size="sm" className="h-9">
                                <Plus className="w-3.5 h-3.5 mr-1.5" />
                                New Bill
                            </Button>
                        </Link>
                    </PermissionGuard>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="shadow-none border-none bg-muted/50">
                    <CardContent className="p-4 flex flex-col gap-1">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Bills</span>
                        <div className="flex items-end justify-between">
                            <span className="text-xl font-bold text-foreground">{totalBills}</span>
                            <FileText className="w-5 h-5 text-muted-foreground mb-0.5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-none border-none bg-muted/50">
                    <CardContent className="p-4 flex flex-col gap-1">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Paid</span>
                        <div className="flex items-end justify-between">
                            <span className="text-xl font-bold text-foreground">{formatCurrency(totalPaid)}</span>
                            <DollarSign className="w-5 h-5 text-muted-foreground mb-0.5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-none border-none bg-muted/50">
                    <CardContent className="p-4 flex flex-col gap-1">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount Due</span>
                        <div className="flex items-end justify-between">
                            <span className="text-xl font-bold text-yellow-600">{formatCurrency(totalDue)}</span>
                            <CreditCard className="w-5 h-5 text-yellow-500/50 mb-0.5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="shadow-none border-none bg-muted/50">
                    <CardContent className="p-4 flex flex-col gap-1">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Overdue</span>
                        <div className="flex items-end justify-between">
                            <span className="text-xl font-bold text-destructive">{overdueCount}</span>
                            <AlertCircle className="w-5 h-5 text-destructive/50 mb-0.5" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filter Bar */}
            <Card className="border-none shadow-sm bg-muted/50">
                <CardContent className="p-3">
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-3 flex-wrap">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
                                <Input
                                    type="text"
                                    placeholder="Search bills..."
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value);
                                        setPage(1);
                                    }}
                                    className="pl-9 h-8 text-sm bg-card w-64 focus:w-80 transition-all duration-300"
                                />
                            </div>

                            <AdvancedFilters
                                filters={filterOptions}
                                activeFilters={advancedFilters}
                                onFiltersChange={(filters) => {
                                    setAdvancedFilters(filters);
                                    setPage(1);
                                }}
                                onClear={() => {
                                    setAdvancedFilters({});
                                }}
                                title="Advanced Bill Filters"
                            />

                            {(search || Object.keys(advancedFilters).length > 0) && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setSearch("");
                                        setAdvancedFilters({});
                                        setPage(1);
                                    }}
                                    className="h-8 text-muted-foreground hover:text-destructive"
                                >
                                    <X className="w-3.5 h-3.5 mr-1" />
                                    Clear
                                </Button>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Bills Table */}
            <Card className="border-t shadow-sm">
                <CardHeader className="py-3 px-4 border-b bg-muted/30">
                    <CardTitle className="text-sm font-semibold text-card-foreground">
                        All Bills <span className="text-muted-foreground font-normal ml-1">({data?.count || 0})</span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <TableSkeleton rows={8} columns={10} />
                    ) : data?.results && data.results.length > 0 ? (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                                        <SortableHeader field="bill_number" sortConfig={sortConfig} onSort={handleSort} className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                                            Bill #
                                        </SortableHeader>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Vendor</TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Ref #</TableHead>
                                        <SortableHeader field="bill_date" sortConfig={sortConfig} onSort={handleSort} className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                                            Bill Date
                                        </SortableHeader>
                                        <SortableHeader field="due_date" sortConfig={sortConfig} onSort={handleSort} className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                                            Due Date
                                        </SortableHeader>
                                        <SortableHeader field="total" sortConfig={sortConfig} onSort={handleSort} className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">
                                            Total
                                        </SortableHeader>
                                        <SortableHeader field="amount_due" sortConfig={sortConfig} onSort={handleSort} className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">
                                            Due
                                        </SortableHeader>
                                        <SortableHeader field="status" sortConfig={sortConfig} onSort={handleSort} className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                                            Status
                                        </SortableHeader>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Approval</TableHead>
                                        <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.results.map((bill) => (
                                        <TableRow
                                            key={bill.id}
                                            className="group hover:bg-muted/80 transition-colors border-b border-border last:border-0 cursor-pointer"
                                            onClick={() => router.push(`/billing/bills/${bill.id}`)}
                                        >
                                            <TableCell className="px-4 py-2 font-mono text-xs font-medium text-foreground">
                                                {bill.bill_number}
                                            </TableCell>
                                            <TableCell className="px-4 py-2">
                                                <span className="text-sm font-medium text-foreground">{bill.vendor_name || "N/A"}</span>
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-xs text-muted-foreground">
                                                {bill.reference_number || "-"}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-xs text-muted-foreground">
                                                {bill.bill_date ? format(new Date(bill.bill_date), "MMM dd, yyyy") : "-"}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-xs text-muted-foreground">
                                                {bill.due_date ? format(new Date(bill.due_date), "MMM dd, yyyy") : "-"}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-right font-medium text-sm text-foreground">
                                                {formatCurrency(parseFloat(bill.total || "0"))}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-right text-sm text-destructive font-medium">
                                                {formatCurrency(parseFloat(bill.amount_due || "0"))}
                                            </TableCell>
                                            <TableCell className="px-4 py-2">

                                                <Badge variant={getStatusVariant(bill.status)} className="text-[10px] px-2 py-0.5 font-medium border shadow-none bg-transparent">
                                                    <span className="flex items-center gap-1.5">
                                                        {getStatusIcon(bill.status)}
                                                        <span className="capitalize">{bill.status.replace(/_/g, " ")}</span>
                                                    </span>
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-xs text-muted-foreground">
                                                {bill.purchase_order ? (
                                                    <span>PO approved</span>
                                                ) : bill.status === "pending_approval" ? (
                                                    <span>Assigned to {bill.assigned_approver_name || "approver"}</span>
                                                ) : bill.status === "rejected" ? (
                                                    <span className="text-destructive">Rejected{bill.rejected_by_name ? ` by ${bill.rejected_by_name}` : ""}</span>
                                                ) : bill.approved_by_name ? (
                                                    <span>Approved by {bill.approved_by_name}</span>
                                                ) : (
                                                    <span>-</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="px-4 py-2 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    {canRecordPayment(bill) && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-7 px-2 text-xs"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                openPaymentDialog(bill);
                                                            }}
                                                        >
                                                            <CreditCard className="mr-1 h-3.5 w-3.5" />
                                                            Pay
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            router.push(`/billing/bills/${bill.id}`);
                                                        }}
                                                    >
                                                        <Eye className="w-3.5 h-3.5" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <p className="text-muted-foreground text-sm">No bills found.</p>
                            <PermissionGuard permission="create_bills">
                                <Link href="/billing/bills/new">
                                    <Button className="mt-4" variant="outline" size="sm">
                                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                                        Create First Bill
                                    </Button>
                                </Link>
                            </PermissionGuard>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Pagination */}
            {data && data.count > 20 && (
                <div className="flex items-center justify-between px-2">
                    <div className="text-sm text-muted-foreground">
                        Showing {((page - 1) * 20) + 1} to {Math.min(page * 20, data.count)} of {data.count} bills
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(page - 1)}
                            disabled={!data.previous}
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(page + 1)}
                            disabled={!data.next}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}

            <Dialog
                open={isPaymentDialogOpen}
                onOpenChange={(open) => {
                    setIsPaymentDialogOpen(open);
                    if (!open) {
                        setSelectedBill(null);
                    }
                }}
            >
                <DialogContent onClick={(event) => event.stopPropagation()}>
                    <DialogHeader>
                        <DialogTitle>
                            Record Vendor Payment
                            {selectedBill?.bill_number ? ` • ${selectedBill.bill_number}` : ""}
                        </DialogTitle>
                    </DialogHeader>
                    {selectedBill && (
                        <div className="space-y-4">
                            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                                <div className="font-medium text-foreground">{selectedBill.vendor_name || "Unknown vendor"}</div>
                                <div className="text-muted-foreground">
                                    Amount due: {formatCurrency(parseFloat(selectedBill.amount_due || "0"))}
                                </div>
                            </div>
                            <Form {...paymentForm}>
                                <form onSubmit={paymentForm.handleSubmit(handleRecordPayment)} className="space-y-4">
                                    <FormField
                                        control={paymentForm.control}
                                        name="amount"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Amount</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        min="0.01"
                                                        step="0.01"
                                                        max={selectedBill.amount_due}
                                                        placeholder={selectedBill.amount_due}
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={paymentForm.control}
                                        name="payment_date"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Payment Date</FormLabel>
                                                <FormControl><Input type="date" {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={paymentForm.control}
                                        name="payment_method"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Payment Method</FormLabel>
                                                <Select
                                                    onValueChange={(value) => {
                                                        field.onChange(value);
                                                        if (value !== "cash") {
                                                            paymentForm.setValue("cash_account", "");
                                                        } else {
                                                            paymentForm.setValue("bank_account", "");
                                                        }
                                                    }}
                                                    value={field.value}
                                                >
                                                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="cash">Cash</SelectItem>
                                                        <SelectItem value="check">Check</SelectItem>
                                                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                                                        <SelectItem value="mobile_money">Mobile Money</SelectItem>
                                                        <SelectItem value="credit_card">Credit Card</SelectItem>
                                                        <SelectItem value="other">Other</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    {paymentMethod === "cash" && (
                                        <FormField
                                            control={paymentForm.control}
                                            name="cash_account"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Cash Account / Till</FormLabel>
                                                    <Select onValueChange={field.onChange} value={cashAccount || ""} disabled={tillAccountsLoading}>
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder={tillAccountsLoading ? "Loading cash accounts..." : "Select cash account"} />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            {tillAccounts.map((account: Account) => (
                                                                <SelectItem key={account.id} value={String(account.id)}>
                                                                    {account.code} - {account.name}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    )}
                                    {paymentMethod !== "cash" && (
                                        <FormField
                                            control={paymentForm.control}
                                            name="bank_account"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Bank Account</FormLabel>
                                                    <Select onValueChange={field.onChange} value={bankAccount || ""} disabled={bankAccountsLoading}>
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder={bankAccountsLoading ? "Loading bank accounts..." : "Select bank account"} />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            {bankAccounts.map((account: Account) => (
                                                                <SelectItem key={account.id} value={String(account.id)}>
                                                                    {account.code} - {account.name}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    )}
                                    <FormField
                                        control={paymentForm.control}
                                        name="reference_number"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Reference</FormLabel>
                                                <FormControl><Input placeholder="Payment reference" {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={paymentForm.control}
                                        name="notes"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Notes</FormLabel>
                                                <FormControl><Textarea placeholder="Payment notes..." {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <DialogFooter>
                                        <Button type="submit" disabled={recordPaymentMutation.isPending}>
                                            {recordPaymentMutation.isPending ? "Recording..." : "Record Payment"}
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </Form>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
