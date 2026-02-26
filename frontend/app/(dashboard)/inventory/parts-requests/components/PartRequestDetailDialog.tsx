"use client";

import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { workordersApi, WorkOrderPart } from "@/lib/api/workorders";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShoppingCart, CheckCircle, ExternalLink, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/lib/hooks/useToast";
import { InlineInventoryForm, InventoryFormData } from "./InlineInventoryForm";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PartRequestDetailDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    workOrderId: number | null;
    parts: WorkOrderPart[];
    onRefresh: () => void;
}

export function PartRequestDetailDialog({
    open,
    onOpenChange,
    workOrderId,
    parts = [],
    onRefresh,
}: PartRequestDetailDialogProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [showInventoryForm, setShowInventoryForm] = React.useState<number | null>(null);
    // * eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const [inventoryFormData, setInventoryFormData] = React.useState<any>(null);
    const [editingPart, setEditingPart] = React.useState<WorkOrderPart | null>(null);
    const [editForm, setEditForm] = React.useState({ part_name: '', part_number: '', quantity: 1, description: '' });

    // Update edit form when editingPart changes
    React.useEffect(() => {
        if (editingPart) {
            setEditForm({
                part_name: editingPart.part_name,
                part_number: editingPart.part_number || '',
                quantity: editingPart.quantity,
                description: editingPart.description || ''
            });
        }
    }, [editingPart]);



    const allocateMutation = useMutation({
        mutationFn: (id: number) => workordersApi.parts.allocate(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["parts-requests"] });
            onRefresh();
            toast({ title: "Part Allocated", variant: "success" });
        },
        onError: (error: any) => {
            toast({
                title: "Allocation Failed",
                description: error.response?.data?.error || error.message,
                variant: "destructive",
            });
        },
    });

    const orderMutation = useMutation({
        mutationFn: async (id: number) => workordersApi.parts.order(id),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["parts-requests"] });
            onRefresh();
            setShowInventoryForm(null);
            toast({ title: "PO Created", description: `PO #${data.po_number}`, variant: "success" });
        },
        onError: (error: any, partId: number) => {
            const errorData = error.response?.data;
            if (errorData?.needs_inventory_item && errorData?.part_data) {
                setShowInventoryForm(partId);
                setInventoryFormData(errorData.part_data);
            } else {
                toast({
                    title: "Order Failed",
                    description: errorData?.error || error.message,
                    variant: "destructive",
                });
            }
        },
    });

    const createAndOrderMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: InventoryFormData }) =>
            workordersApi.parts.createAndOrder(id, data),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["parts-requests"] });
            onRefresh();
            setShowInventoryForm(null);
            setInventoryFormData(null);
            toast({
                title: "PO Created",
                description: `Created inventory item and PO #${data.po_number}`,
                variant: "success"
            });
        },

        onError: (error: any) => {
            toast({
                title: "Creation Failed",
                description: error.response?.data?.error || error.message,
                variant: "destructive",
            });
        },
    });

    const bulkOrderMutation = useMutation({
        mutationFn: (ids: number[]) => workordersApi.parts.bulkOrder(ids),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["parts-requests"] });
            onRefresh();
            const poList = data.po_numbers?.length > 0 ? data.po_numbers.join(", ") : "N/A";

            if (data.errors && data.errors.length > 0) {
                const errorMsg = data.errors.join("; ");
                const title = data.processed > 0 ? "Bulk Order Partial Success" : "Bulk Order Failed";
                const variant = data.processed > 0 ? "default" : "destructive";

                toast({
                    title: title,
                    description: `${data.processed || 0} processed. Errors: ${errorMsg}`,
                    variant: variant
                });
            } else {
                toast({
                    title: "Bulk PO Created",
                    description: `${data.processed || 0} part(s) processed. PO(s): ${poList}`,
                    variant: "success"
                });
            }
        },

        onError: (error: any) => {
            toast({
                title: "Bulk Order Failed",
                description: error.response?.data?.error || error.message,
                variant: "destructive",
            });
        },
    });

    const updatePartMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<WorkOrderPart> }) =>
            workordersApi.parts.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["parts-requests"] });
            onRefresh();
            setEditingPart(null);
            toast({ title: "Part Updated", variant: "success" });
        },

        onError: (error: any) => {
            toast({
                title: "Update Failed",
                description: error.response?.data?.error || error.message,
                variant: "destructive",
            });
        },
    });

    const deletePartMutation = useMutation({
        mutationFn: (id: number) => workordersApi.parts.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["parts-requests"] });
            onRefresh();
            toast({ title: "Request Removed", variant: "success" });
        },

        onError: (error: any) => {
            toast({
                title: "Remove Failed",
                description: error.response?.data?.error || error.message,
                variant: "destructive",
            });
        },
    });

    if (!workOrderId || parts.length === 0) return null;

    // Identify parts eligible for bulk order
    const outOfStockParts = parts.filter(p => {
        const isReady = p.status === 'ready' || p.status === 'received' || p.status === 'po_created';
        const inStock = p.inventory_status?.available;
        return !isReady && !inStock && p.part_number; // Only orderable parts
    });

    const canBulkOrder = outOfStockParts.length > 0;

    const firstPart = parts[0];
    const woNumber = firstPart.work_order_number || `WO #${workOrderId}`;
    const customerName = firstPart.customer_name || "Unknown Customer";

    const handlePrint = () => {
        window.print();
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-5xl">
                    <DialogHeader className="border-b pb-4 mb-0">
                        <div className="flex items-center justify-between">
                            <div>
                                <DialogTitle className="text-xl font-bold flex items-center gap-3">
                                    Part Request
                                    <Link href={`/workorders/${workOrderId}`} target="_blank" className="hover:opacity-80 transition-opacity">
                                        <Badge variant="outline" className="font-mono text-base font-normal text-primary bg-primary/10 border-orange-200 px-2 py-0.5 flex items-center gap-1">
                                            {woNumber}
                                            <ExternalLink className="w-3 h-3" />
                                        </Badge>
                                    </Link>
                                </DialogTitle>
                                <DialogDescription className="mt-1.5 text-sm text-muted-foreground">
                                    <span className="font-medium text-card-foreground">{customerName}</span>
                                    <span className="mx-2 text-gray-300">|</span>
                                    {parts.length} item{parts.length !== 1 ? 's' : ''} requested
                                </DialogDescription>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={handlePrint}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-printer w-4 h-4 mr-2"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect width="12" height="8" x="6" y="14" /></svg>
                                    Print
                                </Button>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="py-2">
                        <div className="rounded-md border shadow-sm">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                                        <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground pl-4">Part Details</TableHead>
                                        <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Part Number</TableHead>
                                        <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-center">Qty</TableHead>
                                        <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right pr-4">Availability / Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {parts.map((part) => {
                                        const isReady = part.status === 'ready';
                                        const isOrdered = part.status === 'po_created';
                                        const isReceived = part.status === 'received';
                                        const isAwaitingStock = part.status === 'awaiting_stock';
                                        const inStock = part.inventory_status?.available;
                                        const stockQty = part.inventory_status?.quantity || 0;

                                        // Determine what to show in the action column
                                        const showAllocate = !isReady && inStock;
                                        const showPO = !isReady && !isOrdered && !isReceived && !isAwaitingStock && !inStock;

                                        return (
                                            <React.Fragment key={part.id}>
                                                <TableRow className="group hover:bg-muted/50">
                                                    <TableCell className="py-2.5 pl-4">
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="font-medium text-sm text-foreground">{part.part_name}</span>
                                                            {part.description && (
                                                                <span className="text-xs text-muted-foreground truncate max-w-[300px]">{part.description}</span>
                                                            )}
                                                            {/* Inventory Status Badge */}
                                                            {!isReady && !showPO && part.part_number && (
                                                                <div className="mt-1">
                                                                    {inStock ? (
                                                                        <Badge variant="outline" className="text-[10px] h-4 px-1 bg-success/10 text-green-700 border-green-200">
                                                                            In Stock: {stockQty}
                                                                        </Badge>
                                                                    ) : (
                                                                        <Badge variant="outline" className="text-[10px] h-4 px-1 bg-red-50 text-red-700 border-red-200">
                                                                            Out of Stock
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="py-2.5 font-mono text-xs text-muted-foreground">
                                                        {part.part_number || <span className="text-gray-300 italic">-</span>}
                                                    </TableCell>
                                                    <TableCell className="py-2.5 text-center">
                                                        <Badge variant="secondary" className="font-mono text-[10px] h-5 px-1.5 min-w-[24px] justify-center">
                                                            {part.quantity}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="py-2.5 text-right pr-4">
                                                        {isReady ? (
                                                            <Badge variant="success" className="h-6 px-2">Ready</Badge>
                                                        ) : showAllocate ? (
                                                            <Button
                                                                size="sm"
                                                                variant="default" // Primary action
                                                                className="h-7 text-xs font-medium bg-success hover:bg-green-700 text-white shadow-sm"
                                                                onClick={() => allocateMutation.mutate(part.id)}
                                                                disabled={allocateMutation.isPending}
                                                            >
                                                                <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                                                                Allocate
                                                            </Button>
                                                        ) : showPO ? (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-7 text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 border-indigo-200"
                                                                onClick={() => orderMutation.mutate(part.id)}
                                                                disabled={orderMutation.isPending || showInventoryForm === part.id}
                                                            >
                                                                <ShoppingCart className="w-3.5 h-3.5 mr-1.5" />
                                                                PO
                                                            </Button>
                                                        ) : (
                                                            <Badge variant="secondary" className="h-6 px-2">
                                                                {isReceived ? 'Received' :
                                                                    isAwaitingStock ? 'Awaiting Stock' :
                                                                        part.purchase_order_number ? `PO #${part.purchase_order_number}` : 'PO Created'}
                                                            </Badge>
                                                        )}

                                                        {/* Actions Menu */}
                                                        <div className="inline-flex ml-2">
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                                                                        <MoreHorizontal className="w-4 h-4" />
                                                                    </Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end">
                                                                    <DropdownMenuItem onClick={() => setEditingPart(part)}>
                                                                        <Pencil className="mr-2 h-4 w-4" /> Edit Details
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem
                                                                        className="text-red-600 focus:text-red-600"
                                                                        onClick={() => {
                                                                            if (confirm('Are you sure you want to remove this request?')) {
                                                                                deletePartMutation.mutate(part.id);
                                                                            }
                                                                        }}
                                                                    >
                                                                        <Trash2 className="mr-2 h-4 w-4" /> Remove Request
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                                {/* Inline Inventory Form */}
                                                {showInventoryForm === part.id && inventoryFormData && (
                                                    <TableRow>
                                                        <TableCell colSpan={4} className="p-4">
                                                            <InlineInventoryForm
                                                                partName={inventoryFormData.part_name}
                                                                partNumber={inventoryFormData.part_number}
                                                                description={inventoryFormData.description}
                                                                onSubmit={(data) => createAndOrderMutation.mutate({ id: part.id, data })}
                                                                onCancel={() => {
                                                                    setShowInventoryForm(null);
                                                                    setInventoryFormData(null);
                                                                }}
                                                                isSubmitting={createAndOrderMutation.isPending}
                                                            />
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </div>

                    <DialogFooter className="flex items-center justify-between sm:justify-between border-t pt-4 mt-2">
                        <Button variant="outline" size="sm" asChild className="text-muted-foreground">
                            <Link href={`/workorders/${workOrderId}/diagnosis`} target="_blank">
                                View Diagnosis <ExternalLink className="w-3 h-3 ml-2" />
                            </Link>
                        </Button>
                        <div className="flex gap-2">
                            {canBulkOrder && (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200"
                                    onClick={() => bulkOrderMutation.mutate(outOfStockParts.map(p => p.id))}
                                    disabled={bulkOrderMutation.isPending}
                                >
                                    <ShoppingCart className="w-3.5 h-3.5 mr-1.5" />
                                    Create POs for All ({outOfStockParts.length})
                                </Button>
                            )}
                            <Button variant="default" size="sm" onClick={() => onOpenChange(false)}>
                                Done
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Part Dialog */}
            <Dialog open={!!editingPart} onOpenChange={(open) => !open && setEditingPart(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Edit Part Request</DialogTitle>
                        <DialogDescription>Update details for this part request.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="part_name" className="text-right">Part Name</Label>
                            <Input
                                id="part_name"
                                value={editForm.part_name}
                                onChange={(e) => setEditForm({ ...editForm, part_name: e.target.value })}
                                className="col-span-3"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="part_number" className="text-right">Part No.</Label>
                            <Input
                                id="part_number"
                                placeholder="Required for PO"
                                value={editForm.part_number}
                                onChange={(e) => setEditForm({ ...editForm, part_number: e.target.value })}
                                className="col-span-3"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="quantity" className="text-right">Quantity</Label>
                            <Input
                                id="quantity"
                                type="number"
                                min="1"
                                value={editForm.quantity}
                                onChange={(e) => setEditForm({ ...editForm, quantity: parseInt(e.target.value) || 1 })}
                                className="col-span-3"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="description" className="text-right">Description</Label>
                            <Input
                                id="description"
                                value={editForm.description}
                                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                className="col-span-3"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingPart(null)}>Cancel</Button>
                        <Button
                            onClick={() => updatePartMutation.mutate({ id: editingPart!.id, data: editForm })}
                            disabled={updatePartMutation.isPending}
                        >
                            {updatePartMutation.isPending ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog >
        </>
    );
}
