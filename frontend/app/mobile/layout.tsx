"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { authApi } from "@/lib/api/auth";
import { SyncStatusBanner } from "@/components/mobile/SyncStatusBanner";
import { BellRing, Home, Wrench, ClipboardCheck, Clock } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { OfflineIndicator } from "@/components/mobile/OfflineIndicator";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { usePushNotifications } from "@/hooks/usePushNotifications";

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, setUser, isAuthenticated } = useAuthStore();
  const pushNotifications = usePushNotifications();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem("access_token");

      if (!token) {
        router.push("/login");
        return;
      }

      if (!user && token) {
        try {
          const currentUser = await authApi.getCurrentUser();
          setUser(currentUser);
        } catch (error) {
          router.push("/login");
        }
      }
    };

    if (mounted) {
      checkAuth();
    }
  }, [user, setUser, router, mounted]);

  // Guard to prevent repeated attempts per page load
  const hasAttemptedPushRef = useRef(false);

  // Subscribe to push notifications on mount
  // DISABLED: Browser security requires notification permission from user interaction
  // Add a UI button to enable push notifications when needed
  /*
  useEffect(() => {
    if (!mounted || !isAuthenticated || !pushNotifications.isSupported) {
      return;
    }

    // Safety guard: only ever try once per page load
    if (hasAttemptedPushRef.current) {
      return;
    }

    // Fixed throttling period: 24 hours (change this value to adjust)
    const THROTTLE_PERIOD_MS = 24 * 60 * 60 * 1000; // 24 hours

    const attemptKey = "pwa-push-subscribe-attempt";
    const now = Date.now();
    const lastAttempt = parseInt(localStorage.getItem(attemptKey) || "0", 10);

    // Skip if within throttle period
    if (!Number.isNaN(lastAttempt) && lastAttempt > 0 && (now - lastAttempt) < THROTTLE_PERIOD_MS) {
      return;
    }

    // Only attempt if not already subscribed
    if (!pushNotifications.isSubscribed) {
      hasAttemptedPushRef.current = true; // Mark as attempted immediately
      localStorage.setItem(attemptKey, now.toString());

      // Request permission and subscribe
      pushNotifications.requestPermission().then((permission) => {
        if (permission === "granted") {
          pushNotifications.subscribe("Mobile App").catch((error) => {
            // Silently handle subscription errors to prevent spam
            console.warn("[Push] Subscription failed:", error?.message || "Unknown error");
          });
        }
      }).catch((error) => {
        // Silently handle permission errors
        console.warn("[Push] Permission request failed:", error?.message || "Unknown error");
      });
    }
  }, [mounted, isAuthenticated, pushNotifications.isSupported, pushNotifications.isSubscribed]);
  */

  if (!mounted || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const navItems = [
    {
      href: "/mobile/dashboard",
      label: "Dashboard",
      icon: Home,
    },
    {
      href: "/mobile/workorders",
      label: "Work Orders",
      icon: Wrench,
    },
    {
      href: "/mobile/inspections",
      label: "Inspections",
      icon: ClipboardCheck,
    },
    {
      href: "/mobile/time-tracking",
      label: "Time",
      icon: Clock,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      <SyncStatusBanner />
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 h-14 px-4 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-1.5 rounded-lg">
            <Wrench className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">
            Tech App
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <OfflineIndicator />
          {pushNotifications.isSupported && !pushNotifications.isSubscribed && (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300"
              onClick={() => {
                pushNotifications
                  .requestPermission()
                  .then((permission) => {
                    if (permission === "granted") {
                      return pushNotifications.subscribe("Mobile App");
                    }
                    return null;
                  })
                  .catch((error) => {
                    console.warn(
                      "[Push] Manual subscribe failed:",
                      error?.message || "Unknown error"
                    );
                  });
              }}
            >
              <BellRing className="h-3 w-3" />
              Enable Push
            </button>
          )}
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {user?.first_name} {user?.last_name}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">{children}</main>

      {/* Install Prompt */}
      <InstallPrompt />

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 z-50 safe-area-inset-bottom">
        <div className="grid grid-cols-4 h-16">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 text-xs transition-colors",
                  isActive
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-gray-500 dark:text-gray-400"
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5",
                    isActive && "text-blue-600 dark:text-blue-400"
                  )}
                />
                <span
                  className={cn(
                    "font-medium",
                    isActive && "text-blue-600 dark:text-blue-400"
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
