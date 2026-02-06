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
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { inventoryApi, Part } from "@/lib/api/inventory";
import { ChevronsUpDown, Check } from "lucide-react";

// Debounce hook for search
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState(value);
    React.useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);
    return debouncedValue;
}

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
                return { color: "text-yellow-600 bg-warning/10", icon: Clock };
            case "ordered":
                return { color: "text-primary bg-primary/10", icon: Package };
            case "received":
                return { color: "text-success bg-success/10", icon: CheckCircle };
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

            // Force refresh of notifications to ensure sound plays immediately
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
            queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] });

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
            <Card className="border-none shadow-sm bg-muted/50">
                <CardHeader className="flex flex-row items-center justify-between pb-3 border-b bg-muted/50">
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
                                className="h-8 bg-primary hover:bg-primary/90 text-white"
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
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                        </div>
                    ) : parts.length === 0 ? (
                        <div className="text-center py-16">
                            <Package className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                            <h3 className="text-sm font-medium text-foreground mb-1">No parts requested</h3>
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
                                <TableRow className="border-b border-border">
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
                                        <TableRow key={part.id} className="group border-border">
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
                                                            className="h-8 w-8 p-0 text-gray-400 hover:text-primary"
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
    const queryClient = useQueryClient();
    const [formData, setFormData] = useState({
        part_name: "",
        part_number: "",
        quantity: 1,
        description: "",
        inventory_part: undefined as number | undefined,
    });

    const [queuedParts, setQueuedParts] = useState<any[]>([]);

    const [openCombobox, setOpenCombobox] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const debouncedSearch = useDebounce(searchTerm, 300);
    const [foundParts, setFoundParts] = useState<Part[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // Search inventory effect
    React.useEffect(() => {
        const searchInventory = async () => {
            if (!debouncedSearch || debouncedSearch.length < 2) {
                setFoundParts([]);
                return;
            }
            setIsSearching(true);
            try {
                const response = await inventoryApi.list({ search: debouncedSearch });
                setFoundParts(response.results);
            } catch (error) {
                console.error("Failed to search inventory", error);
            } finally {
                setIsSearching(false);
            }
        };
        searchInventory();
    }, [debouncedSearch]);

    React.useEffect(() => {
        if (initialData) {
            setFormData({
                part_name: initialData.part_name,
                part_number: initialData.part_number || "",
                quantity: typeof initialData.quantity === 'number' ? initialData.quantity : parseFloat(initialData.quantity as any),
                description: initialData.description || "",
                inventory_part: (initialData as any).inventory_part,
            });
            // If editing an existing part, we might not want to prepopulate search unless it's linked
            if ((initialData as any).inventory_part_details) {
                setSearchTerm((initialData as any).inventory_part_details.name);
            }
        } else {
            setFormData({ part_name: "", part_number: "", quantity: 1, description: "", inventory_part: undefined });
            setSearchTerm("");
        }
    }, [initialData, open]);

    const mutation = useMutation({
        mutationFn: async (data: any) => {
            // Check if we are doing bulk submit
            if (!initialData && queuedParts.length > 0) {
                // Bulk create
                const itemsToCreate = [...queuedParts];
                if (data.part_name) {
                    itemsToCreate.push(data);
                }

                // Create all sequentially or parallel
                const promises = itemsToCreate.map(item => {
                    const payload = { ...item, work_order: workOrderId, status: 'draft' };
                    return workordersApi.parts.create(payload);
                });

                return Promise.all(promises);
            }

            const payload = { ...data, work_order: workOrderId, status: 'draft' };
            if (initialData) {
                return workordersApi.parts.update(initialData.id, payload);
            }
            return workordersApi.parts.create(payload);
        },
        onSuccess: () => {
            // Invalidate notifications query to force immediate sound check
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
            queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] });

            toast({
                title: initialData ? "Part updated" : "Parts requested",
                description: initialData ? undefined : `${queuedParts.length + (formData.part_name ? 1 : 0)} items added to work order.`,
                variant: "default"
            });
            setQueuedParts([]);
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

    const handleAddToQueue = () => {
        if (!formData.part_name || !formData.quantity) return;
        setQueuedParts([...queuedParts, { ...formData }]);
        // Reset form but keep quantity 1
        setFormData({
            part_name: "",
            part_number: "",
            quantity: 1,
            description: "",
            inventory_part: undefined
        });
        setSearchTerm("");
    };

    const handleRemoveFromQueue = (index: number) => {
        const newQueue = [...queuedParts];
        newQueue.splice(index, 1);
        setQueuedParts(newQueue);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // If queue has items, allow submit even if form is empty
        if (queuedParts.length === 0 && !formData.part_name) return;
        mutation.mutate(formData);
    };

    const handleSelectPart = (part: Part) => {
        setFormData({
            ...formData,
            part_name: part.name,
            part_number: part.part_number,
            description: part.description || "",
            inventory_part: part.id,
        });
        setOpenCombobox(false);
        setSearchTerm(""); // Clear search to avoid confusion, or keep it?
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl bg-card border border-border shadow-xl sm:rounded-xl">
                <DialogHeader className="pb-2 border-b">
                    <DialogTitle className="text-lg">{initialData ? "Edit Part Request" : "Request Part"}</DialogTitle>
                    <DialogDescription className="text-xs text-gray-500">
                        {initialData ? "Update details for this part request." : "Select from inventory or enter details manually."}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    {/* Items Queue List (Only for new requests) */}
                    {!initialData && queuedParts.length > 0 && (
                        <div className="rounded-md border border-border bg-gray-50/50 dark:bg-gray-800/20 overflow-hidden">
                            <div className="px-3 py-2 border-b border-border bg-gray-100/50 dark:bg-gray-800/50 flex justify-between items-center">
                                <span className="text-xs font-semibold text-card-foreground">Parts to Submit ({queuedParts.length})</span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-[10px] text-red-500 hover:text-red-600 hover:bg-red-50"
                                    onClick={() => setQueuedParts([])}
                                >
                                    Clear All
                                </Button>
                            </div>
                            <div className="max-h-[150px] overflow-y-auto">
                                <table className="w-full text-xs text-left">
                                    <thead className="text-gray-500 bg-muted sticky top-0">
                                        <tr>
                                            <th className="px-3 py-2 font-medium">Name</th>
                                            <th className="px-3 py-2 font-medium">Qty</th>
                                            <th className="px-3 py-2 font-medium w-[40px]"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {queuedParts.map((item, idx) => (
                                            <tr key={idx} className="group hover:bg-white dark:hover:bg-gray-800/50">
                                                <td className="px-3 py-2">
                                                    <div className="font-medium text-foreground">{item.part_name}</div>
                                                    <div className="text-[10px] text-gray-500 truncate max-w-[200px]">{item.description}</div>
                                                </td>
                                                <td className="px-3 py-2 text-gray-600">{item.quantity}</td>
                                                <td className="px-3 py-2 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveFromQueue(idx)}
                                                        className="text-gray-400 hover:text-red-500 transition-colors"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Top Section: Inventory Search & Basic Info */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Left Column: Inventory Search (if new) or Name */}
                            <div className="space-y-3">
                                {!initialData && (
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-gray-700">Search Inventory</Label>
                                        <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    role="combobox"
                                                    aria-expanded={openCombobox}
                                                    className="w-full justify-between h-9 text-sm"
                                                >
                                                    {formData.inventory_part
                                                        ? "Item Selected"
                                                        : "Search parts..."}
                                                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-[300px] p-0" align="start">
                                                <div className="flex items-center border-b px-3">
                                                    <Search className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                                                    <Input
                                                        className="flex h-9 w-full rounded-md bg-transparent py-2 text-xs outline-none placeholder:text-muted-foreground border-none shadow-none focus-visible:ring-0"
                                                        placeholder="Type to search..."
                                                        value={searchTerm}
                                                        onChange={(e) => setSearchTerm(e.target.value)}
                                                    />
                                                </div>
                                                <div className="max-h-[200px] overflow-y-auto p-1">
                                                    {isSearching && (
                                                        <div className="py-4 text-center text-xs text-muted-foreground">Searching...</div>
                                                    )}
                                                    {!isSearching && foundParts.length === 0 && searchTerm.length >= 2 && (
                                                        <div className="py-4 text-center text-xs text-muted-foreground">No parts found.</div>
                                                    )}
                                                    {!isSearching && foundParts.length === 0 && searchTerm.length < 2 && (
                                                        <div className="py-4 text-center text-xs text-muted-foreground">Type 2+ chars</div>
                                                    )}

                                                    {!isSearching && foundParts.map((part) => (
                                                        <div
                                                            key={part.id}
                                                            className="flex flex-col cursor-pointer rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
                                                            onClick={() => handleSelectPart(part)}
                                                        >
                                                            <div className="font-medium truncate">{part.name}</div>
                                                            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                                                                <span>#{part.part_number}</span>
                                                                <span>Qty: {part.quantity_in_stock}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <Label htmlFor="part_name" className="text-xs font-semibold text-gray-700">Part Name <span className="text-red-500">*</span></Label>
                                    <Input
                                        id="part_name"
                                        className="h-9 text-sm"
                                        placeholder="e.g. Oil Filter"
                                        value={formData.part_name}
                                        onChange={(e) => setFormData({ ...formData, part_name: e.target.value })}
                                        required={!(!initialData && queuedParts.length > 0 && !formData.part_name)}
                                    />
                                </div>
                            </div>

                            {/* Right Column: Qty & Part Number */}
                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="quantity" className="text-xs font-semibold text-gray-700">Qty <span className="text-red-500">*</span></Label>
                                        <Input
                                            id="quantity"
                                            type="number"
                                            min="1"
                                            className="h-9 text-sm"
                                            value={formData.quantity}
                                            onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                                            required
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="part_number" className="text-xs font-semibold text-gray-700">Part No.</Label>
                                        <Input
                                            id="part_number"
                                            className="h-9 text-sm"
                                            placeholder="Optional"
                                            value={formData.part_number}
                                            onChange={(e) => setFormData({ ...formData, part_number: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Full Width: Description */}
                        <div className="space-y-1.5">
                            <Label htmlFor="description" className="text-xs font-semibold text-gray-700">Description / Notes</Label>
                            <Input
                                id="description"
                                className="h-9 text-sm"
                                placeholder="Additional details, brands, etc."
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            />
                        </div>

                        <DialogFooter className="pt-2 border-t mt-4 flex justify-between items-center sm:justify-between">
                            <div className="flex gap-2">
                                {!initialData && (
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={handleAddToQueue}
                                        disabled={!formData.part_name}
                                        className="border-dashed border-gray-300 dark:border-gray-700"
                                    >
                                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                                        Add to List
                                    </Button>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
                                <Button
                                    type="submit"
                                    size="sm"
                                    disabled={mutation.isPending || (queuedParts.length === 0 && !formData.part_name)}
                                    className="bg-primary hover:bg-primary/90"
                                >
                                    {mutation.isPending ? "Saving..." : (
                                        initialData ? "Update Part" : (queuedParts.length > 0 ? `Submit All (${queuedParts.length + (formData.part_name ? 1 : 0)})` : "Request Part")
                                    )}
                                </Button>
                            </div>
                        </DialogFooter>
                    </form>
                </div>
            </DialogContent>
        </Dialog>
    );
}
