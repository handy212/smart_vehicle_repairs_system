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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                    {breadcrumbs && breadcrumbs.length > 0 && (
                        <nav className="flex items-center space-x-1 text-sm text-muted-foreground text-muted-foreground">
                            {breadcrumbs.map((item, index) => (
                                <div key={index} className="flex items-center">
                                    {index > 0 && <ChevronRight className="w-4 h-4 mx-1" />}
                                    {item.href ? (
                                        <Link
                                            href={item.href}
                                            className="hover:text-foreground dark:hover:text-gray-100 transition-colors"
                                        >
                                            {item.label}
                                        </Link>
                                    ) : (
                                        <span className="font-medium text-foreground text-foreground">
                                            {item.label}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </nav>
                    )}
                    <h1 className="text-xl font-bold text-foreground text-foreground tracking-tight">{title}</h1>
                </div>

                {actions && (
                    <div className="flex items-center gap-2">
                        {actions}
                    </div>
                )}
            </div>

            {children}
        </div>
    );
}
