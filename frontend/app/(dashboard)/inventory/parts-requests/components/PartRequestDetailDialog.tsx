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
import { ShoppingCart, CheckCircle, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/lib/hooks/useToast";

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
        mutationFn: (id: number) => workordersApi.parts.order(id),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["parts-requests"] });
            onRefresh();
            toast({ title: "Purchase Order Created", description: `PO #${data.po_number}`, variant: "success" });
        },
        onError: (error: any) => {
            toast({
                title: "Order Failed",
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
            toast({
                title: "Bulk Order Created",
                description: `${data.processed} parts processed. POs: ${data.po_numbers.join(", ")}`,
                variant: "success"
            });
        },
        onError: (error: any) => {
            toast({
                title: "Bulk Order Failed",
                description: error.response?.data?.error || error.message,
                variant: "destructive",
            });
        },
    });

    if (!workOrderId || parts.length === 0) return null;

    // Identify parts eligible for bulk order
    const outOfStockParts = parts.filter(p => {
        const isReady = p.status === 'ready' || p.status === 'received' || p.status === 'ordered';
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
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl">
                <DialogHeader className="border-b pb-4 mb-0">
                    <div className="flex items-center justify-between">
                        <div>
                            <DialogTitle className="text-xl font-bold flex items-center gap-3">
                                Part Request
                                <Link href={`/workorders/${workOrderId}`} target="_blank" className="hover:opacity-80 transition-opacity">
                                    <Badge variant="outline" className="font-mono text-base font-normal text-blue-600 bg-blue-50 border-blue-200 px-2 py-0.5 flex items-center gap-1">
                                        {woNumber}
                                        <ExternalLink className="w-3 h-3" />
                                    </Badge>
                                </Link>
                            </DialogTitle>
                            <DialogDescription className="mt-1.5 text-sm text-gray-500">
                                <span className="font-medium text-gray-700 dark:text-gray-300">{customerName}</span>
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
                                <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-gray-500 pl-4">Part Details</TableHead>
                                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Part Number</TableHead>
                                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-gray-500 text-center">Qty</TableHead>
                                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-gray-500 text-right pr-4">Availability / Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {parts.map((part) => {
                                    const isReady = part.status === 'ready';
                                    const isOrdered = part.status === 'ordered';
                                    const isReceived = part.status === 'received';
                                    const inStock = part.inventory_status?.available;
                                    const stockQty = part.inventory_status?.quantity || 0;

                                    return (
                                        <TableRow key={part.id} className="group hover:bg-gray-50/50">
                                            <TableCell className="py-2.5 pl-4">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{part.part_name}</span>
                                                    {part.description && (
                                                        <span className="text-xs text-gray-500 truncate max-w-[300px]">{part.description}</span>
                                                    )}
                                                    {/* Inventory Status Badge */}
                                                    {!isReady && !isOrdered && !isReceived && part.part_number && (
                                                        <div className="mt-1">
                                                            {inStock ? (
                                                                <Badge variant="outline" className="text-[10px] h-4 px-1 bg-green-50 text-green-700 border-green-200">
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
                                            <TableCell className="py-2.5 font-mono text-xs text-gray-600">
                                                {part.part_number || <span className="text-gray-300 italic">-</span>}
                                            </TableCell>
                                            <TableCell className="py-2.5 text-center">
                                                <Badge variant="secondary" className="font-mono text-[10px] h-5 px-1.5 min-w-[24px] justify-center">
                                                    {part.quantity}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="py-2.5 text-right pr-4">
                                                {isReady || isReceived || isOrdered ? (
                                                    <Badge
                                                        variant={isReady ? 'success' : 'secondary'}
                                                        className="h-6 px-2"
                                                    >
                                                        {isReady ? 'Ready' :
                                                            isReceived ? 'Received' :
                                                                part.purchase_order_number ? `PO #${part.purchase_order_number}` : 'Ordered'}
                                                    </Badge>
                                                ) : (
                                                    <>
                                                        {inStock ? (
                                                            <Button
                                                                size="sm"
                                                                variant="default" // Primary action
                                                                className="h-7 text-xs font-medium bg-green-600 hover:bg-green-700 text-white shadow-sm"
                                                                onClick={() => allocateMutation.mutate(part.id)}
                                                                disabled={allocateMutation.isPending}
                                                            >
                                                                <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                                                                Allocate
                                                            </Button>
                                                        ) : (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-7 text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 border-indigo-200"
                                                                onClick={() => orderMutation.mutate(part.id)}
                                                                disabled={orderMutation.isPending}
                                                            >
                                                                <ShoppingCart className="w-3.5 h-3.5 mr-1.5" />
                                                                Order
                                                            </Button>
                                                        )}
                                                    </>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                <DialogFooter className="flex items-center justify-between sm:justify-between border-t pt-4 mt-2">
                    <Button variant="outline" size="sm" asChild className="text-gray-600">
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
                                Order All Out-of-Stock ({outOfStockParts.length})
                            </Button>
                        )}
                        <Button variant="default" size="sm" onClick={() => onOpenChange(false)}>
                            Done
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog >
    );
}
