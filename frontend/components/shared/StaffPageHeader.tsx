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
            <div className="space-y-1.5">
                {breadcrumbs.length > 0 && (
                    <nav className="flex items-center text-sm text-muted-foreground mb-2">
                        {breadcrumbs.map((item, index) => (
                            <div key={index} className="flex items-center">
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
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
                {description && <p className="text-muted-foreground">{description}</p>}
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
    );
}
