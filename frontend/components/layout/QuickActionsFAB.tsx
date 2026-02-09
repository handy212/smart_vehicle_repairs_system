"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { PremiumIcons } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePathname } from "next/navigation";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/utils/permissions";

interface QuickAction {
    label: string;
    icon: React.ReactNode;
    href: string;
    color: string;
    category: string;
    permission: string;
}

export function QuickActionsFAB() {
    const [isOpen, setIsOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const pathname = usePathname();
    const { hasPermission } = usePermissions();

    useEffect(() => {
        setMounted(true);
    }, []);

    // Auto-collapse when route changes
    useEffect(() => {
        setIsOpen(false);
    }, [pathname]);

    if (!mounted) return null;

    const allActions: QuickAction[] = [
        {
            label: "New Work Order",
            icon: <PremiumIcons.Wrench className="w-5 h-5" />,
            href: "/workorders/new",
            color: "bg-blue-500 shadow-blue-500/20",
            category: "Operations",
            permission: PERMISSIONS.CREATE_WORKORDERS
        },
        {
            label: "New Customer",
            icon: <PremiumIcons.Users className="w-5 h-5" />,
            href: "/customers/new",
            color: "bg-emerald-500 shadow-emerald-500/20",
            category: "Management",
            permission: PERMISSIONS.CREATE_CUSTOMERS
        },
        {
            label: "New Vehicle",
            icon: <PremiumIcons.Car className="w-5 h-5" />,
            href: "/vehicles/new",
            color: "bg-amber-500 shadow-amber-500/20",
            category: "Management",
            permission: PERMISSIONS.CREATE_VEHICLES
        },
        {
            label: "New Appointment",
            icon: <PremiumIcons.Calendar className="w-5 h-5" />,
            href: "/appointments/new",
            color: "bg-purple-500 shadow-purple-500/20",
            category: "Operations",
            permission: PERMISSIONS.CREATE_APPOINTMENTS
        },
        {
            label: "New Invoice",
            icon: <PremiumIcons.Receipt className="w-5 h-5" />,
            href: "/billing/invoices/new",
            color: "bg-pink-500 shadow-pink-500/20",
            category: "Billing",
            permission: PERMISSIONS.CREATE_INVOICES
        },
    ];

    const actions = allActions.filter(action => hasPermission(action.permission));

    // Don't render the FAB if the user has no available actions
    if (actions.length === 0) return null;

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4 pointer-events-none">
            <TooltipProvider delayDuration={0}>
                {/* Expanded Menu */}
                <div
                    className={cn(
                        "flex flex-col items-end gap-3 transition-all duration-300 ease-in-out pointer-events-auto",
                        isOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
                    )}
                >
                    {actions.map((action, index) => (
                        <div
                            key={action.label}
                            className="flex items-center gap-3"
                            style={{
                                transitionDelay: `${isOpen ? index * 50 : 0}ms`,
                            }}
                        >
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Link href={action.href} onClick={() => setIsOpen(false)}>
                                        <Button
                                            size="icon"
                                            className={cn(
                                                "w-12 h-12 rounded-full text-white shadow-lg transition-all duration-200 hover:scale-110 active:scale-95 group",
                                                action.color
                                            )}
                                        >
                                            <div className="transition-transform duration-300 group-hover:rotate-12">
                                                {action.icon}
                                            </div>
                                        </Button>
                                    </Link>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="font-medium bg-secondary text-secondary-foreground border-none shadow-md">
                                    <p>{action.label}</p>
                                </TooltipContent>
                            </Tooltip>
                        </div>
                    ))}
                </div>

                {/* Main FAB Toggle */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            onClick={() => setIsOpen(!isOpen)}
                            className={cn(
                                "w-14 h-14 rounded-full shadow-2xl transition-all duration-500 ease-spring group relative overflow-hidden ring-4 ring-background/50 backdrop-blur-sm pointer-events-auto",
                                isOpen
                                    ? "bg-slate-900 dark:bg-slate-800 text-white rotate-180"
                                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                            )}
                        >
                            <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />

                            {isOpen ? (
                                <PremiumIcons.X className="w-6 h-6 transition-all duration-500" />
                            ) : (
                                <div className="relative">
                                    <PremiumIcons.Plus className="w-7 h-7 transition-all duration-500 group-hover:scale-110" />
                                    <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full animate-pulse border-2 border-primary ring-2 ring-rose-500/20" />
                                </div>
                            )}
                        </Button>
                    </TooltipTrigger>
                    {!isOpen && (
                        <TooltipContent side="left" className="font-medium bg-secondary text-secondary-foreground border-none shadow-md">
                            <p>Quick Actions</p>
                        </TooltipContent>
                    )}
                </Tooltip>
            </TooltipProvider>

            {/* Overlay Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 -z-10 bg-background/20 backdrop-blur-[2px] cursor-pointer pointer-events-auto"
                    onClick={() => setIsOpen(false)}
                />
            )}
        </div>
    );
}
