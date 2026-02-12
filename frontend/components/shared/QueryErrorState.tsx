"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

interface QueryErrorStateProps {
    /** The error object from useQuery / useMutation */
    error: Error | null;
    /** Called when the user clicks "Try Again" */
    onRetry?: () => void;
    /** Optional title override */
    title?: string;
    className?: string;
}

/**
 * A reusable error fallback for failed React-Query requests.
 * Drop this in wherever you handle `isError` from `useQuery`.
 */
export function QueryErrorState({
    error,
    onRetry,
    title = "Something went wrong",
    className,
}: QueryErrorStateProps) {
    return (
        <div
            className={cn(
                "flex flex-col items-center justify-center py-12 px-4 text-center",
                className,
            )}
            role="alert"
        >
            <div className="mb-4 rounded-full bg-destructive/10 p-3">
                <AlertCircle className="w-8 h-8 text-destructive" />
            </div>

            <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>

            {error?.message && (
                <p className="text-sm text-muted-foreground max-w-sm mb-4">
                    {error.message}
                </p>
            )}

            {onRetry && (
                <Button variant="outline" size="sm" onClick={onRetry}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Try Again
                </Button>
            )}
        </div>
    );
}
