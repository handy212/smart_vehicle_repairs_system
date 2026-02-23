"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { workordersApi } from "@/lib/api/workorders";

import { diagnosisApi } from "@/lib/api/diagnosis";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ArrowLeft, Download, CheckCircle, XCircle, AlertTriangle, AlertCircle, Package, CheckSquare, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useToast } from "@/lib/hooks/useToast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useState, useRef, useEffect } from "react";
import SignatureCanvas from "react-signature-canvas";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { Checkbox } from "@/components/ui/checkbox";

export default function WorkOrderDetailPage() {
    const params = useParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { formatCurrency } = useCurrency();
    const workOrderId = parseInt(params.id as string);
    const [showApproveDialog, setShowApproveDialog] = useState(false);
    const [customerSignature, setCustomerSignature] = useState<string | null>(null);
    const signaturePadRef = useRef<SignatureCanvas>(null);

    // State for selected recommendations
    const [selectedRecommendations, setSelectedRecommendations] = useState<number[]>([]);

    const { data: workOrder, isLoading } = useQuery({
        queryKey: ["portal", "workorder", workOrderId],
        queryFn: () => workordersApi.get(workOrderId),
        enabled: !!workOrderId,
    });



    const { data: parts, isLoading: isLoadingParts } = useQuery({
        queryKey: ["portal", "workorder", workOrderId, "parts"],
        queryFn: () => workordersApi.parts.list({ work_order: workOrderId }),
        enabled: !!workOrderId,
    });

    // Fetch Diagnosis for this work order
    const { data: diagnosis } = useQuery({
        queryKey: ["portal", "workorder", workOrderId, "diagnosis"],
        queryFn: () => diagnosisApi.getByWorkOrder(workOrderId),
        enabled: !!workOrderId,
    });

    // Fetch Recommendations if diagnosis exists
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { data: recommendations, isLoading: isLoadingRecommendations } = useQuery({
        queryKey: ["portal", "workorder", workOrderId, "recommendations"],
        queryFn: () => diagnosisApi.getRecommendations(diagnosis!.id),
        enabled: !!diagnosis?.id,
    });

    // Pre-select approved items or critical ones?
    // Actually, we should probably start with none selected or all unapproved ones selected?
    // Let's select all pending ones by default for convenience, but only once when data loads.
    useEffect(() => {
        if (recommendations) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const pendingIds = recommendations
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .filter((r: any) => !r.customer_approved)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((r: any) => r.id);
            // Only if we haven't manipulated selection yet? 
            // For now, let's just default to selecting none to require explicit action,
            // OR select all pending to encourage approval.
            // Let's select all pending to make it easy to "Approve All".
            setSelectedRecommendations(prev => {
                // If we already have a selection state (even empty array), don't overwrite it
                // BUT, empty array is initial state. 
                // Let's strictly only set if we haven't touched it.
                // A better way is to check if this is the first load.
                // For simplicity in this iteration: default to empty (user must tap).
                return prev; // Keep as is (empty initially)
            });
        }
    }, [recommendations]);

    const approveWorkOrderMutation = useMutation({
        mutationFn: (data?: { approval_notes?: string }) => {
            return workordersApi.approve(workOrderId, data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["portal", "workorder", workOrderId] });
            queryClient.invalidateQueries({ queryKey: ["portal", "workorders"] });
            setShowApproveDialog(false);
            setCustomerSignature(null);
            toast({
                title: "Work Order Approved",
                description: "The work order has been successfully approved.",
                variant: "success",
            });
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onError: (error: any) => {
        toast({
            title: "Approval Failed",
            description: error.response?.data?.error || "Failed to approve work order.",
            variant: "destructive",
        });
    },
    });

const approveRecommendationsMutation = useMutation({
    mutationFn: (data: { recommendation_ids: number[]; approved: boolean }) => {
        if (!diagnosis) throw new Error("No diagnosis found");
        return diagnosisApi.approveRecommendations(diagnosis.id, data);
    },
    onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ["portal", "workorder", workOrderId, "recommendations"] });
        // Also invalidate diagnosis as it might change IsCompleted or similar
        queryClient.invalidateQueries({ queryKey: ["portal", "workorder", workOrderId, "diagnosis"] });
        toast({
            title: "Recommendations Updated",
            description: data.message,
            variant: "success",
        });
        setSelectedRecommendations([]); // Clear selection after action
    },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onError: (error: any) => {
    toast({
        title: "Update Failed",
        description: error.response?.data?.error || "Failed to update recommendations.",
        variant: "destructive",
    });
}
    });

