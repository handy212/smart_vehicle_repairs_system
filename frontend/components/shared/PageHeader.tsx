"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface BreadcrumbItem {
    label: string;
    href?: string;
}

interface PageHeaderProps {
    title: string;
    breadcrumbs?: BreadcrumbItem[];
    actions?: React.ReactNode;
    className?: string;
    children?: React.ReactNode; // For extra content below title (e.g. tabs or filters)
}

export function PageHeader({ title, breadcrumbs, actions, className, children }: PageHeaderProps) {
    return (
        <div className={cn("space-y-4 mb-6", className)}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                    {breadcrumbs && breadcrumbs.length > 0 && (
                        <nav className="flex max-w-full items-center space-x-1 overflow-x-auto text-sm text-muted-foreground">
                            {breadcrumbs.map((item, index) => (
                                <div key={index} className="flex shrink-0 items-center">
                                    {index > 0 && <ChevronRight className="w-4 h-4 mx-1" />}
                                    {item.href ? (
                                        <Link
                                            href={item.href}
                                            className="hover:text-foreground  transition-colors"
                                        >
                                            {item.label}
                                        </Link>
                                    ) : (
                                        <span className="font-medium text-foreground">
                                            {item.label}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </nav>
                    )}
                    <h1 className="text-xl font-bold text-foreground tracking-tight break-words">{title}</h1>
                </div>

                {actions && (
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        {actions}
                    </div>
                )}
            </div>

            {children}
        </div>
    );
}
