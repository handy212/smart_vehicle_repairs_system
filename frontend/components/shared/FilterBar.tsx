"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, Filter } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useState, useEffect } from "react";
import { useDebounce } from "@/lib/hooks/useDebounce"; // Ensure this hook exists or inline it

interface FilterBarProps {
    onSearch: (value: string) => void;
    placeholder?: string;
    className?: string;
    filters?: React.ReactNode; // Extra filter inputs like selects or dates
    onClear?: () => void;
}

export function FilterBar({ onSearch, placeholder = "Search...", className, filters, onClear }: FilterBarProps) {
    const [searchTerm, setSearchTerm] = useState("");

    // Debounce search input
    useEffect(() => {
        const handler = setTimeout(() => {
            onSearch(searchTerm);
        }, 300);

        return () => {
            clearTimeout(handler);
        };
    }, [searchTerm, onSearch]);

    const handleClear = () => {
        setSearchTerm("");
        if (onClear) onClear();
    };

    return (
        <Card className={cn("border-none shadow-sm bg-muted/50 bg-muted/50 mb-4", className)}>
            <CardContent className="p-3 flex flex-col sm:flex-row gap-3 items-center">
                <div className="relative w-full sm:max-w-xs">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder={placeholder}
                        className="pl-9 h-9 bg-card border-border transition-all focus:w-full sm:focus:w-80"
                    />
                    {searchTerm && (
                        <button
                            onClick={handleClear}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-red-500"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {filters && (
                    <div className="flex-1 flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 w-full">
                        {/* Divider for visual separation */}
                        <div className="h-6 w-px bg-muted hidden sm:block mx-1" />
                        {filters}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
