"use client";

import { useEffect, useState } from "react";
import { serviceWorkerManager } from "@/lib/pwa/serviceWorker";
import { Button } from "@/components/ui/button";
import { X, RefreshCw } from "lucide-react";

export function ServiceWorkerRegistration() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    // Register service worker
    serviceWorkerManager.register().catch((error) => {
      console.error("Failed to register service worker:", error);
    });

    // Listen for updates
    const unsubscribe = serviceWorkerManager.on("updateAvailable", () => {
      setUpdateAvailable(true);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleUpdate = async () => {
    setIsInstalling(true);
    try {
      await serviceWorkerManager.skipWaiting();
      // Page will reload automatically when new service worker activates
    } catch (error) {
      console.error("Failed to update service worker:", error);
      setIsInstalling(false);
    }
  };

  const handleDismiss = () => {
    setUpdateAvailable(false);
  };

  if (!updateAvailable) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:w-96">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg p-4 flex items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            App Update Available
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            A new version is available. Update now?
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleUpdate}
            disabled={isInstalling}
            className="h-8"
          >
            {isInstalling ? (
              <>
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                Updating...
              </>
            ) : (
              "Update"
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDismiss}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
