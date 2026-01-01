"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { User, FileText, Wrench, Search, Truck, Clock } from "lucide-react";

interface VehicleSidebarProps {
    vehicleId: number;
    activeView: string;
    onViewChange?: (view: string) => void;
}

export function VehicleSidebar({ vehicleId, activeView, onViewChange }: VehicleSidebarProps) {
    const pathname = usePathname();

    const menuItems = [
        {
            id: "profile",
            label: "Overview",
            icon: User,
            href: `/vehicles/${vehicleId}`,
        },
        {
            id: "history",
            label: "Service History",
            icon: Clock,
            href: `/vehicles/${vehicleId}?view=history`,
        },

        {
            id: "documents",
            label: "Documents",
            icon: FileText,
            href: `/vehicles/${vehicleId}?view=documents`,
        },
        {
            id: "roadside",
            label: "Roadside",
            icon: Truck,
            href: `/vehicles/${vehicleId}?view=roadside`,
        },
    ];

    return (
        <div className="w-full md:w-64 flex-shrink-0 space-y-2">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Vehicle Menu
                    </h3>
                </div>
                <nav className="flex flex-col p-2 space-y-1">
                    {menuItems.map((item) => {
                        const isActive = activeView === item.id;

                        // If using client-side state switching
                        if (onViewChange) {
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => onViewChange(item.id)}
                                    className={cn(
                                        "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                                        isActive
                                            ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                                            : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                                    )}
                                >
                                    <item.icon className={cn("mr-3 h-4 w-4", isActive ? "text-blue-500" : "text-gray-400")} />
                                    {item.label}
                                </button>
                            );
                        }

                        // If using navigation
                        return (
                            <Link
                                key={item.id}
                                href={item.href}
                                className={cn(
                                    "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                                    isActive
                                        ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                                )}
                            >
                                <item.icon className={cn("mr-3 h-4 w-4", isActive ? "text-blue-500" : "text-gray-400")} />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </div>
    );
}
