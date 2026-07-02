"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AppShellSkeleton } from "@/components/shared/AppShellSkeleton";
import { authApi } from "@/lib/api/auth";
import { ensureApiSession } from "@/lib/auth/session";
import { useModules } from "@/lib/hooks/useModules";
import { shouldUseMobileApp } from "@/lib/utils/device-context";
import { isMobileShellRole } from "@/lib/utils/post-login-redirect";
import { useWebPushRegistration } from "@/lib/hooks/useWebPushRegistration";

export default function DashboardLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, setUser, isAuthenticated, hasHydrated } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const { isModuleEnabled, isLoading: modulesLoading, canViewModuleManagement } = useModules();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const checkAuth = async () => {
      const hadCachedSession = useAuthStore.getState().isAuthenticated && !!useAuthStore.getState().user;

      try {
        await ensureApiSession();
        const currentUser = await authApi.getCurrentUser();
        if (!isMounted) return;

        setUser(currentUser);

        if (currentUser.role === "customer") {
          router.push("/portal");
          return;
        }
        if (isMobileShellRole(currentUser.role) && shouldUseMobileApp()) {
          router.push("/mobile/dashboard");
        }
      } catch {
        if (!isMounted) return;
        if (!hadCachedSession) {
          router.push("/login");
        }
      } finally {
        if (isMounted) {
          setSessionChecked(true);
        }
      }
    };

    if (mounted && hasHydrated) {
      checkAuth();
    }

    return () => {
      isMounted = false;
    };
  }, [mounted, hasHydrated, router, setUser]);

  // Module protection logic
  useEffect(() => {
    if (!mounted || !sessionChecked || (canViewModuleManagement && modulesLoading) || !user) return;

    const segments = pathname.split("/").filter(Boolean);
    const topSegment = segments[0];

    const moduleSegments = [
      "hr", "inventory", "accounting", "billing", "roadside",
      "diagnosis", "inspections", "fixed-assets", "subscriptions",
      "reports", "sms", "appointments", "workorders", "gatepass",
      "customers", "vehicles", "chat"
    ];

    if (topSegment && moduleSegments.includes(topSegment)) {
      if (!isModuleEnabled(topSegment)) {
        router.push("/dashboard");
      }
    }
  }, [pathname, mounted, sessionChecked, canViewModuleManagement, modulesLoading, user, isModuleEnabled, router]);

  const waitingForModules = canViewModuleManagement && modulesLoading;
  const waitingForAuth = !hasHydrated || (!isAuthenticated && !sessionChecked);

  useWebPushRegistration(
    Boolean(isAuthenticated && mounted && sessionChecked && user?.role !== "customer")
  );

  if (!mounted || waitingForAuth || waitingForModules) {
    return <AppShellSkeleton />;
  }

  if (user?.role === "customer") {
    return null;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
