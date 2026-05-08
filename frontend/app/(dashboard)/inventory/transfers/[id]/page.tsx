"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api/inventory";
import { adminApi, type User } from "@/lib/api/admin";
import { authApi } from "@/lib/api/auth";
import { useBranchStore } from "@/store/branchStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { useToast } from "@/lib/hooks/useToast";
import { Loader2, ArrowLeft, CheckCircle, Truck, PackageCheck, AlertCircle, XCircle, UserCheck } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

export default function TransferDetailPage() {
    const params = useParams();
    const id = parseInt(params.id as string);

    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [receiveQuantities, setReceiveQuantities] = useState<Record<number, number>>({});
    const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);
    const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
    const [selectedApproverIds, setSelectedApproverIds] = useState<number[]>([]);
    const [rejectionReason, setRejectionReason] = useState("");

    const { data: transfer, isLoading, error } = useQuery({
        queryKey: ["transfer", id],
        queryFn: () => inventoryApi.getTransfer(id),
        enabled: !isNaN(id),
    });

    const { data: currentUser } = useQuery({
        queryKey: ["currentUser"],
        queryFn: () => authApi.getCurrentUser(),
    });

    const { activeBranchId } = useBranchStore();
    const isSubmitter = currentUser?.id === transfer?.created_by;
    const isAdminApprover = currentUser?.role === "admin" || currentUser?.role === "super-admin";
    const currentUserPendingApproval = transfer?.approvals?.some(
        (approval) => approval.approver === currentUser?.id && approval.status === "pending"
    );
    const isLegacyApprover = currentUser?.id === transfer?.assigned_approver;
    const isApprover = Boolean(currentUserPendingApproval || isLegacyApprover || isAdminApprover);
    const canApprove = isApprover && (!isSubmitter || isAdminApprover);
    const isSourceBranch = !activeBranchId || activeBranchId === transfer?.source_branch || isAdminApprover;
    const isDestinationBranch = !activeBranchId || activeBranchId === transfer?.destination_branch || isAdminApprover;

    const { data: usersResponse } = useQuery({
        queryKey: ["users", "approvers", transfer?.source_branch, transfer?.destination_branch],
        queryFn: async () => {
            if (!transfer) return { count: 0, results: [] };

            // Fetch users from source branch
            const sourceUsers = await adminApi.users.list({
                is_active: true,
                branch: transfer.source_branch
            });

            // Fetch users from destination branch if different

            let destUsers: { results?: User[] } = { results: [] };
            if (transfer.destination_branch !== transfer.source_branch) {
                destUsers = await adminApi.users.list({
                    is_active: true,
                    branch: transfer.destination_branch
                });
            }

            // Merge and deduplicate
            const mergedResults = [...(sourceUsers.results || [])];
            const sourceIds = new Set(mergedResults.map(u => u.id));

            for (const u of (destUsers.results || [])) {
                if (!sourceIds.has(u.id)) {
                    mergedResults.push(u);
                }
            }

            return { count: mergedResults.length, results: mergedResults };
        },
        enabled: !!transfer,
    });

    const approvers = usersResponse?.results || [];

    const submitForApprovalMutation = useMutation({
        mutationFn: (approverIds: number[]) => inventoryApi.submitTransferForApproval(id, approverIds),
        onSuccess: () => {
            toast({ title: "Submitted", description: "Transfer has been submitted for approval." });
            queryClient.invalidateQueries({ queryKey: ["transfer", id] });
            setIsSubmitDialogOpen(false);
            setSelectedApproverIds([]);
        },

        onError: (err: unknown) => toast({ title: "Error", description: getApiErrorMessage(err, "Failed to submit transfer"), variant: "destructive" }),
    });

    const approveMutation = useMutation({
        mutationFn: () => inventoryApi.approveTransfer(id),
        onSuccess: () => {
            toast({ title: "Approved", description: "Transfer has been approved." });
            queryClient.invalidateQueries({ queryKey: ["transfer", id] });
        },

        onError: (err: unknown) => toast({ title: "Error", description: getApiErrorMessage(err, "Failed to approve transfer"), variant: "destructive" }),
    });

    const rejectMutation = useMutation({
        mutationFn: (reason: string) => inventoryApi.rejectTransfer(id, reason),
        onSuccess: () => {
            toast({ title: "Rejected", description: "Transfer has been rejected." });
            queryClient.invalidateQueries({ queryKey: ["transfer", id] });
            setIsRejectDialogOpen(false);
        },

        onError: (err: unknown) => toast({ title: "Error", description: getApiErrorMessage(err, "Failed to reject transfer"), variant: "destructive" }),
    });

    const shipMutation = useMutation({
        mutationFn: () => inventoryApi.shipTransfer(id),
        onSuccess: () => {
            toast({ title: "Shipped", description: "Transfer marked as shipped." });
            queryClient.invalidateQueries({ queryKey: ["transfer", id] });
        },

        onError: (err: unknown) => toast({ title: "Error", description: getApiErrorMessage(err, "Failed to ship transfer"), variant: "destructive" }),
    });

    const receiveMutation = useMutation({
        mutationFn: (items: Record<number, number>) => inventoryApi.receiveTransfer(id, items),
        onSuccess: () => {
            toast({ title: "Received", description: "Transfer items received." });
            queryClient.invalidateQueries({ queryKey: ["transfer", id] });
        },

        onError: (err: unknown) => toast({ title: "Error", description: getApiErrorMessage(err, "Failed to receive transfer"), variant: "destructive" }),
    });

    if (isLoading) return <div className="p-8"><Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" /></div>;
    if (error || !transfer) return <div className="p-8 text-center text-destructive">Error loading transfer</div>;

    const getStatusStyles = (status: string) => {
        switch (status) {
            case "draft": return "bg-muted text-muted-foreground border-border";
            case "pending_approval":
            case "requested": return "bg-primary/10 text-primary border-primary/20";
            case "approved": return "bg-primary/20 text-primary border-primary/30";
            case "in_transit": return "bg-primary/10 text-primary border-primary/20";
            case "received": return "bg-success/10 text-success border-success/20";
            case "rejected": return "bg-destructive/10 text-destructive border-destructive/20";
            case "cancelled": return "bg-muted text-muted-foreground border-border";
            default: return "bg-muted text-muted-foreground border-border";
        }
    };

    const handleReceiveChange = (itemId: number, qty: number) => {
        setReceiveQuantities(prev => ({ ...prev, [itemId]: qty }));
    };

    const handleReceiveSubmit = () => {
        const itemsToReceive: Record<number, number> = {};
        transfer.items.forEach(item => {
            const qty = receiveQuantities[item.part] !== undefined ? receiveQuantities[item.part] : item.quantity_sent;
            itemsToReceive[item.part] = qty;
        });
        receiveMutation.mutate(itemsToReceive);
    };

    const handleSubmitForApproval = () => {
        submitForApprovalMutation.mutate(selectedApproverIds);
    };

    const toggleApprover = (approverId: number, checked: boolean | string) => {
        setSelectedApproverIds((current) => {
            if (checked) {
                return current.includes(approverId) ? current : [...current, approverId];
            }
            return current.filter((idToKeep) => idToKeep !== approverId);
        });
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-12">
            {/* Submit Dialog */}
            <Dialog open={isSubmitDialogOpen} onOpenChange={setIsSubmitDialogOpen}>
                <DialogContent className="sm:max-w-[400px] p-0 border-none shadow-2xl overflow-hidden">
                    <div className="p-6 space-y-6">
                        <div className="flex items-start justify-between">
                            <div className="space-y-1">
                                <DialogTitle className="text-xl font-semibold tracking-tight">Submit for Approval</DialogTitle>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <UserCheck className="w-5 h-5 text-primary" />
                            </div>
                        </div>

                        <div className="max-h-[320px] space-y-2 overflow-y-auto">
                            {approvers.map((user: User) => {
                                const isCurrentUser = user.id === currentUser?.id;
                                const isChecked = selectedApproverIds.includes(user.id);
                                const displayName = user.full_name || user.username || user.email;

                                return (
                                    <label
                                        key={user.id}
                                        className={cn(
                                            "flex items-center gap-3 rounded border p-3 text-sm",
                                            isCurrentUser ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-muted/40"
                                        )}
                                    >
                                        <Checkbox
                                            checked={isChecked}
                                            disabled={isCurrentUser}
                                            onCheckedChange={(checked) => toggleApprover(user.id, checked)}
                                        />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate font-medium">{displayName}</span>
                                            <span className="block truncate text-[10px] text-muted-foreground">
                                                {(user.role || "").replace("_", " ").toUpperCase()} • {user.email}
                                            </span>
                                        </span>
                                        {isCurrentUser && <Badge variant="secondary">Submitter</Badge>}
                                    </label>
                                );
                            })}
                            {approvers.length === 0 && (
                                <p className="rounded border border-dashed p-4 text-sm text-muted-foreground">
                                    No active approvers found for these branches.
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="px-6 py-4 bg-muted/50 border-t border-border flex justify-end gap-3">
                        <Button
                            variant="ghost"
                            onClick={() => setIsSubmitDialogOpen(false)}
                            className="h-10 px-4 font-medium text-muted-foreground hover:bg-background shadow-none border-none"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmitForApproval}
                            disabled={submitForApprovalMutation.isPending || selectedApproverIds.length === 0}
                            className="h-10 px-6 font-bold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/10 transition-all active:scale-[0.98]"
                        >
                            {submitForApprovalMutation.isPending ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin text-primary-foreground" />
                                    Submitting
                                </>
                            ) : "Submit Transfer"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Reject Dialog */}
            <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
                <DialogContent className="sm:max-w-[400px] p-0 border-none shadow-2xl overflow-hidden">
                    <div className="p-6 space-y-6">
                        <div className="flex items-start justify-between">
                            <div className="space-y-1">
                                <DialogTitle className="text-xl font-semibold tracking-tight text-destructive">Reject Request</DialogTitle>
                                <DialogDescription className="text-sm text-muted-foreground mr-6">
                                    Please provide a brief reason why this transfer is being rejected.
                                </DialogDescription>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                                <XCircle className="w-5 h-5 text-destructive" />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground ml-0.5">Rejection Reason</label>
                            <Textarea
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                placeholder="E.g., Stock mismatch, incorrect branch selected..."
                                className="min-h-[100px] bg-background border-border rounded-lg shadow-sm focus:ring-1 focus:ring-destructive transition-all resize-none p-3 text-sm"
                            />
                        </div>
                    </div>

                    <div className="px-6 py-4 bg-muted/50 border-t border-border flex justify-end gap-3">
                        <Button
                            variant="ghost"
                            onClick={() => setIsRejectDialogOpen(false)}
                            className="h-10 px-4 font-medium text-muted-foreground hover:bg-background shadow-none border-none"
                        >
                            Back
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => rejectMutation.mutate(rejectionReason)}
                            disabled={rejectMutation.isPending || !rejectionReason.trim()}
                            className="h-10 px-6 font-bold rounded-lg bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-md shadow-destructive/10 transition-all active:scale-[0.98]"
                        >
                            {rejectMutation.isPending ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin text-destructive-foreground" />
                                    Rejecting
                                </>
                            ) : "Confirm Rejection"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                    <Link href="/inventory/transfers">
                        <Button variant="ghost" size="icon" className="rounded-full">
                            <ArrowLeft className="w-4 h-4" />
                        </Button>
                    </Link>
                    <div>
                        <div className="flex items-center gap-2 mb-1 text-sm text-muted-foreground">
                            <span>Transfers</span>
                            <span>/</span>
                            <span>{transfer.transfer_number}</span>
                        </div>
                        <h1 className="text-2xl font-bold flex items-center gap-3">
                            {transfer.transfer_number}
                            <Badge variant="outline" className={`${getStatusStyles(transfer.status)} capitalize font-medium px-3 py-1`}>
                                {transfer.status.replace("_", " ")}
                            </Badge>
                        </h1>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                    {transfer.status === 'draft' && isSourceBranch && (
                        <Button onClick={() => setIsSubmitDialogOpen(true)}>
                            <UserCheck className="w-4 h-4 mr-2" /> Submit for Approval
                        </Button>
                    )}
                    {['pending_approval', 'requested'].includes(transfer.status) && canApprove && (
                        <>
                            <Button variant="outline" className="text-destructive border-destructive/20 hover:bg-destructive/10 hover:text-destructive" onClick={() => setIsRejectDialogOpen(true)}>
                                <XCircle className="w-4 h-4 mr-2" /> Reject
                            </Button>
                            <Button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending} className="bg-primary hover:bg-primary/90">
                                {approveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin text-primary-foreground" />}
                                <CheckCircle className="w-4 h-4 mr-2" /> Approve
                            </Button>
                        </>
                    )}
                    {transfer.status === 'approved' && isSourceBranch && (
                        <Button onClick={() => shipMutation.mutate()} disabled={shipMutation.isPending} className="bg-primary hover:bg-primary/90">
                            {shipMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin text-primary-foreground" />}
                            <Truck className="w-4 h-4 mr-2" /> Ship Inventory
                        </Button>
                    )}
                    {transfer.status === 'in_transit' && isDestinationBranch && (
                        <Button onClick={handleReceiveSubmit} disabled={receiveMutation.isPending} className="bg-success hover:bg-success/90 text-success-foreground">
                            {receiveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            <PackageCheck className="w-4 h-4 mr-2" /> Mark as Received
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card className="shadow-sm border-border bg-card">
                            <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-tight">Source Branch</CardTitle></CardHeader>
                            <CardContent>
                                <div className="text-lg font-bold text-foreground">{transfer.source_branch_name}</div>
                                <div className="mt-4 pt-4 border-t border-border space-y-2">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-muted-foreground">Requested Date</span>
                                        <span className="font-medium">{format(new Date(transfer.requested_date), "PPP")}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-muted-foreground">Initiated By</span>
                                        <span className="font-medium">{transfer.created_by_name}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="shadow-sm border-border bg-transparent">
                            <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-tight">Destination Branch</CardTitle></CardHeader>
                            <CardContent>
                                <div className="text-lg font-bold text-foreground">{transfer.destination_branch_name}</div>
                                <div className="mt-4 pt-4 border-t border-border space-y-2">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-muted-foreground">Delivery Status</span>
                                        <span className="font-medium">
                                            {transfer.received_date ? `Received ${format(new Date(transfer.received_date), "MMM dd, yyyy")}` : "In Progress"}
                                        </span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="shadow-sm border-border overflow-hidden bg-card">
                        <CardHeader className="bg-muted/30 border-b border-border">
                            <CardTitle className="text-sm font-bold">Transfer Items</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader className="bg-transparent">
                                    <TableRow className="border-border hover:bg-transparent">
                                        <TableHead className="text-[10px] uppercase font-bold text-muted-foreground">Part Details</TableHead>
                                        <TableHead className="text-right text-[10px] uppercase font-bold text-muted-foreground">Requested</TableHead>
                                        <TableHead className="text-right text-[10px] uppercase font-bold text-muted-foreground">Shipped</TableHead>
                                        {(transfer.status === 'in_transit' || transfer.status === 'received') && (
                                            <TableHead className="text-right text-[10px] uppercase font-bold text-muted-foreground">Received</TableHead>
                                        )}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {transfer.items.map(item => (
                                        <TableRow key={item.id} className="border-border last:border-0">
                                            <TableCell>
                                                <div className="font-bold text-sm text-foreground">{item.part_name}</div>
                                                <div className="text-[10px] font-mono text-muted-foreground">{item.part_number}</div>
                                            </TableCell>
                                            <TableCell className="text-right font-medium">{item.quantity_requested}</TableCell>
                                            <TableCell className="text-right font-medium text-muted-foreground">{item.quantity_sent}</TableCell>
                                            {(transfer.status === 'in_transit' || transfer.status === 'received') && (
                                                <TableCell className="text-right w-32">
                                                    {transfer.status === 'in_transit' ? (
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            max={item.quantity_sent}
                                                            defaultValue={item.quantity_sent}
                                                            className="h-8 w-20 ml-auto bg-background border-border text-right text-xs"
                                                            onChange={(e) => handleReceiveChange(item.part, parseInt(e.target.value))}
                                                        />
                                                    ) : (
                                                        <span className="font-bold text-success">{item.quantity_received}</span>
                                                    )}
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    {transfer.rejection_reason && (
                        <Card className="border-destructive/20 bg-destructive/10">
                            <CardHeader className="pb-2"><CardTitle className="text-xs font-bold text-destructive uppercase">Rejection Details</CardTitle></CardHeader>
                            <CardContent>
                                <p className="text-sm text-destructive font-bold">{transfer.rejection_reason}</p>
                                {transfer.rejected_by_name && (
                                    <p className="text-[10px] text-destructive/80 mt-2">By {transfer.rejected_by_name} on {transfer.rejected_at ? format(new Date(transfer.rejected_at), "PPP p") : "Unknown"}</p>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {transfer.notes && (
                        <Card className="bg-muted/30 border-border">
                            <CardHeader className="pb-2"><CardTitle className="text-xs font-bold text-muted-foreground uppercase">Internal Notes</CardTitle></CardHeader>
                            <CardContent>
                                <p className="text-sm text-foreground italic">&quot;{transfer.notes}&quot;</p>
                            </CardContent>
                        </Card>
                    )}
                </div>

                <div className="space-y-6">
                    <Card className="shadow-sm border-border">
                        <CardHeader className="pb-3 border-b bg-muted/20">
                            <CardTitle className="text-sm font-bold">Flow Status</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4">
                            <div className="space-y-3">
                                <div className="flex gap-3">
                                    <div className="flex flex-col items-center">
                                        <div className={`w-2 h-2 rounded-full ${transfer.created_at ? 'bg-success' : 'bg-muted'}`} />
                                        <div className="w-0.5 h-full bg-border" />
                                    </div>
                                    <div className="pb-4">
                                        <p className="text-xs font-bold">Initiated</p>
                                        <p className="text-[10px] text-muted-foreground">{transfer.created_by_name}</p>
                                        <p className="text-[10px] text-muted-foreground/60">{format(new Date(transfer.created_at), "MMM d, HH:mm")}</p>
                                    </div>
                                </div>

                                {transfer.submitted_at && (
                                    <div className="flex gap-3">
                                        <div className="flex flex-col items-center">
                                            <div className="w-2 h-2 rounded-full bg-primary" />
                                            <div className="w-0.5 h-full bg-border" />
                                        </div>
                                        <div className="pb-4">
                                            <p className="text-xs font-bold">Submitted for Approval</p>
                                            <p className="text-[10px] text-muted-foreground">By {transfer.submitted_by_name}</p>
                                            {transfer.approval_progress?.total ? (
                                                <p className="text-[10px] text-primary">
                                                    Approvals: {transfer.approval_progress.approved}/{transfer.approval_progress.total}
                                                </p>
                                            ) : transfer.assigned_approver_name && (
                                                <p className="text-[10px] text-primary">Assignee: {transfer.assigned_approver_name}</p>
                                            )}
                                            <p className="text-[10px] text-muted-foreground/60">{format(new Date(transfer.submitted_at), "MMM d, HH:mm")}</p>
                                            {transfer.approvals && transfer.approvals.length > 0 && (
                                                <div className="mt-2 space-y-1">
                                                    {transfer.approvals.map((approval) => (
                                                        <div key={approval.id} className="flex items-center gap-2 text-[10px]">
                                                            <Badge
                                                                variant={
                                                                    approval.status === "approved"
                                                                        ? "success"
                                                                        : approval.status === "rejected"
                                                                            ? "danger"
                                                                            : "warning"
                                                                }
                                                                className="h-4 px-1 text-[8px] uppercase"
                                                            >
                                                                {approval.status}
                                                            </Badge>
                                                            <span className="text-muted-foreground">
                                                                {approval.approver_name || approval.approver_email || `User ${approval.approver}`}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {transfer.status === 'rejected' && (
                                    <div className="flex gap-3">
                                        <div className="flex flex-col items-center">
                                            <div className="w-2 h-2 rounded-full bg-destructive" />
                                            <div className="w-0.5 h-full bg-border" />
                                        </div>
                                        <div className="pb-4">
                                            <p className="text-xs font-bold text-destructive">Rejected</p>
                                            <p className="text-[10px] text-muted-foreground">By {transfer.rejected_by_name}</p>
                                            <p className="text-[10px] text-muted-foreground/60">{transfer.rejected_at ? format(new Date(transfer.rejected_at), "MMM d, HH:mm") : ""}</p>
                                        </div>
                                    </div>
                                )}

                                {transfer.approved_date && (
                                    <div className="flex gap-3">
                                        <div className="flex flex-col items-center">
                                            <div className="w-2 h-2 rounded-full bg-success" />
                                            <div className="w-0.5 h-full bg-border" />
                                        </div>
                                        <div className="pb-4">
                                            <p className="text-xs font-bold">Approved</p>
                                            <p className="text-[10px] text-muted-foreground">By {transfer.approved_by_name}</p>
                                            <p className="text-[10px] text-muted-foreground/60">{format(new Date(transfer.approved_date), "MMM d, HH:mm")}</p>
                                        </div>
                                    </div>
                                )}

                                {transfer.shipped_date && (
                                    <div className="flex gap-3">
                                        <div className="flex flex-col items-center">
                                            <div className="w-2 h-2 rounded-full bg-primary" />
                                            <div className="w-0.5 h-full bg-border" />
                                        </div>
                                        <div className="pb-4">
                                            <p className="text-xs font-bold">Inventory Shipped</p>
                                            <p className="text-[10px] text-muted-foreground/60">{format(new Date(transfer.shipped_date), "MMM d, HH:mm")}</p>
                                        </div>
                                    </div>
                                )}

                                {transfer.received_date && (
                                    <div className="flex gap-3">
                                        <div className="flex flex-col items-center">
                                            <div className="w-2 h-2 rounded-full bg-success ripple" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-success">Received</p>
                                            <p className="text-[10px] text-muted-foreground/60">{format(new Date(transfer.received_date), "MMM d, HH:mm")}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm border-border bg-card">
                        <CardHeader className="pb-3 border-b bg-muted/20">
                            <CardTitle className="text-sm font-bold text-primary flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" /> Attention Required
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4">
                            <div className="text-xs text-foreground leading-relaxed font-medium">
                                {canApprove && ['pending_approval', 'requested'].includes(transfer.status) && (
                                    <div className="mb-4 p-3 bg-primary/10 border border-primary/20 rounded-lg">
                                        <p className="text-xs font-bold text-primary flex items-center gap-2 mb-1">
                                            <UserCheck className="w-3 h-3" /> Decision Required
                                        </p>
                                        <p className="text-xs text-foreground mb-3 leading-snug">
                                            As the assigned approver, please review the transfer items and requested quantities before making a decision.
                                        </p>
                                        <div className="flex gap-2">
                                            <Button size="sm" variant="outline" className="h-8 text-[10px] text-destructive border-destructive/20 hover:bg-destructive/10" onClick={() => setIsRejectDialogOpen(true)}>
                                                Reject
                                            </Button>
                                            <Button size="sm" className="h-8 text-[10px] bg-primary hover:bg-primary/90" onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
                                                {approveMutation.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                                                Approve
                                            </Button>
                                        </div>
                                    </div>
                                )}
                                {transfer.status === 'draft' && (isSourceBranch ? "This transfer is currently a draft. Please review the items and submit for approval to proceed." : "This transfer is currently a draft at the source branch.")}
                                {transfer.status === 'pending_approval' && (
                                    isSubmitter ? "Awaiting approval from the assigned manager. You cannot approve transfers you created." :
                                        (canApprove ? "As the authorized manager, your decision is required to proceed with this stock transfer." : "This transfer is awaiting approval from the authorized manager.")
                                )}
                                {transfer.status === 'approved' && (isSourceBranch ? "Stock has been reserved. Please mark as shipped once the physical inventory has left the branch." : "Transfer approved. Waiting for the source branch to ship the items.")}
                                {transfer.status === 'in_transit' && (isDestinationBranch ? "Inventory is on its way. Please verify quantities and mark as received once the stock arrives." : "Inventory is currently in transit to the destination branch.")}
                                {transfer.status === 'received' && "Transfer complete. Stock levels have been updated automatically across both branches."}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
