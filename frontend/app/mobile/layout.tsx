"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { authApi } from "@/lib/api/auth";
import { SyncStatusBanner } from "@/components/mobile/SyncStatusBanner";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { BellRing, Home, Wrench, ClipboardCheck, Clock, Truck } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, setUser, isAuthenticated } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const checkAuth = async () => {
      const token = localStorage.getItem("access_token");

      if (!token) {
        if (isMounted) router.push("/login");
        return;
      }

      if (!user && token) {
        try {
          const currentUser = await authApi.getCurrentUser();
          if (isMounted) setUser(currentUser);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
          if (isMounted) router.push("/login");
        }
      }
    };

    if (mounted) {
      checkAuth();
    }

    return () => {
      isMounted = false;
    };
  }, [user, setUser, router, mounted]);

  // Guard to prevent repeated attempts per page load
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const hasAttemptedPushRef = useRef(false);

  if (!mounted || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
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
    {
      href: "/mobile/roadside",
      label: "Roadside",
      icon: Truck,
    },
  ];

  return (
    <div className="min-h-screen bg-muted bg-background flex flex-col">
      <SyncStatusBanner />
      <header className="bg-card border-b border-border h-14 px-4 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="bg-primary p-1.5 rounded-lg">
            <Wrench className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-lg font-bold text-foreground">
            Tech App
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-sm text-muted-foreground">
            {user?.first_name} {user?.last_name}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 safe-area-inset-bottom">
        <div className="grid grid-cols-5 h-16">
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
                    ? "text-primary"
                    : "text-muted-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5",
                    isActive && "text-primary"
                  )}
                />
                <span
                  className={cn(
                    "font-medium",
                    isActive && "text-primary"
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
