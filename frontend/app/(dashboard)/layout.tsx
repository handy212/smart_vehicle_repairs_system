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
      if (!user) {
        try {
          await ensureApiSession();
          const currentUser = await authApi.getCurrentUser();
          if (isMounted) setUser(currentUser);

          // Redirect customers to portal; technicians on phones to mobile app
          if (currentUser.role === "customer") {
            if (isMounted) router.push("/portal");
            return;
          }
          if (isMobileShellRole(currentUser.role) && shouldUseMobileApp()) {
            if (isMounted) router.push("/mobile/dashboard");
            return;
          }
        } catch {
          if (isMounted) router.push("/login");
          return;
        }
      }
      if (user) {
        // Check role if user is already loaded
        if (user.role === "customer") {
          if (isMounted) router.push("/portal");
          return;
        }
        if (isMobileShellRole(user.role) && shouldUseMobileApp()) {
          if (isMounted) router.push("/mobile/dashboard");
          return;
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