const handleApproveWorkOrder = () => {
    if (!customerSignature) {
        toast({
            title: "Signature Required",
            description: "Please provide your signature to approve the work order",
            variant: "destructive",
        });
        return;
    }

    approveWorkOrderMutation.mutate({
        approval_notes: "Approved via Customer Portal with Signature"
    });
};

const handleApproveSelectedRecommendations = () => {
    if (selectedRecommendations.length === 0) return;

    approveRecommendationsMutation.mutate({
        recommendation_ids: selectedRecommendations,
        approved: true
    });
};

const toggleRecommendation = (id: number) => {
    setSelectedRecommendations(prev =>
        prev.includes(id)
            ? prev.filter(item => item !== id)
            : [...prev, id]
    );
};

const handleDownload = () => {
    window.print();
};

if (isLoading) {
    return (
        <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-64 w-full" />
        </div>
    );
}

if (!workOrder) {
    return (
        <div className="text-center py-12">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">Work Order not found</p>
            <Button onClick={() => router.push("/portal/work-orders")}>Back to List</Button>
        </div>
    );
}

const isPendingApproval = workOrder.status === 'pending_approval' || (workOrder.requires_approval && !workOrder.is_approved && !workOrder.approved_by_customer);

// Group recommendations
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pendingRecommendations = recommendations?.filter((r: any) => !r.customer_approved) || [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const approvedRecommendations = recommendations?.filter((r: any) => r.customer_approved) || [];

return (
    <div className="space-y-6 max-w-5xl mx-auto pb-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => router.push("/portal/work-orders")} className="h-8 w-8 p-0">
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-foreground">
                            Work Order #{workOrder.work_order_number}
                        </h1>
                        <Badge variant={workOrder.status === 'completed' ? 'success' : 'secondary'}>
                            {workOrder.status.replace(/_/g, " ").toUpperCase()}
                        </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                        <span>Created {format(new Date(workOrder.created_at), "MMM d, yyyy")}</span>
                        {workOrder.vehicle_display && <span>•</span>}
                        {workOrder.vehicle_display && <span>{workOrder.vehicle_display}</span>}
                    </div>
                </div>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleDownload} className="h-9">
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    Print / PDF
                </Button>
                {isPendingApproval && (
                    <Button
                        size="sm"
                        className="h-9 bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={() => setShowApproveDialog(true)}
                    >
                        <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                        Approve Work
                    </Button>
                )}
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">

                {/* Repair Recommendations - NEW SECTION */}
                {recommendations && recommendations.length > 0 && (
                    <Card className="border-primary/20 shadow-sm overflow-hidden">
                        <CardHeader className="bg-primary/5 pb-3">
                            <CardTitle className="text-base font-semibold flex items-center justify-between">
                                <span className="flex items-center gap-2">
                                    <CheckSquare className="w-4 h-4 text-primary" />
                                    Repair Recommendations
                                </span>
                                {selectedRecommendations.length > 0 && (
                                    <Badge variant="default" className="ml-2">
                                        {selectedRecommendations.length} Selected
                                    </Badge>
                                )}
                            </CardTitle>
                            <CardDescription>
                                Review and approve recommended services from our diagnosis.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            // Pending Items
                            {pendingRecommendations.length > 0 && (
                                <div className="divide-y border-b">
                                    <div className="p-3 bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                        Pending Approval
                                    </div>
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    {pendingRecommendations.map((rec: any) => (
                                        <div key={rec.id} className={cn(
                                            "p-4 transition-colors hover:bg-muted/20",
                                            selectedRecommendations.includes(rec.id) ? "bg-primary/5" : ""
                                        )}>
                                            <div className="flex items-start gap-4">
                                                <Checkbox
                                                    id={`rec-${rec.id}`}
                                                    checked={selectedRecommendations.includes(rec.id)}
                                                    onCheckedChange={() => toggleRecommendation(rec.id)}
                                                    className="mt-1"
                                                />
                                                <div className="flex-1 space-y-1">
                                                    <div className="flex items-center justify-between">
                                                        <Label htmlFor={`rec-${rec.id}`} className="font-medium cursor-pointer text-base">
                                                            {rec.description}
                                                        </Label>
                                                        <span className="font-semibold text-primary/80">
                                                            {formatCurrency(rec.estimated_total_cost)}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-xs">
                                                        <Badge variant={
                                                            rec.priority === 'critical' ? 'danger' :
                                                                rec.priority === 'necessary' ? 'default' :
                                                                    'secondary'
                                                        } className="uppercase text-[10px] h-5 px-1.5">
                                                            {rec.priority}
                                                        </Badge>
                                                        <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-muted-foreground">
                                                            {rec.recommendation_type}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    <div className="p-4 bg-muted/10 flex justify-end">
                                        <Button
                                            onClick={handleApproveSelectedRecommendations}
                                            disabled={selectedRecommendations.length === 0 || approveRecommendationsMutation.isPending}
                                            size="sm"
                                        >
                                            {approveRecommendationsMutation.isPending
                                                ? "Processing..."
                                                : `Approve Selected (${selectedRecommendations.length})`}
                                        </Button>
                                    </div>
                                </div>
                            )}

                            // Approved Items
                            {approvedRecommendations.length > 0 && (
                                <div className="divide-y">
                                    <div className="p-3 bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                        <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                                        Approved
                                    </div>
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    {approvedRecommendations.map((rec: any) => (
                                        <div key={rec.id} className="p-4 opacity-75">
                                            <div className="flex items-start gap-4">
                                                <div className="mt-1">
                                                    <CheckCircle className="w-5 h-5 text-green-600/50" />
                                                </div>
                                                <div className="flex-1 space-y-1">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-medium text-foreground/80 line-through decoration-muted-foreground/30">
                                                            {rec.description}
                                                        </span>
                                                        <span className="font-semibold text-muted-foreground">
                                                            {formatCurrency(rec.estimated_total_cost)}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-xs">
                                                        <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                                                            Approved
                                                        </Badge>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            // Empty state handled by parent condition
                        </CardContent>
                    </Card>
                )}

                {/* Parts */}
                <Card>
                    <CardHeader className="pb-3 border-b">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <Package className="w-4 h-4" />
                            Parts Required
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {isLoadingParts ? (
                            <div className="p-4 space-y-2">
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-2/3" />
                            </div>
                        ) : parts && parts.length > 0 ? (
                            <div className="divide-y">
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                {parts.map((part: any) => (
                                    <div key={part.id} className="p-4 flex justify-between items-start gap-4">
                                        <div>
                                            <p className="font-medium text-foreground">{part.part_name}</p>
                                            <div className="text-sm text-muted-foreground mt-0.5">
                                                {part.part_number && <span className="mr-3">#{part.part_number}</span>}
                                                <span>Qty: {part.quantity}</span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-medium">{formatCurrency(part.selling_price || "0")}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="p-6 text-center text-muted-foreground text-sm">
                                No parts currently listed for this work order.
                            </div>
                        )}
                    </CardContent>
                </Card>

            </div>

            {/* Sidebar */}
            <div className="space-y-6">
                {/* Summary / Financials */}
                <Card>
                    <CardHeader className="pb-3 bg-muted/30">
                        <CardTitle className="text-base font-semibold">Order Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-3">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Parts Total</span>
                            <span>{formatCurrency(workOrder.estimated_parts_cost || "0")}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Labor Total</span>
                            <span>{formatCurrency(workOrder.estimated_labor_cost || "0")}</span>
                        </div>
                        {/* Show pending recommendations value if any */}
                        {pendingRecommendations.length > 0 && (
                            <div className="flex justify-between text-sm text-muted-foreground italic border-t border-dashed pt-2 mt-2">
                                <span>Pending Approval</span>
                                <span>{formatCurrency(
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        pendingRecommendations.reduce((sum: number, r: any) => sum + parseFloat(r.estimated_total_cost || "0"), 0)
                                )}</span>
                            </div>
                        )}
                        <div className="border-t pt-3 flex justify-between font-bold text-lg">
                            <span>Total Est.</span>
                            <span className="text-primary">{formatCurrency(workOrder.estimated_total || workOrder.total_cost || "0")}</span>
                        </div>
                    </CardContent>
                </Card>

                {/* Vehicle Info */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Vehicle</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="flex items-start gap-3">
                            <div className="bg-primary/10 p-2 rounded-full">
                                {/* Simple Car Icon */}
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /></svg>
                            </div>
                            <div>
                                <p className="font-semibold text-foreground">{workOrder.vehicle_display}</p>
                                {workOrder.vehicle_info && (
                                    <p className="text-sm text-muted-foreground">{workOrder.vehicle_info}</p>
                                )}
                                {workOrder.odometer_in && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Odometer In: {workOrder.odometer_in.toLocaleString()}
                                    </p>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Service Advisor */}
                {workOrder.service_coordinator_name && (
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">My Service Advisor</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <p className="font-medium">{workOrder.service_coordinator_name}</p>
                            <p className="text-xs text-muted-foreground">Contact for questions about this order</p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>

        {/* Approval Dialog */}
        <Dialog
            open={showApproveDialog}
            onOpenChange={(open) => {
                setShowApproveDialog(open);
                if (!open) {
                    setCustomerSignature(null);
                    if (signaturePadRef.current) {
                        signaturePadRef.current.clear();
                    }
                }
            }}
        >
            <DialogContent className="max-w-lg p-0 sm:max-w-lg">
                <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6">
                    <DialogTitle className="text-lg font-semibold">Approve Work Order</DialogTitle>
                    <DialogDescription className="text-sm text-muted-foreground">
                        By signing below, you authorize us to perform the services detailed in this work order.
                    </DialogDescription>
                </DialogHeader>
                <div className="px-4 sm:px-6 pb-4 space-y-4">
                    {/* Signature Section */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium">
                                Your Signature
                                <span className="text-destructive ml-1">*</span>
                            </Label>
                            {customerSignature && (
                                <Badge variant="outline" className="text-xs">
                                    Signed
                                </Badge>
                            )}
                        </div>
                        <div className="border-2 border-dashed border-border rounded-lg bg-background p-2">
                            <SignatureCanvas
                                ref={signaturePadRef}
                                canvasProps={{
                                    width: 450,
                                    height: 150,
                                    className: "signature-canvas w-full",
                                }}
                                onEnd={() => {
                                    if (signaturePadRef.current && !signaturePadRef.current.isEmpty()) {
                                        const dataURL = signaturePadRef.current.toDataURL();
                                        setCustomerSignature(dataURL);
                                    } else {
                                        setCustomerSignature(null);
                                    }
                                }}
                                penColor="#000000"
                                backgroundColor="#ffffff"
                            />
                            <div className="flex items-center justify-end mt-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        if (signaturePadRef.current) {
                                            signaturePadRef.current.clear();
                                            setCustomerSignature(null);
                                        }
                                    }}
                                    disabled={!customerSignature}
                                    className="h-7 text-xs"
                                >
                                    Clear
                                </Button>
                            </div>
                        </div>
                        {!customerSignature && (
                            <p className="text-xs text-muted-foreground">
                                Please provide your signature to approve.
                            </p>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <DialogFooter className="gap-2 sm:gap-3 pt-4 border-t">
                        <Button
                            variant="outline"
                            className="flex-1 sm:flex-none"
                            onClick={() => {
                                setShowApproveDialog(false);
                                setCustomerSignature(null);
                                if (signaturePadRef.current) {
                                    signaturePadRef.current.clear();
                                }
                            }}
                            disabled={approveWorkOrderMutation.isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            className="flex-1 sm:flex-none bg-success hover:bg-green-700 text-white"
                            onClick={handleApproveWorkOrder}
                            disabled={!customerSignature || approveWorkOrderMutation.isPending}
                        >
                            {approveWorkOrderMutation.isPending ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                                    Approving...
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                    Approve & Authorize
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    </div>
);
}
