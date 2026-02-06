"use client";

import Link from "next/link";
import {
    Calendar,
    PlusCircle,
    Receipt,
    Clock,
    ArrowRight
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function PortalQuickActions() {
    const actions = [
        {
            title: "Book Service",
            desc: "Schedule appointment",
            icon: Calendar,
            href: "/portal/book",
            color: "text-primary",
            hoverBg: "hover:bg-primary/10 dark:hover:bg-orange-900/20",
            borderColor: "hover:border-orange-200 dark:hover:border-orange-800"
        },
        {
            title: "Add Vehicle",
            desc: "Register new car",
            icon: PlusCircle,
            href: "/portal/vehicles/new",
            color: "text-success",
            hoverBg: "hover:bg-success/10 dark:hover:bg-green-900/20",
            borderColor: "hover:border-green-200 dark:hover:border-green-800"
        },
        {
            title: "View Invoices",
            desc: "Check balance",
            icon: Receipt,
            href: "/portal/invoices",
            color: "text-yellow-600 dark:text-yellow-400",
            hoverBg: "hover:bg-warning/10 dark:hover:bg-yellow-900/20",
            borderColor: "hover:border-yellow-200 dark:hover:border-yellow-800"
        },
        {
            title: "Service History",
            desc: "Past records",
            icon: Clock,
            href: "/portal/history",
            color: "text-purple-600 dark:text-purple-400",
            hoverBg: "hover:bg-purple-50 dark:hover:bg-purple-900/20",
            borderColor: "hover:border-purple-200 dark:hover:border-purple-800"
        }
    ];

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {actions.map((action, index) => (
                <Link
                    key={index}
                    href={action.href}
                    className={cn(
                        "group flex flex-col justify-between p-4 bg-card border border-border rounded-xl transition-all duration-300",
                        action.hoverBg,
                        action.borderColor
                    )}
                >
                    <div className="flex justify-between items-start mb-2">
                        <div className={cn("p-2 rounded-lg bg-muted group-hover:bg-card dark:group-hover:bg-gray-900 transition-colors", action.color)}>
                            <action.icon className="w-5 h-5" />
                        </div>
                        <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-muted-foreground -translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-sm text-foreground">{action.title}</h3>
                        <p className="text-xs text-muted-foreground">{action.desc}</p>
                    </div>
                </Link>
            ))}
        </div>
    );
}
