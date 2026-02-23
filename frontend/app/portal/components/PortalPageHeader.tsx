"use client";

import { cn } from "@/lib/utils/cn";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Button } from "@/components/ui/button";

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
        <div className={cn("flex flex-col space-y-4 md:space-y-0 md:flex-row md:items-center md:justify-between pb-6 border-b border-border", className)}>
            <div className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                    {title}
                </h1>
                {description && (
                    <p className="text-sm text-muted-foreground">
                        {description}
                    </p>
                )}
                {children}
            </div>
            {action && (
                <div className="flex items-center space-x-2">
                    {action}
                </div>
            )}
        </div>
    );
}
