"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
    ArrowLeft,
    CreditCard,
    Database,
    Download,
    Edit,
    FileMinus2,
    FileText,
    Loader2,
    MoreVertical,
    Package,
    XCircle,
} from "lucide-react";
import { useState, useEffect } from "react";

import { billingApi } from "@/lib/api/billing";
import { useQuickBooksConnection } from "@/hooks/useQuickBooksConnection";
import { useQboEntitySync } from "@/hooks/useQboEntitySync";
import { QboSyncBadge } from "@/components/integrations/QboSyncBadge";
import { ApplyVendorCreditDialog } from "@/components/billing/ApplyVendorCreditDialog";
import { payBillsHref } from "@/lib/billing/ap-flow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { usePrint } from "@/lib/hooks/usePrint";
import { useToast } from "@/lib/hooks/useToast";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils/cn";

const statusClassNames: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    pending_approval: "bg-warning/15 text-warning border-warning/20",
    rejected: "bg-destructive/10 text-destructive border-destructive/20",
    open: "bg-primary/10 text-primary border-primary/20",
    partially_paid: "bg-warning/15 text-warning border-warning/20",
    paid: "bg-success/15 text-success border-success/20",
    overdue: "bg-destructive/10 text-destructive border-destructive/20",
    void: "bg-muted text-muted-foreground border-[color:var(--outline-variant)]",
};

