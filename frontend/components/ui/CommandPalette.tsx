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
    Clock,
    History,
} from "lucide-react";
import { searchApi, type SearchResult } from "@/lib/api/search";
import { cn } from "@/lib/utils/cn";
import { useRecentItems, type RecentItem } from "@/lib/hooks/useRecentItems";

export function CommandPalette() {
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");
    const [results, setResults] = React.useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const [selectedIndex, setSelectedIndex] = React.useState(0);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const router = useRouter();
    const { recentItems } = useRecentItems();

    const QUICK_ACTIONS = React.useMemo(() => [
        { id: "new-workorder", title: "Create Work Order", type: "action", icon: PlusCircle, url: "/workorders/new", subtitle: "Start a new repair order" },
        { id: "new-customer", title: "Add New Customer", type: "action", icon: Users, url: "/customers/new", subtitle: "Register a new client" },
        { id: "new-vehicle", title: "Register Vehicle", type: "action", icon: Car, url: "/vehicles/new", subtitle: "Add a new vehicle to fleet" },
        { id: "view-reports", title: "Analytics & Reports", type: "action", icon: BarChart3, url: "/reports", subtitle: "Deep-dive operational insights" },
    ], []);

    // Combine current viewable items for keyboard navigation
    const viewableItems = React.useMemo(() => {
        if (query.trim().length > 0) return results;

        const items: any[] = [
            ...QUICK_ACTIONS.map(a => ({ ...a, isAction: true })),
            ...recentItems.map(i => ({
                id: i.id,
                title: i.name,
                type: i.type,
                url: i.href,
                subtitle: `Recently viewed ${i.type}`,
                isRecent: true
            }))
        ];
        return items;
    }, [query, results, recentItems, QUICK_ACTIONS]);

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
                className="fixed inset-0 bg-gray-950/60 backdrop-blur-sm transition-opacity"
                onClick={() => setOpen(false)}
            />

            <div className="relative w-full max-w-2xl transform overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-gray-200 dark:ring-gray-800 transition-all">
                <div className="flex items-center border-b border-border border-border px-4">
                    <Search className="h-5 w-5 text-muted-foreground" />
                    <input
                        ref={inputRef}
                        type="text"
                        className="h-14 w-full border-0 bg-transparent px-4 text-foreground text-foreground placeholder:text-muted-foreground focus:ring-0 sm:text-sm"
                        placeholder="Search or type a command..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    <kbd className="hidden sm:flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
                        <span className="text-xs">ESC</span>
                    </kbd>
                </div>

                <div className="max-h-[60vh] overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-800">
                    {query.length === 0 && (
                        <div className="space-y-4">
                            {/* Quick Actions */}
                            <div>
                                <div className="px-3 py-2">
                                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-muted-foreground">
                                        Quick Actions
                                    </h3>
                                </div>
                                {QUICK_ACTIONS.map((action, idx) => {
                                    const isSelected = selectedIndex === idx;
                                    const Icon = action.icon;
                                    return (
                                        <button
                                            key={action.id}
                                            onClick={() => handleSelect(action)}
                                            className={cn(
                                                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                                                isSelected
                                                    ? "bg-primary/10 dark:bg-orange-900/20 text-primary"
                                                    : "hover:bg-muted hover:bg-muted text-foreground text-foreground"
                                            )}
                                            onMouseEnter={() => setSelectedIndex(idx)}
                                        >
                                            <div className={cn(
                                                "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border",
                                                isSelected ? "border-orange-200 dark:border-orange-800 bg-card dark:bg-orange-950" : "border-border border-border bg-card"
                                            )}>
                                                <Icon className="h-4 w-4" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <span className="block truncate text-sm font-semibold">{action.title}</span>
                                                <span className="block truncate text-xs text-muted-foreground text-muted-foreground">{action.subtitle}</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Recent Items */}
                            {recentItems.length > 0 && (
                                <div>
                                    <div className="px-3 py-2 flex items-center justify-between">
                                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-muted-foreground">
                                            Recently Viewed
                                        </h3>
                                        <History className="w-3 h-3 text-muted-foreground" />
                                    </div>
                                    {recentItems.map((item, idx) => {
                                        const globalIdx = QUICK_ACTIONS.length + idx;
                                        const isSelected = selectedIndex === globalIdx;
                                        const Icon = getIconForType(item.type);
                                        return (
                                            <button
                                                key={`recent-${item.type}-${item.id}`}
                                                onClick={() => handleSelect({ url: item.href })}
                                                className={cn(
                                                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                                                    isSelected
                                                        ? "bg-primary/10 dark:bg-orange-900/20 text-primary"
                                                        : "hover:bg-muted hover:bg-muted text-foreground text-foreground"
                                                )}
                                                onMouseEnter={() => setSelectedIndex(globalIdx)}
                                            >
                                                <div className={cn(
                                                    "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border",
                                                    isSelected ? "border-orange-200 dark:border-orange-800 bg-card dark:bg-orange-950" : "border-border border-border bg-card"
                                                )}>
                                                    <Icon className="h-4 w-4" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <span className="block truncate text-sm font-semibold">{item.name}</span>
                                                    <span className="block truncate text-xs text-muted-foreground text-muted-foreground capitalize">{item.type}</span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {query.length > 0 && results.length === 0 && !isLoading && (
                        <div className="py-14 px-6 text-center sm:px-14">
                            <Search className="mx-auto h-8 w-8 text-gray-300 text-muted-foreground" />
                            <p className="mt-4 text-sm text-foreground text-foreground font-semibold">No results found</p>
                            <p className="mt-2 text-sm text-muted-foreground">We couldn't find anything matching "{query}".</p>
                        </div>
                    )}

                    {results.length > 0 && (
                        <div className="space-y-1">
                            {Object.entries(
                                results.reduce((acc, current) => {
                                    const type = current.type;
                                    if (!acc[type]) acc[type] = [];
                                    acc[type].push(current);
                                    return acc;
                                }, {} as Record<string, SearchResult[]>)
                            ).map(([type, items]) => (
                                <div key={type}>
                                    <div className="px-3 py-2">
                                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-muted-foreground">
                                            {type}s
                                        </h3>
                                    </div>
                                    {items.map((item) => {
                                        const isSelected = results.indexOf(item) === selectedIndex;
                                        const Icon = getIconForType(item.type);

                                        return (
                                            <button
                                                key={`${item.type}-${item.id}`}
                                                onClick={() => handleSelect(item)}
                                                className={cn(
                                                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                                                    isSelected
                                                        ? "bg-primary/10 dark:bg-orange-900/20 text-primary"
                                                        : "hover:bg-muted hover:bg-muted text-foreground text-foreground"
                                                )}
                                                onMouseEnter={() => setSelectedIndex(results.indexOf(item))}
                                            >
                                                <div className={cn(
                                                    "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border",
                                                    isSelected ? "border-orange-200 dark:border-orange-800 bg-card dark:bg-orange-950" : "border-border border-border bg-card"
                                                )}>
                                                    <Icon className="h-4 w-4" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between">
                                                        <span className="block truncate text-sm font-semibold">
                                                            {item.title}
                                                        </span>
                                                        {isSelected && (
                                                            <span className="text-[10px] uppercase font-bold tracking-tight opacity-50">Enter to select</span>
                                                        )}
                                                    </div>
                                                    {item.subtitle && (
                                                        <span className="block truncate text-xs text-muted-foreground text-muted-foreground">
                                                            {item.subtitle}
                                                        </span>
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between border-t border-border border-border px-4 py-3 text-xs text-muted-foreground text-muted-foreground bg-muted/50 bg-background/50">
                    <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1.5">
                            <kbd className="rounded bg-card px-1.5 py-0.5 font-mono text-[10px] shadow-sm ring-1 ring-gray-200 dark:ring-gray-700">↑↓</kbd>
                            Navigate
                        </span>
                        <span className="flex items-center gap-1.5">
                            <kbd className="rounded bg-card px-1.5 py-0.5 font-mono text-[10px] shadow-sm ring-1 ring-gray-200 dark:ring-gray-700">Enter</kbd>
                            Select
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <CommandIcon className="w-3 h-3" />
                        <span>Global Search</span>
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
