"use client";

import { cn } from "@/lib/utils/cn";

interface PortalPageHeaderProps {
    title: string;
    description?: string;
    action?: React.ReactNode;
    children?: React.ReactNode;
    className?: string;
}

export function PortalPageHeader({
    title,
    description,
    action,
    children,
    className
}: PortalPageHeaderProps) {
    return (
        <div className={cn("flex flex-col space-y-3 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-border", className)}>
            <div className="space-y-1">
                <h1 className="text-xl font-bold text-foreground">{title}</h1>
                {description && (
                    <p className="text-sm text-muted-foreground">{description}</p>
                )}
                {children && <div className="pt-1">{children}</div>}
            </div>
            {action && (
                <div className="flex items-center gap-2 shrink-0">
                    {action}
                </div>
            )}
        </div>
    );
}
