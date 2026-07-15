"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { authApi } from "@/lib/api/auth";
import { SyncStatusBanner } from "@/components/mobile/SyncStatusBanner";
import { OfflineIndicator } from "@/components/mobile/OfflineIndicator";
import { MobileNotificationBell } from "@/components/mobile/MobileNotificationBell";
import { useWebPushRegistration } from "@/lib/hooks/useWebPushRegistration";
import { Home, Wrench, Truck, MoreHorizontal, Calendar } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { AppShellSkeleton } from "@/components/shared/AppShellSkeleton";
import { shouldUseMobileApp } from "@/lib/utils/device-context";
import { isMobileShellRole } from "@/lib/utils/post-login-redirect";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { MOBILE_APP_PERMISSIONS, PERMISSIONS } from "@/lib/utils/permissions";

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, setUser, isAuthenticated } = useAuthStore();
  const { hasAnyPermission, hasPermission } = usePermissions();
  const [mounted, setMounted] = useState(false);

  const hasMobileAccess = (currentUser: typeof user) =>
    Boolean(
      currentUser &&
        (isMobileShellRole(currentUser.role) ||
          hasAnyPermission([...MOBILE_APP_PERMISSIONS]))
    );

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

            const allowedRoles = new Set(["technician", "admin", "manager", "super-admin"]);
            if (!hasMobileAccess(currentUser) && !allowedRoles.has(currentUser.role)) {
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

        const allowedRoles = new Set(["technician", "admin", "manager", "super-admin"]);
        if (!hasMobileAccess(user) && !allowedRoles.has(user.role)) {
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

  useWebPushRegistration(Boolean(isAuthenticated && mounted));

  if (!mounted || !isAuthenticated) {
    return <AppShellSkeleton />;
  }

  const navItems = [
    {
      href: "/mobile/dashboard",
      label: "Dashboard",
      icon: Home,
      show: true,
    },
    {
      href: "/mobile/workorders",
      label: "Work Orders",
      icon: Wrench,
      show: hasAnyPermission([PERMISSIONS.VIEW_WORKORDERS, PERMISSIONS.VIEW_OWN_WORKORDERS]),
    },
    {
      href: "/mobile/schedule",
      label: "Schedule",
      icon: Calendar,
      show: hasAnyPermission([PERMISSIONS.VIEW_APPOINTMENTS, PERMISSIONS.VIEW_OWN_APPOINTMENTS]),
    },
    {
      href: "/mobile/roadside",
      label: "Roadside",
      icon: Truck,
      show: hasPermission(PERMISSIONS.VIEW_ROADSIDE),
    },
    {
      href: "/mobile/more",
      label: "More",
      icon: MoreHorizontal,
      show: true,
    },
  ].filter((item) => item.show);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Single sticky chrome: sync strip (when visible) + app header */}
      <div className="sticky top-0 z-40 border-b border-border bg-card/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/90">
        <SyncStatusBanner sticky={false} />
        <header className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary p-1.5">
              <Wrench className="h-5 w-5 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-bold text-foreground">Tech App</h1>
          </div>
          <div className="flex items-center gap-1">
            <OfflineIndicator showSync={false} />
            <MobileNotificationBell />
            <div className="hidden text-sm text-muted-foreground sm:block">
              {user?.first_name} {user?.last_name}
            </div>
          </div>
        </header>
      </div>

      <main className="flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom,0px))]">
        {children}
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card safe-area-inset-bottom"
        aria-label="Mobile navigation"
      >
        <div
          className="grid h-16"
          style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
        >
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
                  "flex min-h-[44px] flex-col items-center justify-center gap-1 text-xs transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5", isActive && "text-primary")} />
                <span className={cn("font-medium", isActive && "text-primary")}>
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
