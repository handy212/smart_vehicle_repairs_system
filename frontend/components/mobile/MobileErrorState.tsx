"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MobileErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function MobileErrorState({
  title = "Something went wrong",
  message = "We couldn't load this data. Check your connection and try again.",
  onRetry,
}: MobileErrorStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center py-12 px-4 text-center min-h-[280px]"
      role="alert"
    >
      <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-xs mb-4">{message}</p>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
