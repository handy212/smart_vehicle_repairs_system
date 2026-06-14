"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { authApi } from "@/lib/api/auth";
import { SyncStatusBanner } from "@/components/mobile/SyncStatusBanner";
import { OfflineIndicator } from "@/components/mobile/OfflineIndicator";
import { MobileNotificationBell } from "@/components/mobile/MobileNotificationBell";
import { Home, Wrench, Truck, MoreHorizontal, Calendar } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { AppShellSkeleton } from "@/components/shared/AppShellSkeleton";
import { shouldUseMobileApp } from "@/lib/utils/device-context";
import { isMobileShellRole } from "@/lib/utils/post-login-redirect";

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
      if (!user) {
        try {
          const currentUser = await authApi.getCurrentUser();
          if (isMounted) {
            if (isMobileShellRole(currentUser.role) && !shouldUseMobileApp()) {
              router.push("/dashboard");
              return;
            }

            const allowedRoles = new Set(['technician', 'admin', 'manager', 'super-admin']);
            if (!allowedRoles.has(currentUser.role)) {
              router.push("/dashboard");
              return;
            }
            setUser(currentUser);
          }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch {
          if (isMounted) router.push("/login");
          return;
        }
      }
      if (user) {
        if (isMobileShellRole(user.role) && !shouldUseMobileApp()) {
          if (isMounted) router.push("/dashboard");
          return;
        }

        const allowedRoles = new Set(['technician', 'admin', 'manager', 'super-admin']);
        if (!allowedRoles.has(user.role)) {
          if (isMounted) router.push("/dashboard");
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
    return <AppShellSkeleton />;
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
      href: "/mobile/schedule",
      label: "Schedule",
      icon: Calendar,
    },
    {
      href: "/mobile/roadside",
      label: "Roadside",
      icon: Truck,
    },
    {
      href: "/mobile/more",
      label: "More",
      icon: MoreHorizontal,
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
        <div className="flex items-center gap-1">
          <OfflineIndicator />
          <MobileNotificationBell />
          <div className="hidden text-sm text-muted-foreground sm:block">
            {user?.first_name} {user?.last_name}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom,0px))]">
        {children}
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card safe-area-inset-bottom"
        aria-label="Mobile navigation"
      >
        <div className="grid h-16 grid-cols-5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 text-xs transition-colors min-h-[44px]",
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
