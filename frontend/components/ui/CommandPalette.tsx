"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
    Search,
    Users,
    Car,
    Wrench,
    X,
    Calendar,
    Package,
    Command as CommandIcon,
    PlusCircle,
    BarChart3,
} from "lucide-react";
import { searchApi, type SearchResult } from "@/lib/api/search";
import { cn } from "@/lib/utils/cn";


export function CommandPalette() {
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");
    const [results, setResults] = React.useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const [selectedIndex, setSelectedIndex] = React.useState(0);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const router = useRouter();


    // Combine current viewable items for keyboard navigation
    const viewableItems = React.useMemo(() => {
        if (query.trim().length > 0) return results;
        return [];
    }, [query, results]);

    React.useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((open) => !open);
            }
            if (e.key === "Escape") {
                setOpen(false);
            }
        };

        document.addEventListener("keydown", down);
        return () => document.removeEventListener("keydown", down);
    }, []);

    React.useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 10);
            setQuery("");
            setResults([]);
            setSelectedIndex(0);
        }
    }, [open]);

    React.useEffect(() => {
        const fetchResults = async () => {
            if (query.trim().length < 2) {
                setResults([]);
                setSelectedIndex(0);
                return;
            }

            setIsLoading(true);
            try {
                const data = await searchApi.global(query);
                setResults(data.results || []);
                setSelectedIndex(0);
            } catch (error) {
                console.error("Search error:", error);
            } finally {
                setIsLoading(false);
            }
        };

        const debounceTimer = setTimeout(fetchResults, 300);
        return () => clearTimeout(debounceTimer);
    }, [query]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex((prev) => (prev + 1) % (viewableItems.length || 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex((prev) => (prev - 1 + (viewableItems.length || 1)) % (viewableItems.length || 1));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (viewableItems[selectedIndex]) {
                handleSelect(viewableItems[selectedIndex]);
            }
        }
    };

    const handleSelect = (item: any) => {
        router.push(item.url);
        setOpen(false);
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 sm:px-6">
            <div
                className="fixed inset-0 bg-gray-950/40 backdrop-blur-md transition-opacity duration-500 animate-in fade-in"
                onClick={() => setOpen(false)}
            />

            <div className="relative w-full max-w-xl transform overflow-hidden rounded-2xl bg-card/70 backdrop-blur-xl shadow-2xl ring-1 ring-white/10 transition-all animate-in zoom-in-95 duration-200">
                <div className="relative flex items-center border-b border-white/5 px-4 bg-background/30">
                    <div className="absolute left-6 pointer-events-none">
                        {isLoading ? (
                            <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                        ) : (
                            <Search className="h-5 w-5 text-primary/60" />
                        )}
                    </div>
                    <input
                        ref={inputRef}
                        type="text"
                        className="h-14 w-full border-0 bg-transparent pl-10 pr-4 text-foreground placeholder:text-muted-foreground/50 focus:ring-0 sm:text-base font-medium tracking-tight"
                        placeholder="Search records, vehicles, customers..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    <div className="flex items-center gap-2">
                        <kbd className="hidden sm:flex items-center gap-1 rounded-md bg-white/5 border border-white/10 px-2 py-1 font-mono text-[10px] font-bold text-muted-foreground/70 uppercase tracking-tighter shadow-sm">
                            ESC
                        </kbd>
                    </div>
                </div>

                <div className="max-h-[60vh] overflow-y-auto p-2 scrollbar-none">
                    {query.length === 0 && (
                        <div className="py-12 px-6 text-center">
                            <div className="relative inline-block mb-4">
                                <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
                                <Search className="relative mx-auto h-10 w-10 text-primary/20 animate-pulse" />
                            </div>
                            <h3 className="text-sm font-semibold text-foreground/80 mb-0.5">Global Command Search</h3>
                            <p className="text-xs text-muted-foreground/60 max-w-[240px] mx-auto">Quickly find customers, vehicles, or work orders from anywhere.</p>
                        </div>
                    )}

                    {query.length > 0 && results.length === 0 && !isLoading && (
                        <div className="py-12 px-6 text-center">
                            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted/30 mb-4">
                                <Search className="h-6 w-6 text-muted-foreground/30" />
                            </div>
                            <p className="text-sm font-semibold text-foreground">No matches found</p>
                            <p className="mt-0.5 text-xs text-muted-foreground/60">We couldn't find any results for "{query}".</p>
                        </div>
                    )}

                    {results.length > 0 && (
                        <div className="space-y-3 px-1">
                            {Object.entries(
                                results.reduce((acc, current) => {
                                    const type = current.type;
                                    if (!acc[type]) acc[type] = [];
                                    acc[type].push(current);
                                    return acc;
                                }, {} as Record<string, SearchResult[]>)
                            ).map(([type, items]) => (
                                <div key={type} className="animate-in slide-in-from-top-2 duration-300">
                                    <div className="px-3 mb-2">
                                        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/60">
                                            {type.replace('_', ' ')}s
                                        </h3>
                                    </div>
                                    <div className="space-y-1">
                                        {items.map((item) => {
                                            const isSelected = results.indexOf(item) === selectedIndex;
                                            const Icon = getIconForType(item.type);

                                            return (
                                                <button
                                                    key={`${item.type}-${item.id}`}
                                                    onClick={() => handleSelect(item)}
                                                    className={cn(
                                                        "group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-all duration-200 relative",
                                                        isSelected
                                                            ? "bg-primary shadow-lg shadow-primary/20 -translate-y-0.5 scale-[1.01]"
                                                            : "hover:bg-primary/5 text-foreground"
                                                    )}
                                                    onMouseEnter={() => setSelectedIndex(results.indexOf(item))}
                                                >
                                                    <div className={cn(
                                                        "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition-colors duration-300",
                                                        isSelected
                                                            ? "bg-white/20 text-white"
                                                            : "bg-muted/50 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                                                    )}>
                                                        <Icon className="h-4.5 w-4.5" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between">
                                                            <span className={cn(
                                                                "block truncate text-sm font-bold tracking-tight",
                                                                isSelected ? "text-white" : "text-foreground"
                                                            )}>
                                                                {item.title}
                                                            </span>
                                                            {isSelected && (
                                                                <span className="text-[9px] uppercase font-black tracking-widest text-white/70 animate-pulse">Select ↵</span>
                                                            )}
                                                        </div>
                                                        {item.subtitle && (
                                                            <span className={cn(
                                                                "block truncate text-xs mt-0.5",
                                                                isSelected ? "text-white/70" : "text-muted-foreground/70"
                                                            )}>
                                                                {item.subtitle}
                                                            </span>
                                                        )}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between border-t border-white/5 px-6 py-4 bg-background/50 backdrop-blur-sm">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2 group cursor-default">
                            <kbd className="flex h-5 w-5 items-center justify-center rounded bg-white/5 border border-white/10 font-mono text-[10px] text-muted-foreground shadow-sm group-hover:text-primary transition-colors">↑</kbd>
                            <kbd className="flex h-5 w-5 items-center justify-center rounded bg-white/5 border border-white/10 font-mono text-[10px] text-muted-foreground shadow-sm group-hover:text-primary transition-colors">↓</kbd>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">Navigate</span>
                        </div>
                        <div className="flex items-center gap-2 group cursor-default">
                            <kbd className="flex h-5 px-1.5 items-center justify-center rounded bg-white/5 border border-white/10 font-mono text-[10px] text-muted-foreground shadow-sm group-hover:text-primary transition-colors">↵</kbd>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">Select</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/5 border border-primary/10">
                        <CommandIcon className="w-3 h-3 text-primary/50" />
                        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-primary/70">Global Search</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function getIconForType(type: string) {
    switch (type.toLowerCase()) {
        case "customer": return Users;
        case "vehicle": return Car;
        case "work_order": return Wrench;
        case "appointment": return Calendar;
        case "inventory": return Package;
        default: return Search;
    }
}
