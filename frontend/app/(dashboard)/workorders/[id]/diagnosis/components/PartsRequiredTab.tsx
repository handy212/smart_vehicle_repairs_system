"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { workordersApi, WorkOrderPart } from "@/lib/api/workorders";
import { diagnosisApi } from "@/lib/api/diagnosis";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/lib/hooks/useToast";
import {
    Package,
    Plus,
    Trash2,
    AlertCircle,
    CheckCircle,
    Clock,
    Search,
    Send
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface PartsRequiredTabProps {
    diagnosis: any; // Type as needed
    workOrder: any; // Type as needed
    onRefresh: () => void;
    isDisabled?: boolean;
}

export function PartsRequiredTab({
    diagnosis,
    workOrder,
    onRefresh,
    isDisabled = false,
}: PartsRequiredTabProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [showAddDialog, setShowAddDialog] = useState(false);

    // Fetch parts for this work order
    const { data: partsData, isLoading, error } = useQuery({
        queryKey: ["workorder-parts", workOrder?.id],
        queryFn: () => workordersApi.parts.list(workOrder?.id!),
        enabled: !!workOrder?.id,
    });

    // Handle paginated response or direct array
    const parts = Array.isArray(partsData) ? partsData : (partsData as any)?.results || [];

    const deleteMutation = useMutation({
        mutationFn: (id: number) => workordersApi.parts.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["workorder-parts", workOrder?.id] });
            toast({ title: "Part request removed", variant: "default" });
        },
        onError: (error: any) => {
            toast({
                title: "Failed to remove part",
                description: error.response?.data?.message || error.message,
                variant: "destructive",
            });
        },
    });

    const getStatusConfig = (status: string) => {
        switch (status) {
            case "pending":
                return { color: "text-yellow-600 bg-yellow-50", icon: Clock };
            case "ordered":
                return { color: "text-blue-600 bg-blue-50", icon: Package };
            case "received":
                return { color: "text-green-600 bg-green-50", icon: CheckCircle };
            case "installed":
                return { color: "text-gray-600 bg-gray-50", icon: CheckCircle };
            default:
                return { color: "text-gray-600 bg-gray-50", icon: AlertCircle };
        }
    };

    const [editPart, setEditPart] = useState<WorkOrderPart | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Filter parts that are in 'draft' status for submission
    const draftParts = parts.filter((p: any) => p.status === 'draft');
    const hasDraftParts = draftParts.length > 0;

    const handleSubmitRequest = async () => {
        if (!diagnosis?.id) return;

        try {
            setIsSubmitting(true);
            const response = await diagnosisApi.requestPartsEstimate(diagnosis.id);
            toast({
                title: "Request Sent",
                description: response.message,
                variant: "success",
            });
            onRefresh(); // Refresh to show updated statuses
        } catch (error: any) {
            toast({
                title: "Failed to submit request",
                description: error.response?.data?.error || error.message,
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <Card className="border-none shadow-sm bg-gray-50/50 dark:bg-gray-800/50">
                <CardHeader className="flex flex-row items-center justify-between pb-3 border-b bg-gray-50/50 dark:bg-gray-800/50">
                    <div className="space-y-1">
                        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-gray-700">Parts Required</CardTitle>
                        <CardDescription className="text-xs">
                            List all parts required for this repair.
                        </CardDescription>
                    </div>
                    <div className="flex items-center space-x-2">
                        {hasDraftParts && (
                            <Button
                                onClick={handleSubmitRequest}
                                size="sm"
                                className="h-8 bg-blue-600 hover:bg-blue-700 text-white"
                                disabled={isDisabled || isSubmitting}
                            >
                                {isSubmitting ? (
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                                ) : (
                                    <Send className="w-3.5 h-3.5 mr-1.5" />
                                )}
                                Submit
                            </Button>
                        )}
                        <Button onClick={() => { setEditPart(null); setShowAddDialog(true); }} size="sm" className="h-8" disabled={isDisabled}>
                            <Plus className="w-3.5 h-3.5 mr-1.5" />
                            Add Part
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="pt-0 px-0">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                        </div>
                    ) : parts.length === 0 ? (
                        <div className="text-center py-16">
                            <Package className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">No parts requested</h3>
                            <p className="text-xs text-gray-500 mb-4 max-w-sm mx-auto">
                                Add parts needed for this repair.
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8"
                                onClick={() => { setEditPart(null); setShowAddDialog(true); }}
                                disabled={isDisabled}
                            >
                                <Plus className="w-3.5 h-3.5 mr-1.5" />
                                Add Part
                            </Button>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow className="border-b border-gray-100 dark:border-gray-800">
                                    <TableHead className="w-[300px]">Part Name / Description</TableHead>
                                    <TableHead>Part Number</TableHead>
                                    <TableHead className="text-center">Qty</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {parts.map((part: WorkOrderPart) => {
                                    const status = getStatusConfig(part.status);
                                    const StatusIcon = status.icon;
                                    // Allow editing only if draft or pending (maybe pending is locked? User implied allow edit "as well")
                                    // Let's allow editing for all status for now, or maybe restrict 'ordered'/'installed'
                                    const canEdit = !isDisabled && (part.status === 'draft' || part.status === 'pending');

                                    return (
                                        <TableRow key={part.id} className="group border-gray-100 dark:border-gray-800">
                                            <TableCell className="font-medium">
                                                <div className="flex flex-col">
                                                    <span>{part.part_name}</span>
                                                    {part.description && (
                                                        <span className="text-xs text-gray-500 truncate max-w-[250px]">{part.description}</span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {part.part_number ? (
                                                    <Badge variant="outline" className="font-mono text-[10px]">{part.part_number}</Badge>
                                                ) : (
                                                    <span className="text-gray-400 text-xs">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-center">{part.quantity}</TableCell>
                                            <TableCell>
                                                <Badge variant="secondary" className={`text-[10px] px-2 py-0.5 border-0 flex w-fit items-center gap-1 ${status.color}`}>
                                                    <StatusIcon className="w-3 h-3" />
                                                    <span className="capitalize">{part.status === 'draft' ? 'Draft' : part.status.replace('_', ' ')}</span>
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    {canEdit && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 w-8 p-0 text-gray-400 hover:text-blue-500"
                                                            onClick={() => {
                                                                setEditPart(part);
                                                                setShowAddDialog(true);
                                                            }}
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-pencil"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                                                        onClick={() => {
                                                            if (confirm("Remove this part request?")) {
                                                                deleteMutation.mutate(part.id);
                                                            }
                                                        }}
                                                        disabled={isDisabled}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <PartFormDialog
                open={showAddDialog}
                onOpenChange={setShowAddDialog}
                workOrderId={workOrder?.id}
                initialData={editPart}
                onSuccess={() => {
                    queryClient.invalidateQueries({ queryKey: ["workorder-parts", workOrder?.id] });
                    onRefresh();
                }}
            />
        </>
    );
}

function PartFormDialog({
    open,
    onOpenChange,
    workOrderId,
    initialData,
    onSuccess,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    workOrderId: number;
    initialData: WorkOrderPart | null;
    onSuccess: () => void;
}) {
    const { toast } = useToast();
    const [formData, setFormData] = useState({
        part_name: "",
        part_number: "",
        quantity: 1,
        description: "",
    });

    React.useEffect(() => {
        if (initialData) {
            setFormData({
                part_name: initialData.part_name,
                part_number: initialData.part_number || "",
                quantity: typeof initialData.quantity === 'number' ? initialData.quantity : parseFloat(initialData.quantity as any),
                description: initialData.description || "",
            });
        } else {
            setFormData({ part_name: "", part_number: "", quantity: 1, description: "" });
        }
    }, [initialData, open]);

    const mutation = useMutation({
        mutationFn: (data: any) => {
            if (initialData) {
                return workordersApi.parts.update(initialData.id, data);
            }
            return workordersApi.parts.create({ ...data, work_order: workOrderId, status: 'draft' }); // Explicitly draft
        },
        onSuccess: () => {
            toast({ title: initialData ? "Part updated" : "Part requested", variant: "default" });
            onSuccess();
            onOpenChange(false);
        },
        onError: (error: any) => {
            toast({
                title: "Failed to save part",
                description: error.response?.data?.message || error.message,
                variant: "destructive",
            });
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.part_name) return;
        mutation.mutate(formData);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-xl sm:rounded-xl">
                <DialogHeader>
                    <DialogTitle>{initialData ? "Edit Part Request" : "Request Part"}</DialogTitle>
                    <DialogDescription>
                        {initialData ? "Update details for this part request." : "Specify details for the part required."}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="part_name">Part Name <span className="text-red-500">*</span></Label>
                        <Input
                            id="part_name"
                            placeholder="e.g. Oil Filter, Brake Pads"
                            value={formData.part_name}
                            onChange={(e) => setFormData({ ...formData, part_name: e.target.value })}
                            required
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="part_number">Part Number (Optional)</Label>
                            <Input
                                id="part_number"
                                placeholder="Manufacturer PN"
                                value={formData.part_number}
                                onChange={(e) => setFormData({ ...formData, part_number: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="quantity">Quantity <span className="text-red-500">*</span></Label>
                            <Input
                                id="quantity"
                                type="number"
                                min="1"
                                value={formData.quantity}
                                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                                required
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="description">Notes / Description</Label>
                        <Input
                            id="description"
                            placeholder="Additional details, brands, etc."
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        />
                    </div>
                    <DialogFooter className="pt-2">
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={mutation.isPending}>
                            {mutation.isPending ? "Saving..." : (initialData ? "Update Part" : "Request Part")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
