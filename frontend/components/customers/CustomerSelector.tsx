"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2, User } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

interface CustomerSelectorProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
onSelect: (customer: any) => void;
selectedCustomerId ?: number;
placeholder ?: string;
}

export function CustomerSelector({ onSelect, selectedCustomerId, placeholder = "Search and select a customer..." }: CustomerSelectorProps) {
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(searchQuery);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const { data, isLoading } = useQuery({
        queryKey: ["customers-search", debouncedQuery],
        queryFn: () => customersApi.list({
            search: debouncedQuery,
            page_size: 10,
            status: 'active'
        }),
        enabled: open,
    });

    const customers = data?.results || [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleSelect = (customer: any) => {
        onSelect(customer);
        setOpen(false);
        setSearchQuery("");
    };

    // Find selected customer details if we have an ID
    const { data: selectedCustomer } = useQuery({
        queryKey: ["customer", selectedCustomerId],
        queryFn: () => customersApi.get(selectedCustomerId!),
        enabled: !!selectedCustomerId,
    });

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between font-normal text-left h-auto min-h-11 py-2 px-3 border-border"
                >
                    {selectedCustomer ? (
                        <div className="flex flex-col items-start overflow-hidden">
                            <span className="font-medium truncate w-full">
                                {selectedCustomer.full_name || selectedCustomer.company_name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {selectedCustomer.customer_number} • {selectedCustomer.phone}
                            </span>
                        </div>
                    ) : (
                        <span className="text-muted-foreground">{placeholder}</span>
                    )}
                    <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] sm:w-[500px] p-0 shadow-lg border-border" align="start">
                <div className="flex items-center border-b px-3 bg-muted/30">
                    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50 text-muted-foreground" />
                    <Input
                        placeholder="Search by name, phone, or customer number..."
                        className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground border-none shadow-none focus-visible:ring-0"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                    />
                </div>
                <div className="max-h-[350px] overflow-y-auto p-2">
                    {isLoading ? (
                        <div className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center">
                            <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" /> Searching customers...
                        </div>
                    ) : customers.length === 0 ? (
                        <div className="p-8 text-center text-sm text-muted-foreground">
                            {searchQuery ? "No customers found matching your search." : "Type to search for customers."}
                        </div>
                    ) : (
                        <div className="space-y-1">
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            {customers.map((customer: any) => (
                                <div
                                    key={customer.id}
                                    onClick={() => handleSelect(customer)}
                                    className={cn(
                                        "flex items-center gap-3 cursor-pointer rounded-lg px-3 py-2.5 text-sm transition-colors",
                                        "hover:bg-primary/5 hover:text-primary",
                                        selectedCustomerId === customer.id ? "bg-primary/10 text-primary font-medium border border-primary/20" : "text-foreground"
                                    )}
                                >
                                    <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                                        <User className="w-4 h-4 text-muted-foreground" />
                                    </div>
                                    <div className="flex-1 overflow-hidden">
                                        <div className="flex justify-between items-center mb-0.5">
                                            <span className="font-semibold truncate">{customer.full_name || customer.company_name}</span>
                                            <Badge variant="outline" className="text-[10px] font-mono h-4 px-1.5 opacity-70">
                                                {customer.customer_number}
                                            </Badge>
                                        </div>
                                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                                            <span>{customer.phone || "No phone"}</span>
                                            <span>•</span>
                                            <span className="truncate">{customer.email || "No email"}</span>
                                        </div>
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
