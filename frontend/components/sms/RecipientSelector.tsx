'use client';

import React, { useState, useEffect, useRef } from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Search, User, Phone, Plus, Check, Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Badge } from '@/components/ui/badge';

interface RecipientSelectorProps {

    customers: any[]; // Using any[] to accept the customers list from parent
    onSelect: (recipient: { type: 'user' | 'phone'; value: string; name: string }) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}

export function RecipientSelector({ customers, onSelect, placeholder, className, disabled }: RecipientSelectorProps) {
    const [search, setSearch] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Filter customers
    const filteredCustomers = React.useMemo(() => {
        if (!search) return [];
        const query = search.toLowerCase();
        return customers.filter(c =>
            (c.full_name && c.full_name.toLowerCase().includes(query)) ||
            (c.company_name && c.company_name.toLowerCase().includes(query)) ||
            (c.phone && c.phone.includes(query)) ||
            (c.email && c.email.toLowerCase().includes(query)) ||
            (c.first_name && c.first_name.toLowerCase().includes(query)) || // Fallback
            (c.last_name && c.last_name.toLowerCase().includes(query))
        ).slice(0, 5); // Limit to 5 suggestions
    }, [customers, search]);

    // Check if search is valid phone
    const isValidPhone = React.useMemo(() => {
        return /^[+]?[\d\s]+$/.test(search) && search.length >= 10;
    }, [search]);

    // Handle outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);


    const getCustomerName = (c: any) => {
        if (c.company_name) return c.company_name;
        if (c.full_name) return c.full_name;
        return `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown';
    };


    const handleSelectCustomer = (customer: any) => {
        const name = getCustomerName(customer);
        if (customer.phone) {
            onSelect({
                type: 'user',
                value: customer.id.toString(),
                name: `${name} (${customer.phone})`
            });
            setSearch('');
            setIsOpen(false);
        }
    };

    const handleAddRawPhone = () => {
        if (isValidPhone) {
            onSelect({
                type: 'phone',
                value: search.trim(),
                name: search.trim()
            });
            setSearch('');
            setIsOpen(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            // If we have filtered customers, select the first one
            if (filteredCustomers.length > 0) {
                handleSelectCustomer(filteredCustomers[0]);
            } else if (isValidPhone) {
                // Otherwise if valid phone, add it
                handleAddRawPhone();
            }
        }
    };

    return (
        <div className={cn("relative", className)} ref={containerRef}>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder || "Search customer or type phone..."}
                    className="pl-9 h-9 text-sm"
                    disabled={disabled}
                />
                {search && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0 hover:bg-transparent"
                        onClick={() => {
                            setSearch('');
                            setIsOpen(false);
                        }}
                    >
                        <span className="sr-only">Clear</span>
                        <X className="h-3 w-3 text-muted-foreground" />
                    </Button>
                )}
            </div>

            {isOpen && search && (
                <div className="absolute z-50 w-full mt-1 bg-card bg-background text-foreground rounded-md border border-border shadow-lg animate-in fade-in-0 zoom-in-95">
                    <ScrollArea className="max-h-[300px]">
                        <div className="p-1 space-y-1">
                            // Raw Phone Option
                            {isValidPhone && (
                                <button
                                    className="w-full flex items-center gap-2 p-2 rounded-sm cursor-pointer hover:bg-accent hover:text-accent-foreground text-left text-sm"
                                    onClick={handleAddRawPhone}
                                >
                                    <div className="h-7 w-7 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-primary">
                                        <Plus className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <p className="font-medium">Add "{search}"</p>
                                        <p className="text-xs text-muted-foreground">as manual phone number</p>
                                    </div>
                                </button>
                            )}

                            // Divider if both exist
                            {isValidPhone && filteredCustomers.length > 0 && (
                                <div className="h-px bg-border mx-2 my-1" />
                            )}

                            // Customer Matches
                            {filteredCustomers.length > 0 && (
                                <>
                                    <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                        Customers
                                    </div>
                                    {filteredCustomers.map(c => (
                                        <button
                                            key={c.id}
                                            className="w-full flex items-center gap-2 p-2 rounded-sm cursor-pointer hover:bg-accent hover:text-accent-foreground text-left text-sm"
                                            onClick={() => handleSelectCustomer(c)}
                                        >
                                            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                                <User className="h-4 w-4" />
                                            </div>
                                            <div className="flex-1 overflow-hidden">
                                                <p className="font-medium truncate">{getCustomerName(c)}</p>
                                                <p className="text-xs text-muted-foreground truncate">{c.phone}</p>
                                            </div>
                                        </button>
                                    ))}
                                </>
                            )}

                            // No Results
                            {!isValidPhone && filteredCustomers.length === 0 && (
                                <div className="p-4 text-center text-sm text-muted-foreground">
                                    No customers found. <br />
                                    <span className="text-xs">Type a valid phone number to add manually.</span>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </div>
            )}
        </div>
    );
}
