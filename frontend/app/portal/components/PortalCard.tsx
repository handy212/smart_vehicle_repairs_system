"use client";

import { cn } from "@/lib/utils/cn";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface PortalCardProps {
    title: string;
    subtitle?: string | React.ReactNode;
    icon?: React.ReactNode;
    href?: string;
    onClick?: () => void;
    className?: string;
    variant?: "default" | "glass" | "gradient";
}

export function PortalCard({
    title,
    subtitle,
    icon,
    href,
    onClick,
    className,
}: PortalCardProps) {
    const Content = (
        <div className={cn(
            "flex items-center gap-3 p-4 rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors",
            (onClick || href) ? "cursor-pointer" : "",
            className
        )}>
            {icon && (
                <div className="shrink-0 h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    {icon}
                </div>
            )}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{title}</p>
                {subtitle && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                        {subtitle}
                    </div>
                )}
            </div>
            {(href || onClick) && (
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            )}
        </div>
    );

    if (href) {
        return <Link href={href}>{Content}</Link>;
    }
    return <div onClick={onClick}>{Content}</div>;
}
