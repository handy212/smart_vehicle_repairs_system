"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { User, FileText, Wrench, Search, Truck, Clock, Calendar } from "lucide-react";

interface VehicleSidebarProps {
    vehicleId: number;
    activeView: string;
    onViewChange?: (view: string) => void;
}

export function VehicleSidebar({ vehicleId, activeView, onViewChange }: VehicleSidebarProps) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
            id: "services",
            label: "Service Schedule",
            icon: Calendar,
            href: `/vehicles/${vehicleId}?view=services`,
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
        <div className="w-full md:w-72 flex-shrink-0 space-y-2">
            <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
                <div className="p-3 bg-muted/50 border-b border-border">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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
                                            ? "bg-primary/10 text-primary dark:bg-primary/20 text-primary"
                                            : "text-card-foreground hover:bg-muted hover:bg-muted"
                                    )}
                                >
                                    <item.icon className={cn("mr-3 h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
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
                                        ? "bg-primary/10 text-primary dark:bg-orange-900/20 dark:text-orange-300"
                                        : "text-card-foreground hover:bg-muted hover:bg-muted"
                                )}
                            >
                                <item.icon className={cn("mr-3 h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </div>
    );
}
