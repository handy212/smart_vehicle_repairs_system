"use client";

import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { PremiumIcons } from "@/components/ui/icons";

export function PortalQuickActions() {
    const actions = [
        {
            title: "Book Service",
            desc: "Schedule an appointment",
            icon: PremiumIcons.Calendar,
            href: "/portal/book",
            iconClass: "text-primary",
            iconBg: "bg-primary/10",
        },
        {
            title: "Add Vehicle",
            desc: "Register a new vehicle",
            icon: PremiumIcons.Plus,
            href: "/portal/vehicles/new",
            iconClass: "text-success",
            iconBg: "bg-success/10",
        },
        {
            title: "View Invoices",
            desc: "Manage your balance",
            icon: PremiumIcons.Receipt,
            href: "/portal/invoices",
            iconClass: "text-warning",
            iconBg: "bg-warning/10",
        },
        {
            title: "Review Estimates",
            desc: "Approve or decline quotes",
            icon: PremiumIcons.FileText,
            href: "/portal/estimates",
            iconClass: "text-primary",
            iconBg: "bg-primary/10",
        },
        {
            title: "Service History",
            desc: "Review past records",
            icon: PremiumIcons.History,
            href: "/portal/history",
            iconClass: "text-muted-foreground",
            iconBg: "bg-muted",
        }
    ];

    return (
        <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory sm:grid sm:grid-cols-2 lg:grid-cols-5 sm:overflow-visible sm:pb-0">
            {actions.map((action, index) => (
                <Link
                    key={index}
                    href={action.href}
                    className="flex min-w-[140px] sm:min-w-0 snap-start flex-col gap-2 p-4 rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors"
                >
                    <div className={cn("p-2 rounded-lg w-fit", action.iconBg)}>
                        <action.icon className={cn("w-4 h-4", action.iconClass)} />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-foreground">{action.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{action.desc}</p>
                    </div>
                </Link>
            ))}
        </div>
    );
}
