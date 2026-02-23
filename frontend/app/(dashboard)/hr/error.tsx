"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function ModuleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(`Error in module:`, error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-card rounded-lg border border-border shadow-sm my-4 min-h-[400px]">
      <div className="w-12 h-12 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4">
        <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
      </div>
      <h2 className="text-xl font-semibold mb-2">Failed to load this section</h2>
      <p className="text-muted-foreground mb-6 max-w-md">
        An error occurred while rendering this module. You can try reloading just this section.
      </p>
      <Button onClick={reset} variant="outline">
        <RefreshCw className="w-4 h-4 mr-2" />
        Try Again
      </Button>
    </div>
  );
}
