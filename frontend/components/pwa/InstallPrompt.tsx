"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setShowPrompt(false);
    }

    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    // Store dismissal in localStorage to avoid showing again for a while
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  // Check if user recently dismissed
  useEffect(() => {
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed);
      const daysSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed < 7) {
        setShowPrompt(false);
      }
    }
  }, []);

  if (!showPrompt || !deferredPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 md:left-auto md:right-4 md:w-96">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Download className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
              Install App
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Install this app on your device for a better experience and offline access.
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleInstall} className="flex-1">
                Install
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDismiss}
                className="px-2"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
