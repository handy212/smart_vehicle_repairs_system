"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
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
      const token = localStorage.getItem("access_token");

      if (!token) {
        if (isMounted) router.push("/login");
        return;
      }

      // If user is not in store, fetch it
      if (!user && token) {
        try {
          const currentUser = await authApi.getCurrentUser();
          if (isMounted) setUser(currentUser);

          // Redirect customers to portal
          if (currentUser.role === "customer") {
            if (isMounted) router.push("/portal");
            return;
          }
        } catch (error) {
          // Token invalid, redirect to login
          if (isMounted) router.push("/login");
        }
      } else if (user) {
        // Check role if user is already loaded
        if (user.role === "customer") {
          if (isMounted) router.push("/portal");
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
      "customers", "vehicles"
    ];

    if (topSegment && moduleSegments.includes(topSegment)) {
      if (!isModuleEnabled(topSegment) && user.role !== "super-admin") {
        router.push("/dashboard");
      }
    }
  }, [pathname, mounted, modulesLoading, user, isModuleEnabled, router]);

  if (!mounted || !isAuthenticated || modulesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (user?.role === "customer") {
    return null;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}

