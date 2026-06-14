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

export default function DashboardLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, setUser, isAuthenticated } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const { isModuleEnabled, isLoading: modulesLoading } = useModules();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const checkAuth = async () => {
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
        const cachedUser = useAuthStore.getState().user;
        if (!cachedUser) {
          router.push("/login");
        }
      }
    };

    if (mounted) {
      checkAuth();
    }

    return () => {
      isMounted = false;
    };
  }, [mounted, router, setUser]);

  // Module protection logic
  useEffect(() => {
    if (!mounted || modulesLoading || !user) return;

    // Get the top-level segment (e.g., /hr/employees -> hr)
    const segments = pathname.split("/").filter(Boolean);
    const topSegment = segments[0];

    // List of segments that correspond to modules
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
  }, [pathname, mounted, modulesLoading, user, isModuleEnabled, router]);

  if (!mounted || !isAuthenticated || modulesLoading) {
    return <AppShellSkeleton />;
  }

  if (user?.role === "customer") {
    return null;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}

