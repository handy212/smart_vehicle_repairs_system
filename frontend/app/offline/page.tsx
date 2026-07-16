"use client";

import { WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { getPostLoginPath } from "@/lib/utils/post-login-redirect";

export default function OfflinePage() {
  const router = useRouter();
  const { user } = useAuthStore();

  const handleRetry = () => {
    if (navigator.onLine) {
      router.push(getPostLoginPath(user?.role));
    } else {
      router.refresh();
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="text-center max-w-md w-full">
        <div className="mb-6 flex justify-center">
          <div className="bg-border rounded-full p-6">
            <WifiOff className="h-16 w-16 text-muted-foreground" />
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
        <p className="text-sm text-muted-foreground mt-4">
          You can continue using the app offline. Your changes will sync when
          you're back online.
        </p>
      </div>
    </div>
  );
}
