"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { inventoryApi, Part } from "@/lib/api/inventory";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Search, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useCurrency } from "@/lib/hooks/useCurrency";

interface PartSelectorProps {
    onSelect: (part: Part) => void;
    selectedPartId?: number;
    branchId?: number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function PartSelector({ onSelect, selectedPartId, branchId }: PartSelectorProps) {
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    const { formatCurrency } = useCurrency();

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(searchQuery);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const { data, isLoading } = useQuery({
        queryKey: ["parts-search", debouncedQuery],
        queryFn: () => inventoryApi.list({
            search: debouncedQuery,
            page: 1,
            // If backend supports branch filtering for stock, we could pass branchId here
            // to show branch specific stock in the results if needed?
        }),
        enabled: open,
    });

    const parts = data?.results || [];

    const handleSelect = (part: Part) => {
        onSelect(part);
        setOpen(false);
        setSearchQuery("");
    };

    // Find selected part details if we have an ID but not the object (for display)
    const { data: selectedPart } = useQuery({
        queryKey: ["part", selectedPartId],
        queryFn: () => inventoryApi.get(selectedPartId!),
        enabled: !!selectedPartId,
    });

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between font-normal text-left h-auto min-h-10 py-2"
                >
                    {selectedPart ? (
                        <div className="flex flex-col items-start">
                            <span className="font-medium">{selectedPart.part_number} - {selectedPart.name}</span>
                            <span className="text-xs text-muted-foreground">In Stock: {selectedPart.quantity_in_stock}</span>
                        </div>
                    ) : (
                        <span className="text-muted-foreground">Search and select a part...</span>
                    )}
                    <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] sm:w-[400px] p-0" align="start">
                <div className="flex items-center border-b px-3">
                    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    <Input
                        placeholder="Search parts by name or number..."
                        className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground border-none shadow-none focus-visible:ring-0"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="max-h-[300px] overflow-y-auto p-1">
                    {isLoading ? (
                        <div className="p-4 text-center text-sm text-muted-foreground flex items-center justify-center">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading parts...
                        </div>
                    ) : parts.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                            No parts found.
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {parts.map((part) => (
                                <div
                                    key={part.id}
                                    onClick={() => handleSelect(part)}
                                    className={cn(
                                        "flex flex-col cursor-pointer rounded-sm px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                                        selectedPartId === part.id && "bg-accent/50"
                                    )}
                                >
                                    <div className="flex justify-between items-start">
                                        <span className="font-medium">{part.part_number}</span>
                                        <span className="text-xs font-mono">{formatCurrency(part.cost_price)}</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground truncate">{part.name}</div>
                                    <div className="text-xs text-muted-foreground mt-1 flex justify-between">
                                        <span>Stock: {part.quantity_in_stock}</span>
                                        {part.quantity_in_stock <= part.minimum_stock && (
                                            <Badge variant="outline" className="text-[10px] h-4 px-1 text-warning border-warning/20">
                                                Low Stock
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
