"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Home, RefreshCw, AlertCircle, ArrowLeft } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mt-4">Dashboard Error</h1>
          <p className="text-muted-foreground mt-2">
            Something went wrong while loading the dashboard.
          </p>
        </div>

        <div className="space-y-4">
          <div className="bg-card rounded-lg shadow-sm p-6 text-left">
            <p className="text-sm font-semibold text-foreground mb-2">Error Details:</p>
            <p className="text-sm text-muted-foreground font-mono bg-muted p-3 rounded break-all">
              {error.message || "An unknown error occurred"}
            </p>
            {error.digest && (
              <p className="text-xs text-muted-foreground mt-2">
                Error ID: {error.digest}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={reset}variant="secondary">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
            <Button onClick={() => router.back()}variant="secondary">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
            <Button onClick={() => router.push("/dashboard")}>
              <Home className="w-4 h-4 mr-2" />
              Go to Dashboard
            </Button>
          </div>

          <div className="pt-4">
            <p className="text-sm text-muted-foreground">
              If this problem persists, please contact support with the error ID above.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

