"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryApi, PurchaseOrder, PurchaseOrderItem } from "@/lib/api/inventory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/lib/hooks/useToast";
import { Package, CheckCircle, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBranchStore } from "@/store/branchStore";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { getUserFacingError } from "@/lib/api/errors";

interface ReceiveItemsDialogProps {
    purchaseOrder: PurchaseOrder;
    triggerLabel?: string;
}

interface ItemReceiveState {
    quantityToReceive: number;
    notes?: string;
}

export default function ReceiveItemsDialog({ purchaseOrder, triggerLabel = "Receive Items" }: ReceiveItemsDialogProps) {

    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { activeBranch } = useBranchStore();
    const [isOpen, setIsOpen] = useState(false);
    const [itemStates, setItemStates] = useState<Record<number, ItemReceiveState>>({});
    const [globalNotes, setGlobalNotes] = useState("");

    const getRemainingQuantity = (item: PurchaseOrderItem) => {
        if (typeof item.remaining_quantity === 'number') {
            return item.remaining_quantity;
        }
        return item.quantity - (item.quantity_received || 0);
    };

    const unreceivedItems = purchaseOrder.items?.filter((item) => getRemainingQuantity(item) > 0) || [];

    const openDialog = () => {
        const newStates: Record<number, ItemReceiveState> = {};
        unreceivedItems.forEach((item) => {
            newStates[item.id] = {
                quantityToReceive: getRemainingQuantity(item),
                notes: "",
            };
        });
        setItemStates(newStates);
        setGlobalNotes("");
        setIsOpen(true);
    };

    const updateItemQuantity = (itemId: number, quantity: number) => {
        const item = unreceivedItems.find((i) => i.id === itemId);
        if (!item) return;

        const remaining = getRemainingQuantity(item);
        const validQuantity = Math.max(1, Math.min(quantity, remaining));

        setItemStates((prev) => ({
            ...prev,
            [itemId]: {
                ...prev[itemId],
                quantityToReceive: validQuantity,
            },
        }));
    };

    const receiveItemMutation = useMutation({
        mutationFn: ({ itemId, quantityReceived, notes }: { itemId: number; quantityReceived: number; notes?: string }) =>
            inventoryApi.receiveItem(itemId, quantityReceived, notes),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["purchase-order", purchaseOrder.id] });
            queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });

            // Clear the item state after successful receive
            setItemStates((prev) => {
                const updated = { ...prev };
                delete updated[variables.itemId];
                return updated;
            });

            toast({
                title: "Success",
                description: `Received ${variables.quantityReceived} item(s) successfully`,
            });
        },

        onError: (error: unknown) => {
            let errorMessage = getUserFacingError(error, "Failed to receive item");

            if (errorMessage.toLowerCase().includes('branch')) {
                errorMessage = `${errorMessage} Please ensure the purchase order has a branch assigned.`;
            }

            toast({
                title: "Error Receiving Item",
                description: errorMessage,
                variant: "destructive",
            });
        },
    });

    const handleReceiveItem = (item: PurchaseOrderItem) => {
        const state = itemStates[item.id];
        if (!state) return;

        const quantityToReceive = state.quantityToReceive;
        const remaining = getRemainingQuantity(item);

        if (quantityToReceive <= 0) {
            toast({
                title: "Invalid Quantity",
                description: "Quantity to receive must be greater than 0",
                variant: "destructive",
            });
            return;
        }

        if (quantityToReceive > remaining) {
            toast({
                title: "Invalid Quantity",
                description: `Cannot receive more than remaining quantity (${remaining})`,
                variant: "destructive",
            });
            return;
        }

        const notes = state.notes || globalNotes || undefined;
        receiveItemMutation.mutate({
            itemId: item.id,
            quantityReceived: quantityToReceive,
            notes,
        });
    };

    const handleReceiveAll = () => {
        const itemsToReceive = unreceivedItems.filter((item) => {
            const state = itemStates[item.id];
            return state && state.quantityToReceive > 0;
        });

        if (itemsToReceive.length === 0) {
            toast({
                title: "No Items",
                description: "No items selected for receiving",
                variant: "destructive",
            });
            return;
        }

        // Receive items sequentially
        itemsToReceive.forEach((item, index) => {
            setTimeout(() => {
                handleReceiveItem(item);
            }, index * 100); // Small delay to avoid overwhelming the API
        });
    };



    const totalRemaining = unreceivedItems.reduce((sum, item) => sum + getRemainingQuantity(item), 0);
    const totalToReceive = Object.values(itemStates).reduce((sum, state) => sum + (state.quantityToReceive || 0), 0);

    return (
        <>
            <Button size="sm" className="h-9" onClick={openDialog}>
                <Package className="w-4 h-4 mr-2" />
                {triggerLabel}
            </Button>

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
                    <DialogHeader className="px-6 py-4 border-b">
                        <DialogTitle>{triggerLabel}</DialogTitle>
                        {activeBranch && (
                            <p className="text-sm text-muted-foreground mt-1">
                                Branch: <span className="font-medium">{activeBranch.name}</span>
                            </p>
                        )}
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto px-6 py-4">
                        {unreceivedItems.length === 0 ? (
                            <div className="text-center py-12">
                                <CheckCircle className="w-12 h-12 text-success mx-auto mb-4" />
                                <p className="text-muted-foreground">All items have been received</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Summary Stats */}
                                <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
                                    <div>
                                        <p className="text-xs text-muted-foreground uppercase tracking-wider">Items Remaining</p>
                                        <p className="text-2xl font-bold text-foreground">{unreceivedItems.length}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Remaining</p>
                                        <p className="text-2xl font-bold text-foreground">{totalRemaining}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground uppercase tracking-wider">Ready to Receive</p>
                                        <p className="text-2xl font-bold text-primary">{totalToReceive}</p>
                                    </div>
                                </div>

                                {/* Items Table */}
                                <div className="border rounded-lg overflow-hidden">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-[200px]">Part</TableHead>
                                                <TableHead className="text-right">Ordered</TableHead>
                                                <TableHead className="text-right">Received</TableHead>
                                                <TableHead className="text-right">Remaining</TableHead>
                                                <TableHead className="text-right w-[120px]">Qty to Receive</TableHead>
                                                <TableHead className="w-[100px]">Action</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {unreceivedItems.map((item) => {
                                                const remaining = getRemainingQuantity(item);
                                                const state = itemStates[item.id] || { quantityToReceive: remaining, notes: "" };
                                                const isFullyReceived = remaining === 0;
                                                const hasPartialReceipt = (item.quantity_received || 0) > 0;

                                                return (
                                                    <TableRow key={item.id} className={isFullyReceived ? "opacity-50" : ""}>
                                                        <TableCell>
                                                            <div>
                                                                <p className="font-medium text-sm">
                                                                    {item.part_name || (typeof item.part === 'object' ? item.part.name : '-')}
                                                                </p>
                                                                <p className="text-xs text-muted-foreground font-mono">
                                                                    {item.part_number || (typeof item.part === 'object' ? item.part.part_number : '-')}
                                                                </p>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right font-medium">{item.quantity}</TableCell>
                                                        <TableCell className="text-right">
                                                            <span className={hasPartialReceipt ? "text-warning font-medium" : ""}>
                                                                {item.quantity_received || 0}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Badge variant={remaining > 0 ? "outline" : "default"} className="font-mono">
                                                                {remaining}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Input
                                                                type="number"
                                                                min={1}
                                                                max={remaining}
                                                                value={state.quantityToReceive || remaining}
                                                                onChange={(e) => {
                                                                    const value = parseInt(e.target.value) || 0;
                                                                    updateItemQuantity(item.id, value);
                                                                }}
                                                                className="h-8 text-right"
                                                                disabled={isFullyReceived || receiveItemMutation.isPending}
                                                            />
                                                        </TableCell>
                                                        <TableCell>
                                                            <Button
                                                                size="sm"
                                                                onClick={() => handleReceiveItem(item)}
                                                                disabled={
                                                                    isFullyReceived ||
                                                                    !state.quantityToReceive ||
                                                                    state.quantityToReceive <= 0 ||
                                                                    state.quantityToReceive > remaining ||
                                                                    receiveItemMutation.isPending
                                                                }
                                                                className="h-8"
                                                            >
                                                                {receiveItemMutation.isPending ? (
                                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                                ) : (
                                                                    "Receive"
                                                                )}
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>

                                {/* Global Notes */}
                                <div className="space-y-2">
                                    <Label htmlFor="global-notes">Notes (optional)</Label>
                                    <Textarea
                                        id="global-notes"
                                        placeholder="Add notes for this receiving session..."
                                        value={globalNotes}
                                        onChange={(e) => setGlobalNotes(e.target.value)}
                                        rows={3}
                                        className="resize-none"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="px-6 py-4 border-t bg-muted">
                        <div className="flex items-center justify-between w-full">
                            <Button variant="outline" onClick={() => setIsOpen(false)}>
                                Close
                            </Button>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="secondary"
                                    onClick={handleReceiveAll}
                                    disabled={
                                        unreceivedItems.length === 0 ||
                                        totalToReceive === 0 ||
                                        receiveItemMutation.isPending
                                    }
                                >
                                    <Package className="w-4 h-4 mr-2" />
                                    Receive All ({totalToReceive})
                                </Button>
                            </div>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
