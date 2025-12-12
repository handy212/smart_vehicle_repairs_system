"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Global application error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            <div className="mb-8">
              <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mt-4">Critical Error</h1>
              <p className="text-gray-600 mt-2">
                A critical error occurred that prevented the application from loading.
              </p>
            </div>

            <div className="space-y-4">
              <div className="bg-white rounded-lg shadow-sm p-6 text-left">
                <p className="text-sm font-semibold text-gray-900 mb-2">Error Details:</p>
                <p className="text-sm text-gray-600 font-mono bg-gray-50 p-3 rounded break-all">
                  {error.message || "An unknown critical error occurred"}
                </p>
                {error.digest && (
                  <p className="text-xs text-gray-500 mt-2">
                    Error ID: {error.digest}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-3 justify-center">
                <Button onClick={reset} className="w-full">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Reload Application
                </Button>
                <Button
                  onClick={() => {
                    window.location.href = "/login";
                  }}
                 variant="secondary"
                  className="w-full"
                >
                  Go to Login
                </Button>
              </div>

              <div className="pt-4">
                <p className="text-sm text-gray-600">
                  If this problem persists, please clear your browser cache and try again,
                  or contact support with the error ID above.
                </p>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

