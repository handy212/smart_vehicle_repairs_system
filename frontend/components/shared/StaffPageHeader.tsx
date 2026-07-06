import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface BreadcrumbItem {
    label: string;
    href?: string;
}

interface StaffPageHeaderProps {
    title: string;
    description?: string;
    breadcrumbs?: BreadcrumbItem[];
    actions?: ReactNode;
    className?: string;
}

export function StaffPageHeader({
    title,
    description,
    breadcrumbs = [],
    actions,
    className,
}: StaffPageHeaderProps) {
    return (
        <div className={cn("flex flex-col gap-4 pb-6 md:flex-row md:items-center md:justify-between", className)}>
            <div className="min-w-0 space-y-1.5">
                {breadcrumbs.length > 0 && (
                    <nav className="mb-2 flex max-w-full items-center overflow-x-auto text-sm text-muted-foreground">
                        {breadcrumbs.map((item, index) => (
                            <div key={index} className="flex shrink-0 items-center">
                                {index > 0 && <ChevronRight className="h-4 w-4 mx-1.5 text-muted-foreground/50" />}
                                {item.href ? (
                                    <Link href={item.href} className="hover:text-foreground transition-colors">
                                        {item.label}
                                    </Link>
                                ) : (
                                    <span className="text-foreground font-medium">{item.label}</span>
                                )}
                            </div>
                        ))}
                    </nav>
                )}
                <h1 className="text-2xl font-bold tracking-tight text-foreground break-words">{title}</h1>
                {description && <p className="text-muted-foreground break-words">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div>}
        </div>
    );
}
