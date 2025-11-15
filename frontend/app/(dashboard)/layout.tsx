"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { authApi } from "@/lib/api/auth";

export default function DashboardLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, setUser, isAuthenticated } = useAuthStore();
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

      // If user is not in store, fetch it
      if (!user && token) {
        try {
          const currentUser = await authApi.getCurrentUser();
          setUser(currentUser);
          
          // Redirect customers to portal
          if (currentUser.role === "customer") {
            router.push("/portal");
            return;
          }
        } catch (error) {
          // Token invalid, redirect to login
          router.push("/login");
        }
      } else if (user) {
        // Check role if user is already loaded
        if (user.role === "customer") {
          router.push("/portal");
          return;
        }
      }
    };

    if (mounted) {
      checkAuth();
    }
  }, [user, setUser, router, mounted]);

  if (!mounted || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render dashboard if user is a customer (will be redirected)
  if (user?.role === "customer") {
    return null;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}

