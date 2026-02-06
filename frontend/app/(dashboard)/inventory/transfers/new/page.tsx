"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { branchesApi } from "@/lib/api/branches";
import { inventoryApi } from "@/lib/api/inventory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/lib/hooks/useToast";
import { Loader2, Plus, Trash2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Combobox } from "@/components/ui/combobox";
import { PartSelector } from "@/components/inventory/PartSelector";

export default function NewTransferPage() {
    const router = useRouter();
    const { toast } = useToast();
    const [sourceBranchId, setSourceBranchId] = useState<string>("");
    const [destBranchId, setDestBranchId] = useState<string>("");
    const [notes, setNotes] = useState("");
    const [items, setItems] = useState<{ partId: number | null; quantity: number }[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Fetch Branches
    const { data: branchesData } = useQuery({
        queryKey: ["branches"],
        queryFn: () => branchesApi.list({ is_active: true }),
    });

    const branches = Array.isArray(branchesData) ? branchesData : branchesData?.results || [];

    const branchOptions = branches.map(b => ({
        value: String(b.id),
        label: `${b.name} (${b.code})`
    }));

    const handleAddItem = () => {
        setItems([...items, { partId: null, quantity: 1 }]);
    };

    const handleRemoveItem = (index: number) => {
        const newItems = [...items];
        newItems.splice(index, 1);
        setItems(newItems);
    };

    const handleItemPartChange = (index: number, partId: number) => {
        const newItems = [...items];
        newItems[index].partId = partId;
        setItems(newItems);
    };

    const handleItemQuantityChange = (index: number, quantity: number) => {
        const newItems = [...items];
        newItems[index].quantity = quantity;
        setItems(newItems);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!sourceBranchId || !destBranchId) {
            toast({ title: "Error", description: "Please select source and destination branches", variant: "destructive" });
            return;
        }

        if (sourceBranchId === destBranchId) {
            toast({ title: "Error", description: "Source and destination branches must be different", variant: "destructive" });
            return;
        }

        if (items.length === 0) {
            toast({ title: "Error", description: "Please add at least one item", variant: "destructive" });
            return;
        }

        const validItems = items.filter(i => i.partId && i.quantity > 0);
        if (validItems.length !== items.length) {
            toast({ title: "Error", description: "Please ensure all items have a part and quantity > 0", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);
        try {
            const transfer = await inventoryApi.createTransfer({
                source_branch: parseInt(sourceBranchId),
                destination_branch: parseInt(destBranchId),
                notes,
                items: validItems.map(i => ({
                    part_id: i.partId!,
                    quantity: i.quantity
                }))
            } as any);

            toast({ title: "Success", description: "Transfer created successfully" });
            router.push(`/inventory/transfers/${transfer.id}`);
        } catch (error: any) {
            toast({ title: "Error", description: error.message || "Failed to create transfer", variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">New Stock Transfer</h1>
                <Link href="/inventory/transfers">
                    <Button variant="ghost">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Transfers
                    </Button>
                </Link>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Transfer Details</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Source Branch</Label>
                                <Combobox
                                    options={branchOptions}
                                    value={sourceBranchId ? [sourceBranchId] : []}
                                    onChange={(val) => setSourceBranchId(val[0] || "")}
                                    placeholder="Select Source Branch"
                                    multiple={false}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Destination Branch</Label>
                                <Combobox
                                    options={branchOptions}
                                    value={destBranchId ? [destBranchId] : []}
                                    onChange={(val) => setDestBranchId(val[0] || "")}
                                    placeholder="Select Destination Branch"
                                    multiple={false}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Notes</Label>
                            <Textarea
                                placeholder="Optional notes about this transfer..."
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                            />
                        </div>

                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-medium">Items</h3>
                                <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
                                    <Plus className="w-4 h-4 mr-2" />
                                    Add Part
                                </Button>
                            </div>

                            {items.length === 0 && (
                                <p className="text-sm text-muted-foreground text-center py-4 bg-muted rounded border border-dashed">
                                    No items added. Click "Add Part" to begin.
                                </p>
                            )}

                            {items.map((item, index) => (
                                <div key={index} className="flex gap-4 items-end bg-muted p-3 rounded-md border">
                                    <div className="flex-1 space-y-2">
                                        <Label className="text-xs">Part</Label>
                                        <PartSelector
                                            selectedPartId={item.partId || undefined}
                                            onSelect={(part) => handleItemPartChange(index, part.id)}
                                            branchId={sourceBranchId ? parseInt(sourceBranchId) : undefined}
                                        />
                                    </div>
                                    <div className="w-32 space-y-2">
                                        <Label className="text-xs">Quantity</Label>
                                        <Input
                                            type="number"
                                            min="1"
                                            value={item.quantity}
                                            onChange={e => handleItemQuantityChange(index, parseInt(e.target.value) || 0)}
                                        />
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                        onClick={() => handleRemoveItem(index)}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-end pt-4">
                            <Button type="submit" disabled={isSubmitting} className="min-w-[150px]">
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Submitting...
                                    </>
                                ) : (
                                    "Create Transfer"
                                )}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
