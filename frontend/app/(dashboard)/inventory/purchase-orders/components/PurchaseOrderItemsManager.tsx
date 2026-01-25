
"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryApi, PurchaseOrder, PurchaseOrderItem } from "@/lib/api/inventory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/lib/hooks/useToast";
import { Trash2, Plus, Search, DollarSign, Package } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { useCurrency } from "@/lib/hooks/useCurrency";
interface PurchaseOrderItemsManagerProps {
    purchaseOrder: PurchaseOrder;
}

export default function PurchaseOrderItemsManager({ purchaseOrder }: PurchaseOrderItemsManagerProps) {
    const { formatCurrency } = useCurrency();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedPart, setSelectedPart] = useState<any>(null);
    const [quantity, setQuantity] = useState(1);
    const [unitCost, setUnitCost] = useState("");

    // Component manages search state locally via handleSearch
    // Fallback if hook not available, assume parent handles or we use raw api
    // Actually, let's implement the search inside the dialog using basic fetch for now since we don't have a custom hook exposed in context here easily, 
    // OR better: useQuery. But wait, we need to search parts.

    // Let's defer part search logic to a simpler implementation or reuse existing components if available.
    // For now, I will implement a simple search input that fetches parts.

    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    const handleSearch = async () => {
        if (!searchQuery) return;
        setIsSearching(true);
        try {
            const res = await inventoryApi.list({ search: searchQuery, is_active: true });
            setSearchResults(res.results || []);
        } catch (error) {
            console.error(error);
            toast({
                title: "Error",
                description: "Failed to search parts",
                variant: "destructive",
            });
        } finally {
            setIsSearching(false);
        }
    };

    const addItemMutation = useMutation({
        mutationFn: (itemData: Partial<PurchaseOrderItem>) =>
            inventoryApi.addPurchaseOrderItem(purchaseOrder.id, itemData),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["purchase-order", purchaseOrder.id] });
            toast({ title: "Success", description: "Item added successfully" });
            setIsAddDialogOpen(false);
            resetForm();
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.response?.data?.detail || "Failed to add item",
                variant: "destructive",
            });
        },
    });

    const removeItemMutation = useMutation({
        mutationFn: (itemId: number) =>
            inventoryApi.removePurchaseOrderItem(purchaseOrder.id, itemId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["purchase-order", purchaseOrder.id] });
            toast({ title: "Success", description: "Item removed successfully" });
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.response?.data?.detail || "Failed to remove item",
                variant: "destructive",
            });
        },
    });

    const resetForm = () => {
        setSelectedPart(null);
        setQuantity(1);
        setUnitCost("");
        setSearchQuery("");
        setSearchResults([]);
    }

    const handleAddItem = () => {
        if (!selectedPart) return;
        addItemMutation.mutate({
            part: selectedPart.id,
            quantity_ordered: quantity, // Note: Schema might expect 'quantity' or 'quantity_ordered' depending on create serializer. 
            // PurchaseOrderItemCreateSerializer uses 'quantity'.
            // Wait, look at PurchaseOrderItemCreateSerializer in serializers.py.
            // It uses 'quantity'. Let's check api/inventory.ts interface for PurchaseOrderItem.
            // Interface has quantity_ordered.
            // Server likely maps 'quantity' to 'quantity_ordered' or vice versa.
            // I will send BOTH or check serializer. Serializer had quantity.
            quantity: quantity,
            unit_cost: unitCost || selectedPart.cost_price,
        } as any);
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center px-1">
                <h3 className="text-lg font-bold text-gray-900 tracking-tight">Order Items</h3>
                <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
                    setIsAddDialogOpen(open);
                    if (!open) {
                        setSearchResults([]);
                        setSearchQuery("");
                    }
                }}>
                    <DialogTrigger asChild>
                        <Button size="sm">
                            <Plus className="w-4 h-4 mr-2" />
                            Add Item
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
                        <div className="p-4 border-b">
                            <DialogHeader>
                                <DialogTitle>Add Items to Order</DialogTitle>
                            </DialogHeader>
                            <div className="mt-4 relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <Input
                                    placeholder="Search by part name, number, or description..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                    className="pl-9 bg-gray-50 focus:bg-white transition-colors"
                                    autoFocus
                                />
                                <div className="absolute right-2 top-1.5">
                                    <Button size="sm" onClick={handleSearch} disabled={isSearching} className="h-7 px-3 text-xs">
                                        {isSearching ? "Searching..." : "Search"}
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto bg-gray-50/30 p-4">
                            {searchResults.length === 0 && !isSearching && !searchQuery && (
                                <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8">
                                    <Package className="w-12 h-12 mb-3 opacity-20" />
                                    <p className="text-sm font-medium">Search for parts to add to the purchase order</p>
                                </div>
                            )}

                            {searchResults.length === 0 && !isSearching && searchQuery && (
                                <div className="text-center py-12 text-gray-500">
                                    No parts found matching "{searchQuery}"
                                </div>
                            )}

                            <div className="space-y-3">
                                {searchResults.map(part => (
                                    <SearchResultItem
                                        key={part.id}
                                        part={part}
                                        onAdd={(data) => addItemMutation.mutate(data)}
                                        isAdding={addItemMutation.isPending}
                                    />
                                ))}
                            </div>
                        </div>
                        <div className="p-4 border-t bg-gray-50 flex justify-end">
                            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Done</Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="border rounded-md shadow-sm bg-white dark:bg-gray-900 overflow-hidden">
                <Table>
                    <TableHeader className="bg-gray-50/50">
                        <TableRow className="hover:bg-transparent border-gray-100">
                            <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4">Part Details</TableHead>
                            <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4 text-right">Qty</TableHead>
                            <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4 text-right">Unit Cost</TableHead>
                            <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4 text-right">Total</TableHead>
                            <TableHead className="h-10 w-[50px] px-2"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {!purchaseOrder.items || purchaseOrder.items.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-12 text-gray-500">
                                    <div className="flex flex-col items-center gap-2">
                                        <Package className="h-8 w-8 text-gray-300" />
                                        <p className="text-sm">No items in this order.</p>
                                        <Button variant="link" size="sm" onClick={() => setIsAddDialogOpen(true)} className="text-primary">
                                            Add your first item
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            purchaseOrder.items.map((item) => (
                                <TableRow key={item.id} className="group hover:bg-gray-50/80 transition-colors border-b border-gray-100 last:border-0">
                                    <TableCell className="px-4 py-2">
                                        <div>
                                            <span className="font-mono text-xs font-medium text-gray-700 dark:text-gray-300 block">
                                                {item.part_number || (typeof item.part === 'object' ? item.part.part_number : '-')}
                                            </span>
                                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                                {item.part_name || (typeof item.part === 'object' ? item.part.name : '-')}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="px-4 py-2 text-right text-sm text-gray-900 font-medium">
                                        {item.quantity_ordered}
                                    </TableCell>
                                    <TableCell className="px-4 py-2 text-right text-sm text-gray-600">
                                        ${item.unit_cost}
                                    </TableCell>
                                    <TableCell className="px-4 py-2 text-right text-sm font-bold text-gray-900">
                                        ${item.total_cost}
                                    </TableCell>
                                    <TableCell className="px-2 py-2 text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-600 hover:bg-red-50"
                                            onClick={() => removeItemMutation.mutate(item.id)}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}

function SearchResultItem({ part, onAdd, isAdding }: { part: any, onAdd: (data: any) => void, isAdding: boolean }) {
    const { formatCurrency } = useCurrency();
    const [isExpanded, setIsExpanded] = useState(false);
    const [quantity, setQuantity] = useState(1);
    const [unitCost, setUnitCost] = useState(part.cost_price || "");
    const [isAdded, setIsAdded] = useState(false);

    const handleAdd = () => {
        onAdd({
            part: part.id,
            quantity: quantity,
            quantity_ordered: quantity,
            unit_cost: unitCost || 0
        });
        setIsAdded(true);
        setTimeout(() => setIsAdded(false), 2000); // Reset "Added" state after 2s
        setIsExpanded(false);
    };

    return (
        <div className={`bg-white border rounded-lg transition-all ${isExpanded ? 'ring-2 ring-primary border-primary shadow-md' : 'hover:border-orange-300'}`}>
            <div
                className="flex justify-between items-center p-3 cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-md bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                        <Package className="h-5 w-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h4 className="font-medium text-sm text-gray-900">{part.name}</h4>
                            {isAdded && <Badge className="bg-green-100 text-green-700 border-green-200 h-5 text-[10px] shadow-none">Added</Badge>}
                        </div>
                        <p className="text-xs text-gray-500 font-mono">{part.part_number}</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                        <p className="text-sm font-semibold text-gray-900">${part.cost_price || "0.00"}</p>
                        <p className="text-xs text-gray-500">{part.quantity_in_stock} in stock</p>
                    </div>
                    <Button
                        size="sm"
                        variant={isExpanded ? "secondary" : "outline"}
                        className={isExpanded ? "bg-primary/10 text-primary" : ""}
                    >
                        {isExpanded ? "Close" : "Add"}
                    </Button>
                </div>
            </div>

            {isExpanded && (
                <div className="p-3 border-t bg-gray-50/50 flex flex-col sm:flex-row gap-3 items-end sm:items-center animate-in slide-in-from-top-2 duration-200">
                    <div className="flex-1 grid grid-cols-2 gap-3 w-full sm:w-auto">
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-gray-500">Qty</label>
                            <Input
                                type="number"
                                min="1"
                                value={quantity}
                                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                                className="h-8 bg-white"
                                autoFocus
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-gray-500">Cost</label>
                            <div className="relative">
                                <DollarSign className="absolute left-2 top-2 h-4 w-4 text-gray-400" />
                                <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={unitCost}
                                    onChange={(e) => setUnitCost(e.target.value)}
                                    className="h-8 pl-7 bg-white"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto pt-2 sm:pt-0">
                        <div className="flex-1 sm:hidden text-sm font-medium text-gray-700">
                            Total: {formatCurrency((quantity * (parseFloat(unitCost) || 0)))}
                        </div>
                        <Button size="sm" onClick={handleAdd} disabled={isAdding} className="w-full sm:w-auto">
                            {isAdding ? "Adding..." : "Add to Order"}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
