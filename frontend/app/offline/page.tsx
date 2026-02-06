"use client";

import { WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function OfflinePage() {
  const router = useRouter();

  const handleRetry = () => {
    if (navigator.onLine) {
      router.push("/mobile/dashboard");
    } else {
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <div className="text-center max-w-md w-full">
        <div className="mb-6 flex justify-center">
          <div className="bg-gray-100 dark:bg-gray-800 rounded-full p-6">
            <WifiOff className="h-16 w-16 text-gray-400" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">
          You're Offline
        </h1>
        <p className="text-muted-foreground mb-6">
          It looks like you're not connected to the internet. Some features may
          be limited, but you can still view cached content.
        </p>
        <Button onClick={handleRetry} className="w-full">
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
        <p className="text-sm text-gray-500 dark:text-gray-500 mt-4">
          You can continue using the app offline. Your changes will sync when
          you're back online.
        </p>
      </div>
    </div>
  );
}
