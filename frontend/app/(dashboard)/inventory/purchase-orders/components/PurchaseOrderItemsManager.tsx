
"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryApi, PurchaseOrder, PurchaseOrderItem } from "@/lib/api/inventory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/lib/hooks/useToast";
import { Trash2, Plus, Search, DollarSign, Package, Pencil, CheckCircle, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

import { useCurrency } from "@/lib/hooks/useCurrency";
import { getApiErrorMessage } from "@/lib/api/errors";
interface PurchaseOrderItemsManagerProps {
    purchaseOrder: PurchaseOrder;
}

type OrderablePart = {
    id: number;
    name: string;
    part_number: string;
    category_name?: string;
    cost_price?: string;
    quantity_in_stock: number;
};

type PurchaseOrderItemPayload = Pick<PurchaseOrderItem, "part" | "quantity"> &
    Partial<Pick<PurchaseOrderItem, "unit_cost">>;

export default function PurchaseOrderItemsManager({ purchaseOrder }: PurchaseOrderItemsManagerProps) {
    const { formatCurrency } = useCurrency();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<OrderablePart[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [editingItemId, setEditingItemId] = useState<number | null>(null);
    const [editQuantity, setEditQuantity] = useState(1);
    const [editUnitCost, setEditUnitCost] = useState("");

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
        mutationFn: (itemData: PurchaseOrderItemPayload) =>
            inventoryApi.addPurchaseOrderItem(purchaseOrder.id, itemData),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["purchase-order", purchaseOrder.id] });
            toast({ title: "Success", description: "Item added successfully" });
            setSearchQuery("");
            setSearchResults([]);
        },

        onError: (error: unknown) => {
            toast({
                title: "Error",
                description: getApiErrorMessage(error, "Failed to add item"),
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

        onError: (error: unknown) => {
            toast({
                title: "Error",
                description: getApiErrorMessage(error, "Failed to remove item"),
                variant: "destructive",
            });
        },
    });

    const updateItemMutation = useMutation({
        mutationFn: ({ itemId, data }: { itemId: number; data: Partial<PurchaseOrderItem> }) =>
            inventoryApi.updatePurchaseOrderItem(purchaseOrder.id, itemId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["purchase-order", purchaseOrder.id] });
            toast({ title: "Success", description: "Item updated successfully" });
            setEditingItemId(null);
        },

        onError: (error: unknown) => {
            toast({
                title: "Error",
                description: getApiErrorMessage(error, "Failed to update item"),
                variant: "destructive",
            });
        },
    });

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center px-1">
                <h3 className="text-lg font-bold text-foreground tracking-tight">Order Items</h3>
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
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                <Input
                                    placeholder="Search by part name, number, or description..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                    className="pl-9 bg-muted focus:bg-card transition-colors"
                                    autoFocus
                                />
                                <div className="absolute right-2 top-1.5">
                                    <Button size="sm" onClick={handleSearch} disabled={isSearching} className="h-7 px-3 text-xs">
                                        {isSearching ? "Searching..." : "Search"}
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto bg-muted/30 p-4">
                            {searchResults.length === 0 && !isSearching && !searchQuery && (
                                <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
                                    <Package className="w-12 h-12 mb-3 opacity-20" />
                                    <p className="text-sm font-medium">Search for parts to add to the purchase order</p>
                                </div>
                            )}

                            {searchResults.length === 0 && !isSearching && searchQuery && (
                                <div className="text-center py-12 text-muted-foreground">
                                    No parts found matching &quot;{searchQuery}&quot;
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
                        <div className="p-4 border-t bg-muted flex justify-end">
                            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Done</Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="border rounded-md shadow-sm bg-card overflow-hidden">
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow className="hover:bg-transparent border-border">
                            <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4">Part Details</TableHead>
                            <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4 text-right">Qty</TableHead>
                            <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4 text-right">Unit Cost</TableHead>
                            <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4 text-right">Total</TableHead>
                            <TableHead className="h-10 w-[50px] px-2"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {!purchaseOrder.items || purchaseOrder.items.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
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
                                <TableRow key={item.id} className="group hover:bg-muted/80 transition-colors border-b border-border last:border-0">
                                    <TableCell className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="h-9 w-9 rounded-lg bg-border flex items-center justify-center text-muted-foreground shrink-0 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                                <Package className="h-5 w-5" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <span className="text-sm font-semibold text-foreground truncate">
                                                        {item.part_name || (typeof item.part === 'object' ? item.part.name : '-')}
                                                    </span>

                                                    {typeof item.part === 'object' && item.part.category_name && (
                                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal bg-muted border-border">

                                                            {item.part.category_name}
                                                        </Badge>
                                                    )}
                                                </div>
                                                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                                                    {item.part_number || (typeof item.part === 'object' ? item.part.part_number : '-')}
                                                </span>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="px-4 py-3 text-right text-sm text-foreground font-semibold">
                                        {editingItemId === item.id ? (
                                            <Input
                                                type="number"
                                                min="1"
                                                value={editQuantity}
                                                onChange={(e) => setEditQuantity(parseInt(e.target.value) || 1)}
                                                className="h-8 w-20 text-right"
                                                autoFocus
                                            />
                                        ) : (
                                            item.quantity
                                        )}
                                    </TableCell>
                                    <TableCell className="px-4 py-3 text-right text-sm text-muted-foreground">
                                        {editingItemId === item.id ? (
                                            <Input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={editUnitCost}
                                                onChange={(e) => setEditUnitCost(e.target.value)}
                                                onFocus={(e) => e.target.select()}
                                                className="h-8 w-24 text-right"
                                            />
                                        ) : (
                                            formatCurrency(parseFloat(item.unit_cost || "0"))
                                        )}
                                    </TableCell>
                                    <TableCell className="px-4 py-3 text-right text-sm font-bold text-foreground dark:text-gray-50">
                                        {formatCurrency(parseFloat(item.total || "0"))}
                                    </TableCell>
                                    <TableCell className="px-2 py-2 text-right">
                                        <div className="flex items-center justify-end gap-1 transition-opacity">
                                            {editingItemId === item.id ? (
                                                <>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 w-7 p-0 text-success hover:text-green-700 hover:bg-success/10"
                                                        onClick={() => {
                                                            updateItemMutation.mutate({
                                                                itemId: item.id,
                                                                data: {
                                                                    quantity: editQuantity,
                                                                    unit_cost: (parseFloat(editUnitCost) || 0).toString(),
                                                                },
                                                            });
                                                        }}
                                                    >
                                                        <CheckCircle className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 w-7 p-0 text-muted-foreground hover:text-muted-foreground hover:bg-muted"
                                                        onClick={() => setEditingItemId(null)}
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </Button>
                                                </>
                                            ) : (
                                                <>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 w-7 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                                        onClick={() => {
                                                            setEditingItemId(item.id);
                                                            setEditQuantity(item.quantity);
                                                            setEditUnitCost(item.unit_cost || "");
                                                        }}
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                        onClick={() => removeItemMutation.mutate(item.id)}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                        {purchaseOrder.items && purchaseOrder.items.length > 0 && (
                            <TableRow className="hover:bg-transparent border-t border-border">
                                <TableCell colSpan={5} className="p-0">
                                    <Button
                                        variant="ghost"
                                        className="w-full h-12 rounded-none text-primary hover:text-primary hover:bg-primary/5 flex items-center justify-center gap-2 text-sm font-medium transition-colors"
                                        onClick={() => setIsAddDialogOpen(true)}
                                    >
                                        <Plus className="w-4 h-4" />
                                        Add Another Item
                                    </Button>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}


function SearchResultItem({
    part,
    onAdd,
    isAdding
}: {
    part: OrderablePart;
    onAdd: (data: PurchaseOrderItemPayload) => void;
    isAdding: boolean;
}) {
    const { formatCurrency } = useCurrency();
    const [isExpanded, setIsExpanded] = useState(false);
    const [quantity, setQuantity] = useState(1);
    const [unitCost, setUnitCost] = useState(part.cost_price || "");
    const [isAdded, setIsAdded] = useState(false);

    const handleAdd = () => {
        onAdd({
            part: part.id,
            quantity: quantity,
            unit_cost: unitCost?.toString()
        });
        setIsAdded(true);
        setTimeout(() => setIsAdded(false), 2000); // Reset "Added" state after 2s
        setIsExpanded(false);
    };

    return (
        <div className={`bg-card border rounded-lg transition-all ${isExpanded ? 'ring-2 ring-primary border-primary shadow-md' : 'hover:border-orange-300'}`}>
            <div
                className="flex justify-between items-center p-3 cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                        <Package className="h-5 w-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h4 className="font-medium text-sm text-foreground">{part.name}</h4>
                            {isAdded && <Badge className="bg-green-100 text-green-700 border-green-200 h-5 text-[10px] shadow-none">Added</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">{part.part_number}</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                        <p className="text-sm font-semibold text-foreground">{formatCurrency(parseFloat(part.cost_price || "0"))}</p>
                        <p className="text-xs text-muted-foreground">{part.quantity_in_stock} in stock</p>
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
                <div className="p-3 border-t bg-muted/50 flex flex-col sm:flex-row gap-3 items-end sm:items-center animate-in slide-in-from-top-2 duration-200">
                    <div className="flex-1 grid grid-cols-2 gap-3 w-full sm:w-auto">
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-muted-foreground">Qty</label>
                            <Input
                                type="number"
                                min="1"
                                value={quantity}
                                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                                className="h-8 bg-card"
                                autoFocus
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-muted-foreground">Cost</label>
                            <div className="relative">
                                <DollarSign className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={unitCost}
                                    onChange={(e) => setUnitCost(e.target.value)}
                                    className="h-8 pl-7 bg-card"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto pt-2 sm:pt-0">
                        <div className="flex-1 sm:hidden text-sm font-medium text-foreground">
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
