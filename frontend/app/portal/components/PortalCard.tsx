"use client";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

interface PortalCardProps {
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    status?: React.ReactNode;
    children?: React.ReactNode;
    onClick?: () => void;
    href?: string;
    icon?: React.ReactNode;
    className?: string;
}

export function PortalCard({
    title,
    subtitle,
    status,
    children,
    onClick,
    href,
    icon,
    className
}: PortalCardProps) {
    const Content = (
        <div className="flex items-start justify-between gap-4">
            <div className="flex gap-3 min-w-0">
                {icon && (
                    <div className="flex-shrink-0 mt-0.5 max-w-[24px]">
                        {icon}
                    </div>
                )}
                <div className="min-w-0 space-y-1">
                    <div className="font-semibold text-sm text-foreground truncate">
                        {title}
                    </div>
                    {subtitle && (
                        <div className="text-xs text-muted-foreground">
                            {subtitle}
                        </div>
                    )}
                    {children && (
                        <div className="pt-2 text-sm">
                            {children}
                        </div>
                    )}
                </div>
            </div>
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
                {status}
                {(href || onClick) && (
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                )}
            </div>
        </div>
    );

    const wrapperClasses = cn(
        "relative block p-4 bg-card border border-border rounded-xl transition-all hover:bg-muted hover:bg-muted/50 hover:shadow-sm",
        className
    );

    // If there's an href, we render a div with a stretched link inside
    // If there's children, they need to be clickable, so we give them relative z-10
    const InnerContent = (
        <>
            {href && <Link href={href} className="absolute inset-0 z-0" />}
            <div className="relative z-10 pointer-events-none">
                {/* Enable pointer events for actual content elements if they are interactive, 
               but commonly the whole card is clickable. 
               However, if we have buttons inside children, we need them to be clickable.
               The stretched link covers the parent. 
               Children naturally sit on top if z-indexed.
            */}
                <div className="flex items-start justify-between gap-4 pointer-events-auto">
                    <div className="flex gap-3 min-w-0">
                        {icon && (
                            <div className="flex-shrink-0 mt-0.5 max-w-[24px]">
                                {icon}
                            </div>
                        )}
                        <div className="min-w-0 space-y-1">
                            <div className="font-semibold text-sm text-foreground truncate">
                                {title}
                            </div>
                            {subtitle && (
                                <div className="text-xs text-muted-foreground">
                                    {subtitle}
                                </div>
                            )}
                            {children && (
                                <div className="pt-2 text-sm">
                                    {children}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        {status}
                        {(href || onClick) && (
                            <ChevronRight className="w-4 h-4 text-gray-300" />
                        )}
                    </div>
                </div>
            </div>
        </>
    );

    if (onClick) {
        return (
            <div onClick={onClick} className={cn(wrapperClasses, "cursor-pointer")}>
                {Content}
            </div>
        );
    }

    return (
        <div className={wrapperClasses}>
            {InnerContent}
        </div>
    );
}
