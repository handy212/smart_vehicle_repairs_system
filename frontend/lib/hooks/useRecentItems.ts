"use client";

import { useState, useEffect, useCallback } from "react";

export type RecentItemType = "customer" | "vehicle" | "workorder" | "report";

export interface RecentItem {
    id: string | number;
    name: string;
    type: RecentItemType;
    href: string;
    timestamp: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
metadata ?: Record<string, any>;
}

const MAX_RECENT_ITEMS = 10;
const STORAGE_KEY = "antigravity_recent_items";

export function useRecentItems() {
    const [recentItems, setRecentItems] = useState<RecentItem[]>([]);

    // Load from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored) as RecentItem[];
                setRecentItems(parsed);
            } catch (e) {
                console.error("Failed to parse recent items", e);
            }
        }
    }, []);

    const addRecentItem = useCallback((item: Omit<RecentItem, "timestamp">) => {
        const newItem: RecentItem = { ...item, timestamp: Date.now() };

        setRecentItems((prev) => {
            // Remove existing item of same type and id to avoid duplicates
            const filtered = prev.filter((i) => !(i.id === item.id && i.type === item.type));

            // Add new item to front and limit size
            const updated = [newItem, ...filtered].slice(0, MAX_RECENT_ITEMS);

            // Save to localStorage
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            return updated;
        });
    }, []);

    const clearRecentItems = useCallback(() => {
        setRecentItems([]);
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    return { recentItems, addRecentItem, clearRecentItems };
}