export default function BillDetailPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { formatCurrency } = useCurrency();
    const { downloadPDF, isDownloading } = usePrint();
    const { user } = useAuthStore();
    const { hasPermission, hasAnyPermission } = usePermissions();
    const id = Number.parseInt(params.id as string, 10);
    const isValidId = Number.isFinite(id) && id > 0;
    const [isVendorCreditDialogOpen, setIsVendorCreditDialogOpen] = useState(false);
    const [isApprovalDialogOpen, setIsApprovalDialogOpen] = useState(false);
    const [selectedApproverId, setSelectedApproverId] = useState("");
    const { isLinked: isQboConnected, isOperational: isQboCanSync, connectionIssue: qboConnectionIssue } = useQuickBooksConnection();
    const {
        isSyncing,
        isClearing,
        handleSync: handleQBOSync,
        handleClearMapping: handleQboClearMapping,
    } = useQboEntitySync({
        entityType: "vendor_bill",
        objectId: id,
        queryKey: ["bill", id],
        syncSuccessMessage: "Vendor bill push to QuickBooks triggered. Status should update shortly.",
        syncErrorMessage: "Could not trigger vendor bill sync with QuickBooks.",
    });

    const { data: approvers = [] } = useQuery({
        queryKey: ["bill-approvers"],
        queryFn: () => billingApi.bills.approvers(),
    });

    const { data: bill, isLoading, error } = useQuery({
        queryKey: ["bill", id],
        queryFn: () => billingApi.bills.get(id),
        enabled: isValidId,
    });

    const isStandaloneBill = bill ? !bill.purchase_order : false;
    const showSubmitApproval =
        Boolean(bill) && isStandaloneBill && ["draft", "rejected"].includes(bill!.status);

    const submitApprovalParam = searchParams.get("submit");
    useEffect(() => {
        if (submitApprovalParam === "1" && showSubmitApproval) {
            setIsApprovalDialogOpen(true);
        }
    }, [submitApprovalParam, showSubmitApproval]);

    const voidMutation = useMutation({
        mutationFn: () => billingApi.bills.void(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bill", id] });
            queryClient.invalidateQueries({ queryKey: ["bills"] });
            toast({ title: "Bill Voided", description: "The vendor bill was voided." });
        },
        onError: (error: unknown) => {
            const apiError = error as { response?: { data?: { error?: string; detail?: string } } };
            toast({
                title: "Void Failed",
                description: apiError.response?.data?.error || apiError.response?.data?.detail || "Failed to void bill.",
                variant: "destructive",
            });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: () => billingApi.bills.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bills"] });
            toast({ title: "Bill Deleted", description: "The bill was deleted successfully." });
            router.push("/billing/bills");
        },
        onError: (error: unknown) => {
            const apiError = error as { response?: { data?: { error?: string; detail?: string } } };
            toast({
                title: "Delete Failed",
                description: apiError.response?.data?.error || apiError.response?.data?.detail || "Failed to delete bill.",
                variant: "destructive",
            });
        },
    });

    const submitApprovalMutation = useMutation({
        mutationFn: (approverId: number) => billingApi.bills.submitForApproval(id, approverId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bill", id] });
            queryClient.invalidateQueries({ queryKey: ["bills"] });
            setIsApprovalDialogOpen(false);
            setSelectedApproverId("");
            toast({ title: "Submitted", description: "Standalone bill submitted for approval." });
        },
        onError: (error: unknown) => {
            const apiError = error as { response?: { data?: { error?: string; detail?: string } } };
            toast({
                title: "Submit Failed",
                description: apiError.response?.data?.error || apiError.response?.data?.detail || "Failed to submit bill.",
                variant: "destructive",
            });
        },
    });

    const approveMutation = useMutation({
        mutationFn: () => billingApi.bills.approve(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bill", id] });
            queryClient.invalidateQueries({ queryKey: ["bills"] });
            toast({ title: "Approved", description: "Standalone bill approved and opened." });
        },
        onError: (error: unknown) => {
            const apiError = error as { response?: { data?: { error?: string; detail?: string } } };
            toast({
                title: "Approval Failed",
                description: apiError.response?.data?.error || apiError.response?.data?.detail || "Failed to approve bill.",
                variant: "destructive",
            });
        },
    });

    const rejectMutation = useMutation({
        mutationFn: (reason?: string) => billingApi.bills.reject(id, reason),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bill", id] });
            queryClient.invalidateQueries({ queryKey: ["bills"] });
            toast({ title: "Rejected", description: "Standalone bill sent back for correction." });
        },
        onError: (error: unknown) => {
            const apiError = error as { response?: { data?: { error?: string; detail?: string } } };
            toast({
                title: "Reject Failed",
                description: apiError.response?.data?.error || apiError.response?.data?.detail || "Failed to reject bill.",
                variant: "destructive",
            });
        },
    });

    const openDraftMutation = useMutation({
        mutationFn: () => billingApi.bills.openDraft(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bill", id] });
            queryClient.invalidateQueries({ queryKey: ["bills"] });
            toast({
                title: "Bill Opened",
                description: "The purchase-order bill is now open for Accounts Payable and payment processing.",
            });
        },
        onError: (error: unknown) => {
            const apiError = error as { response?: { data?: { error?: string; detail?: string } } };
            toast({
                title: "Open Failed",
                description: apiError.response?.data?.error || apiError.response?.data?.detail || "Failed to open bill.",
                variant: "destructive",
            });
        },
    });

    if (!isValidId) {
        return (
            <div className="space-y-4 p-8">
                <Button variant="ghost" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                </Button>
                <Card className="border-destructive/20 bg-destructive/10">
                    <CardContent className="pt-6">
                        <p className="text-sm font-medium text-destructive">Invalid Bill ID</p>
                        <p className="mt-1 text-sm text-destructive">The bill ID in the URL is invalid.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (error || !bill) {
        return (
            <div className="space-y-4 p-8">
                <Link href="/billing/bills">
                    <Button variant="ghost">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Bills
                    </Button>
                </Link>
                <p className="text-sm text-destructive">Error loading bill details or bill not found.</p>
            </div>
        );
    }

    const billDate = bill.bill_date ? format(new Date(bill.bill_date), "MMM d, yyyy") : "—";
    const dueDate = bill.due_date ? format(new Date(bill.due_date), "MMM d, yyyy") : "—";
    const statusLabel = bill.status.replace(/_/g, " ");
    const amountDueNum = Number.parseFloat(bill.amount_due || "0");
    const amountPaidNum = Number.parseFloat(bill.amount_paid || "0");
    const totalNum = Number.parseFloat(bill.total || "0");

    const canRecordPayment =
        hasPermission("edit_bills") &&
        !["draft", "pending_approval", "rejected", "paid", "void"].includes(bill.status) &&
        amountDueNum > 0;
    const canApplyVendorCredit =
        hasPermission("edit_bills") &&
        !["draft", "pending_approval", "rejected", "paid", "void"].includes(bill.status) &&
        amountDueNum > 0;
    const canEditBill =
        hasPermission("edit_bills") &&
        ["draft", "rejected"].includes(bill.status) &&
        amountPaidNum === 0;
    const canOpenDraftBill =
        hasAnyPermission(["create_bills", "edit_bills", "manage_billing"]) &&
        Boolean(bill.purchase_order) &&
        bill.status === "draft";
    const canApproveOrRejectBill =
        hasPermission("manage_billing") ||
        (hasAnyPermission(["edit_bills", "manage_billing"]) && bill.assigned_approver === user?.id);
    const canVoidBill =
        hasPermission("edit_bills") &&
        ["draft", "rejected"].includes(bill.status) &&
        amountPaidNum === 0;
    const canDeleteBill =
        hasAnyPermission(["delete_bills", "manage_billing"]) &&
        ["draft", "rejected"].includes(bill.status) &&
        amountPaidNum === 0;

    return (
        <div className="space-y-6">
            <ApplyVendorCreditDialog
                open={isVendorCreditDialogOpen}
                onOpenChange={setIsVendorCreditDialogOpen}
                billId={bill.id}
                vendorId={bill.vendor}
                amountDue={amountDueNum}
            />

            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Link href="/billing/bills">
                        <Button variant="secondary" size="sm">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back
                        </Button>
                    </Link>
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-sm font-semibold">
                                Bill {bill.bill_number}
                            </span>
                            <Badge className={cn("capitalize", statusClassNames[bill.status] || statusClassNames.draft)}>
                                {statusLabel}
                            </Badge>
                        </div>
                        <p className="mt-1.5 text-sm text-muted-foreground">{bill.vendor_name || "Unknown vendor"}</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {canRecordPayment && (
                        <Button size="sm" asChild>
                            <Link href={payBillsHref(bill.vendor, bill.id)}>
                                <CreditCard className="mr-2 h-4 w-4" />
                                Pay Bill
                            </Link>
                        </Button>
                    )}
                    {canApproveOrRejectBill && isStandaloneBill && bill.status === "pending_approval" && (
                        <>
                            <Button
                                size="sm"
                                onClick={() => approveMutation.mutate()}
                                disabled={approveMutation.isPending || rejectMutation.isPending}
                            >
                                {approveMutation.isPending ? "Approving..." : "Approve"}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="border-destructive/30 text-destructive hover:bg-destructive/5"
                                onClick={() => {
                                    const reason = prompt("Reason for rejecting this bill:");
                                    rejectMutation.mutate(reason || undefined);
                                }}
                                disabled={approveMutation.isPending || rejectMutation.isPending}
                            >
                                Reject
                            </Button>
                        </>
                    )}
                    {showSubmitApproval && (
                        <Dialog open={isApprovalDialogOpen} onOpenChange={setIsApprovalDialogOpen}>
                            <DialogTrigger asChild>
                                <Button size="sm" disabled={submitApprovalMutation.isPending}>
                                    Submit for approval
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-md">
                                <DialogHeader>
                                    <DialogTitle>Select Bill Approver</DialogTitle>
                                    <DialogDescription>
                                        Choose the manager or billing approver who should review this vendor bill.
                                    </DialogDescription>
                                </DialogHeader>
                                <Select value={selectedApproverId} onValueChange={setSelectedApproverId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Choose manager or admin" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {approvers.map((approver) => (
                                            <SelectItem key={approver.id} value={approver.id.toString()}>
                                                {approver.full_name ||
                                                    `${approver.first_name} ${approver.last_name}`.trim() ||
                                                    approver.email}{" "}
                                                ({approver.role})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {approvers.length === 0 && (
                                    <p className="text-sm text-muted-foreground">No active manager/admin users found.</p>
                                )}
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setIsApprovalDialogOpen(false)}>
                                        Cancel
                                    </Button>
                                    <Button
                                        disabled={!selectedApproverId || submitApprovalMutation.isPending}
                                        onClick={() =>
                                            submitApprovalMutation.mutate(Number.parseInt(selectedApproverId, 10))
                                        }
                                    >
                                        {submitApprovalMutation.isPending ? "Submitting..." : "Submit"}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    )}
                    {canOpenDraftBill && (
                        <Button size="sm" onClick={() => openDraftMutation.mutate()} disabled={openDraftMutation.isPending}>
                            {openDraftMutation.isPending ? "Opening..." : "Open Bill"}
                        </Button>
                    )}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                                <MoreVertical className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                                onClick={() =>
                                    downloadPDF({
                                        documentType: "bill",
                                        documentId: id,
                                        documentNumber: bill.bill_number,
                                    })
                                }
                                disabled={isDownloading}
                            >
                                <Download className="mr-2 h-4 w-4" />
                                {isDownloading ? "Downloading..." : "Download PDF"}
                            </DropdownMenuItem>
                            {canEditBill && (
                                <DropdownMenuItem onClick={() => router.push(`/billing/bills/${id}/edit`)}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Edit
                                </DropdownMenuItem>
                            )}
                            {canApplyVendorCredit && (
                                <DropdownMenuItem onClick={() => setIsVendorCreditDialogOpen(true)}>
                                    <FileMinus2 className="mr-2 h-4 w-4" />
                                    Apply vendor credit
                                </DropdownMenuItem>
                            )}
                            {isQboConnected && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={handleQBOSync} disabled={isSyncing || isClearing}>
                                        <Database className={cn("mr-2 h-4 w-4", isSyncing && "animate-spin")} />
                                        {isSyncing ? "Syncing..." : "Push to QuickBooks"}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={handleQboClearMapping}
                                        disabled={isSyncing || isClearing}
                                    >
                                        {isClearing ? "Clearing link..." : "Clear QuickBooks link"}
                                    </DropdownMenuItem>
                                </>
                            )}
                            {(canVoidBill || canDeleteBill) && <DropdownMenuSeparator />}
                            {canVoidBill && (
                                <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => {
                                        if (confirm("Void this bill?")) voidMutation.mutate();
                                    }}
                                    disabled={voidMutation.isPending}
                                >
                                    <XCircle className="mr-2 h-4 w-4" />
                                    {voidMutation.isPending ? "Voiding..." : "Void"}
                                </DropdownMenuItem>
                            )}
                            {canDeleteBill && (
                                <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => {
                                        if (confirm("Delete this bill permanently?")) deleteMutation.mutate();
                                    }}
                                    disabled={deleteMutation.isPending}
                                >
                                    <XCircle className="mr-2 h-4 w-4" />
                                    {deleteMutation.isPending ? "Deleting..." : "Delete"}
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {showSubmitApproval && (
                <Card className="border-warning/30 bg-warning/5">
                    <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="font-medium text-foreground">Next step: submit for approval</p>
                            <p className="text-sm text-muted-foreground">
                                Draft standalone bills must be submitted and approved before they become Open and
                                payable in Pay Bills.
                            </p>
                        </div>
                        <Button size="sm" onClick={() => setIsApprovalDialogOpen(true)}>
                            Submit for approval
                        </Button>
                    </CardContent>
                </Card>
            )}

            {bill.status === "pending_approval" && isStandaloneBill && (
                <Card className="border-primary/30 bg-primary/10">
                    <CardContent className="py-4 text-sm text-muted-foreground">
                        Awaiting approval. An assigned approver can Approve or Reject this bill using the actions
                        in the header.
                    </CardContent>
                </Card>
            )}

            {isQboConnected && (
                <QboSyncBadge
                    status={bill.qbo_sync_status}
                    error={bill.qbo_sync_error}
                    connectionIssue={!isQboCanSync ? qboConnectionIssue : undefined}
                    onRetry={isQboCanSync ? handleQBOSync : undefined}
                    onClearMapping={isQboCanSync ? handleQboClearMapping : undefined}
                    isRetrying={isSyncing}
                    isClearing={isClearing}
                />
            )}

            <Tabs defaultValue="bill" className="w-full">
                <TabsList className="mb-4 h-auto w-full flex-wrap justify-start bg-muted/50 p-1">
                    <TabsTrigger value="bill" className="gap-2">
                        <FileText className="h-4 w-4" />
                        Bill
                    </TabsTrigger>
                    <TabsTrigger value="payments" className="gap-2">
                        <CreditCard className="h-4 w-4" />
                        Payments & credits
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="bill" className="space-y-6">
                    <Card>
                        <CardContent className="pt-6">
                            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                                <div>
                                    <h3 className="mb-2 text-sm font-medium text-muted-foreground">Vendor</h3>
                                    <p className="font-semibold">{bill.vendor_name || "—"}</p>
                                    {bill.reference_number && (
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            Ref: {bill.reference_number}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <h3 className="mb-2 text-sm font-medium text-muted-foreground">Dates</h3>
                                    <p className="text-sm">
                                        <span className="text-muted-foreground">Bill date: </span>
                                        <span className="font-medium">{billDate}</span>
                                    </p>
                                    <p className="mt-1 text-sm">
                                        <span className="text-muted-foreground">Due date: </span>
                                        <span className="font-medium">{dueDate}</span>
                                    </p>
                                </div>
                                <div>
                                    <h3 className="mb-2 text-sm font-medium text-muted-foreground">Amounts</h3>
                                    <p className="text-sm">
                                        <span className="text-muted-foreground">Total: </span>
                                        <span className="font-semibold">{formatCurrency(totalNum)}</span>
                                    </p>
                                    <p className="mt-1 text-sm">
                                        <span className="text-muted-foreground">Paid: </span>
                                        <span className="font-medium">{formatCurrency(amountPaidNum)}</span>
                                    </p>
                                    <p className="mt-1 text-sm">
                                        <span className="text-muted-foreground">Due: </span>
                                        <span className="font-semibold text-foreground">{formatCurrency(amountDueNum)}</span>
                                    </p>
                                </div>
                                <div>
                                    <h3 className="mb-2 text-sm font-medium text-muted-foreground">Links</h3>
                                    {bill.purchase_order ? (
                                        <Link
                                            href={`/inventory/purchase-orders/${bill.purchase_order}`}
                                            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                                        >
                                            <Package className="h-4 w-4" />
                                            {bill.purchase_order_number || `PO #${bill.purchase_order}`}
                                        </Link>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">Standalone bill</p>
                                    )}
                                    {bill.assigned_approver_name && (
                                        <p className="mt-2 text-sm text-muted-foreground">
                                            Approver: {bill.assigned_approver_name}
                                        </p>
                                    )}
                                    {bill.rejection_reason && (
                                        <p className="mt-2 text-sm text-destructive">{bill.rejection_reason}</p>
                                    )}
                                </div>
                            </div>
                            {(bill.terms || bill.notes) && (
                                <div className="mt-6 grid grid-cols-1 gap-4 border-t pt-6 md:grid-cols-2">
                                    {bill.terms && (
                                        <div>
                                            <p className="text-sm font-medium text-muted-foreground">Terms</p>
                                            <p className="mt-1 text-sm">{bill.terms}</p>
                                        </div>
                                    )}
                                    {bill.notes && (
                                        <div>
                                            <p className="text-sm font-medium text-muted-foreground">Notes</p>
                                            <p className="mt-1 text-sm whitespace-pre-wrap">{bill.notes}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                                        <TableHead>Description</TableHead>
                                        <TableHead>Category</TableHead>
                                        <TableHead className="text-right">Qty</TableHead>
                                        <TableHead className="text-right">Rate</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {bill.line_items?.length ? (
                                        bill.line_items.map((item) => (
                                            <TableRow key={item.id || item.description}>
                                                <TableCell className="font-medium">{item.description}</TableCell>
                                                <TableCell className="text-muted-foreground">
                                                    {item.expense_category || "—"}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {Number(item.quantity).toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {formatCurrency(Number.parseFloat(item.unit_price || "0"))}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {formatCurrency(Number.parseFloat(item.total || "0"))}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                                                No line items
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    <TableRow className="border-t-2 hover:bg-transparent">
                                        <TableCell colSpan={4} className="text-right text-sm text-muted-foreground">
                                            Subtotal
                                        </TableCell>
                                        <TableCell className="text-right font-medium">
                                            {formatCurrency(Number.parseFloat(bill.subtotal || "0"))}
                                        </TableCell>
                                    </TableRow>
                                    <TableRow className="hover:bg-transparent">
                                        <TableCell colSpan={4} className="text-right text-sm text-muted-foreground">
                                            Tax
                                        </TableCell>
                                        <TableCell className="text-right font-medium">
                                            {formatCurrency(Number.parseFloat(bill.tax_amount || "0"))}
                                        </TableCell>
                                    </TableRow>
                                    <TableRow className="hover:bg-transparent">
                                        <TableCell colSpan={4} className="text-right text-base font-bold">
                                            Total
                                        </TableCell>
                                        <TableCell className="text-right text-base font-bold">
                                            {formatCurrency(totalNum)}
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="payments" className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-muted-foreground">
                            {formatCurrency(amountPaidNum)} paid · {formatCurrency(amountDueNum)} remaining
                        </p>
                        <div className="flex gap-2">
                            {canApplyVendorCredit && (
                                <Button size="sm" variant="outline" onClick={() => setIsVendorCreditDialogOpen(true)}>
                                    <FileMinus2 className="mr-2 h-4 w-4" />
                                    Apply vendor credit
                                </Button>
                            )}
                            {canRecordPayment && (
                                <Button size="sm" asChild>
                                    <Link href={payBillsHref(bill.vendor, bill.id)}>
                                        <CreditCard className="mr-2 h-4 w-4" />
                                        Pay Bill
                                    </Link>
                                </Button>
                            )}
                        </div>
                    </div>

                    <Card>
                        <CardContent className="pt-6">
                            <h3 className="mb-3 text-sm font-semibold">Vendor payments</h3>
                            {bill.payments && bill.payments.length > 0 ? (
                                <div className="divide-y">
                                    {bill.payments.map((payment) => (
                                        <div
                                            key={payment.id}
                                            className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                                        >
                                            <div>
                                                <p className="font-medium">{payment.payment_number}</p>
                                                <p className="text-sm capitalize text-muted-foreground">
                                                    {payment.payment_method.replace(/_/g, " ")}
                                                    {payment.reference_number ? ` · Ref ${payment.reference_number}` : ""}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-semibold">
                                                    {formatCurrency(Number.parseFloat(payment.amount || "0"))}
                                                </p>
                                                <p className="text-sm text-muted-foreground">
                                                    {format(new Date(payment.payment_date), "MMM d, yyyy")}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">No vendor payments recorded yet.</p>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-6">
                            <h3 className="mb-3 text-sm font-semibold">Vendor credits applied</h3>
                            {bill.vendor_credit_applications && bill.vendor_credit_applications.length > 0 ? (
                                <div className="divide-y">
                                    {bill.vendor_credit_applications.map((app) => (
                                        <div
                                            key={app.id}
                                            className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                                        >
                                            <div>
                                                <p className="font-medium">Credit application</p>
                                                <p className="text-sm text-muted-foreground">
                                                    {app.applied_at
                                                        ? format(new Date(app.applied_at), "MMM d, yyyy")
                                                        : "—"}
                                                    {app.applied_by_name ? ` · ${app.applied_by_name}` : ""}
                                                </p>
                                            </div>
                                            <p className="font-semibold">
                                                {formatCurrency(Number.parseFloat(app.amount || "0"))}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">No vendor credits applied to this bill.</p>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
