"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api/inventory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { useToast } from "@/lib/hooks/useToast";
import { Loader2, ArrowLeft, CheckCircle, Truck, PackageCheck, AlertCircle } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

export default function TransferDetailPage() {
    const params = useParams();
    const id = parseInt(params.id as string);
    const router = useRouter();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [receiveQuantities, setReceiveQuantities] = useState<Record<number, number>>({});

    const { data: transfer, isLoading, error } = useQuery({
        queryKey: ["transfer", id],
        queryFn: () => inventoryApi.getTransfer(id),
    });

    const approveMutation = useMutation({
        mutationFn: () => inventoryApi.approveTransfer(id),
        onSuccess: () => {
            toast({ title: "Approved", description: "Transfer has been approved." });
            queryClient.invalidateQueries({ queryKey: ["transfer", id] });
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });

    const shipMutation = useMutation({
        mutationFn: () => inventoryApi.shipTransfer(id),
        onSuccess: () => {
            toast({ title: "Shipped", description: "Transfer marked as shipped." });
            queryClient.invalidateQueries({ queryKey: ["transfer", id] });
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });

    const receiveMutation = useMutation({
        mutationFn: (items: Record<number, number>) => inventoryApi.receiveTransfer(id, items),
        onSuccess: () => {
            toast({ title: "Received", description: "Transfer items received." });
            queryClient.invalidateQueries({ queryKey: ["transfer", id] });
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });

    if (isLoading) return <div className="p-8"><Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" /></div>;
    if (error || !transfer) return <div className="p-8 text-center text-red-500">Error loading transfer</div>;

    const getStatusColor = (status: string) => {
        switch (status) {
            case "draft": return "gray";
            case "requested": return "yellow";
            case "approved": return "blue";
            case "in_transit": return "indigo";
            case "received": return "green";
            case "rejected": return "red";
            case "cancelled": return "gray";
            default: return "gray";
        }
    };

    const handleReceiveChange = (itemId: number, qty: number) => {
        setReceiveQuantities(prev => ({ ...prev, [itemId]: qty }));
    };

    const handleReceiveSubmit = () => {
        // Default to full quantity if not specified
        const itemsToReceive: Record<number, number> = {};
        transfer.items.forEach(item => {
            const qty = receiveQuantities[item.part] !== undefined ? receiveQuantities[item.part] : item.quantity_sent;
            itemsToReceive[item.part] = qty;
        });
        receiveMutation.mutate(itemsToReceive);
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <Link href="/inventory/transfers">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="w-4 h-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            Transfer {transfer.transfer_number}
                            <Badge variant="outline" className={`bg-${getStatusColor(transfer.status)}-50 text-${getStatusColor(transfer.status)}-700 border-${getStatusColor(transfer.status)}-200 capitalize`}>
                                {transfer.status.replace("_", " ")}
                            </Badge>
                        </h1>
                    </div>
                </div>
                <div className="flex gap-2">
                    {transfer.status === 'requested' && (
                        <Button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
                            {approveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            <CheckCircle className="w-4 h-4 mr-2" /> Approve
                        </Button>
                    )}
                    {transfer.status === 'approved' && (
                        <Button onClick={() => shipMutation.mutate()} disabled={shipMutation.isPending}>
                            {shipMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            <Truck className="w-4 h-4 mr-2" /> Ship
                        </Button>
                    )}
                    {transfer.status === 'in_transit' && (
                        <Button onClick={handleReceiveSubmit} disabled={receiveMutation.isPending} className="bg-green-600 hover:bg-green-700">
                            {receiveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            <PackageCheck className="w-4 h-4 mr-2" /> Receive
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader><CardTitle className="text-sm font-medium text-gray-500 uppercase">From</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-lg font-bold">{transfer.source_branch_name}</div>
                        <div className="text-sm text-gray-500 mt-1">Request Date: {format(new Date(transfer.requested_date), "PPP")}</div>
                        <div className="text-sm text-gray-500">Created By: {transfer.created_by_name}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle className="text-sm font-medium text-gray-500 uppercase">To</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-lg font-bold">{transfer.destination_branch_name}</div>
                        <div className="text-sm text-gray-500 mt-1">
                            {transfer.received_date ? `Received: ${format(new Date(transfer.received_date), "PPP")}` : "Not received yet"}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Items</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Part</TableHead>
                                <TableHead className="text-right">Requested</TableHead>
                                <TableHead className="text-right">Sent</TableHead>
                                {transfer.status === 'in_transit' || transfer.status === 'received' ? (
                                    <TableHead className="text-right">Received</TableHead>
                                ) : null}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {transfer.items.map(item => (
                                <TableRow key={item.id}>
                                    <TableCell>
                                        <div className="font-medium">{item.part_name}</div>
                                        <div className="text-xs text-gray-500">{item.part_number}</div>
                                    </TableCell>
                                    <TableCell className="text-right">{item.quantity_requested}</TableCell>
                                    <TableCell className="text-right">{item.quantity_sent}</TableCell>
                                    {(transfer.status === 'in_transit' || transfer.status === 'received') && (
                                        <TableCell className="text-right w-32">
                                            {transfer.status === 'in_transit' ? (
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    max={item.quantity_sent}
                                                    defaultValue={item.quantity_sent}
                                                    className="h-8 w-20 ml-auto bg-gray-50"
                                                    onChange={(e) => handleReceiveChange(item.part, parseInt(e.target.value))}
                                                />
                                            ) : (
                                                item.quantity_received
                                            )}
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {transfer.notes && (
                <Card>
                    <CardHeader><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
                    <CardContent>
                        <p className="text-sm text-gray-600">{transfer.notes}</p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
