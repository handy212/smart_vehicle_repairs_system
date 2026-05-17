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
        <div className={cn("flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between border-b border-border", className)}>
            <div className="min-w-0 space-y-1">
                <h1 className="text-xl font-bold text-foreground break-words">{title}</h1>
                {description && (
                    <p className="text-sm text-muted-foreground break-words">{description}</p>
                )}
                {children && <div className="pt-1">{children}</div>}
            </div>
            {action && (
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {action}
                </div>
            )}
        </div>
    );
}
