"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { inventoryApi, Part } from "@/lib/api/inventory";
import { cn } from "@/lib/utils/cn"; // Assuming this exists, based on select.tsx

interface InventoryPartSearchProps {
    onSelect: (part: Part) => void;
    className?: string;
}

export default function InventoryPartSearch({ onSelect, className }: InventoryPartSearchProps) {
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Debounce search term
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Fetch parts
    const { data, isLoading } = useQuery({
        queryKey: ["inventory-parts-search", debouncedSearch],
        queryFn: () => inventoryApi.list({ search: debouncedSearch, is_active: true }),
        enabled: debouncedSearch.length > 1,
    });

    // Handle outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelect = (part: Part) => {
        onSelect(part);
        setSearchTerm("");
        setIsOpen(false);
    };

    return (
        <div ref={containerRef} className={cn("relative", className)}>
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    type="text"
                    placeholder="Search inventory parts..."
                    className="pl-9"
                    value={searchTerm}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                />
                {isLoading && (
                    <div className="absolute right-2.5 top-2.5">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                )}
            </div>

            {isOpen && debouncedSearch.length > 1 && data && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-card shadow-lg max-h-60 overflow-auto">
                    {data.results.length === 0 ? (
                        <div className="p-3 text-sm text-muted-foreground text-center">No parts found</div>
                    ) : (
                        <div className="py-1">
                            {data.results.map((part) => (
                                <button
                                    key={part.id}
                                    type="button"
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 focus:bg-gray-100 flex flex-col items-start gap-1"
                                    onClick={() => handleSelect(part)}
                                >
                                    <div className="flex justify-between w-full font-medium text-foreground">
                                        <span>{part.part_number} - {part.name}</span>
                                        <span className="text-muted-foreground">
                                            {part.available_quantity ? `${part.available_quantity} in stock` : 'Out of stock'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between w-full text-xs text-muted-foreground">
                                        <span>{part.description ? part.description.substring(0, 50) + (part.description.length > 50 ? '...' : '') : 'No description'}</span>
                                        <span>${part.selling_price || '0.00'}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
