import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

interface EmptyStateProps {
    icon?: React.ReactNode;
    title: string;
    description?: string;
    action?: {
        label: string;
        onClick?: () => void;
        href?: string;
    };
    className?: string;
}

/**
 * Reusable empty-state component — replaces the inline
 * "No data" placeholders sprinkled throughout pages.
 */
export function EmptyState({
    icon,
    title,
    description,
    action,
    className,
}: EmptyStateProps) {
    return (
        <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed border-[color:var(--outline-variant)] bg-muted/20 py-12 px-4 text-center", className)}>
            <div className="mb-4 text-muted-foreground/60">
                {icon ?? <Inbox className="w-10 h-10" />}
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
            {description && (
                <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
            )}
            {action && (
                <div className="mt-4">
                    {action.href ? (
                        <a href={action.href}>
                            <Button variant="outline" size="sm" className="shadow-workshop">
                                {action.label}
                            </Button>
                        </a>
                    ) : (
                        <Button variant="outline" size="sm" className="shadow-workshop" onClick={action.onClick}>
                            {action.label}
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
