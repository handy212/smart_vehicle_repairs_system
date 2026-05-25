"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AppShellSkeleton } from "@/components/shared/AppShellSkeleton";
import { authApi } from "@/lib/api/auth";
import { useModules } from "@/lib/hooks/useModules";

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
          const currentUser = await authApi.getCurrentUser();
          if (isMounted) setUser(currentUser);

          // Redirect customers to portal; technicians to mobile app
          if (currentUser.role === "customer") {
            if (isMounted) router.push("/portal");
            return;
          }
          if (currentUser.role === "technician") {
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
        if (user.role === "technician") {
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

  if (user?.role === "customer" || user?.role === "technician") {
    return null;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}

