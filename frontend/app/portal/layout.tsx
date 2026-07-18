"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorBoundary } from "@/components/error-boundary";
import dynamic from "next/dynamic";
import { PortalMobileActionsBar } from "./components/PortalMobileActionsBar";
import { AppShellSkeleton } from "@/components/shared/AppShellSkeleton";
import { ImpersonationBanner } from "@/components/auth/ImpersonationBanner";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";

// Lazy load sidebar and navbar for better performance
const PortalNavbar = dynamic(() => import("@/components/layout/PortalNavbar").then(mod => ({ default: mod.PortalNavbar })), {
  ssr: true,
  loading: () => (
    <div className="fixed top-0 left-0 right-0 z-50 bg-card border-b border-border h-16" />
  ),
});

const PortalSidebar = dynamic(() => import("@/components/layout/PortalSidebar").then(mod => ({ default: mod.PortalSidebar })), {
  ssr: false,
});

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  const { data: user, isLoading } = useCurrentUser({
    ensureSession: true,
    syncStore: true,
  });

  // Handle hydration and localStorage
  useEffect(() => {
    setMounted(true);

    const sidebarCollapsed = localStorage.getItem("portalSidebarCollapsed") === "true";
    setIsSidebarCollapsed(sidebarCollapsed);

    // Check if desktop (debounced)
    const checkDesktop = () => {
      setIsDesktop(window.innerWidth >= 1024);
      if (window.innerWidth >= 1024) {
        setIsSidebarOpen(true);
      }
    };

    let resizeTimer: ReturnType<typeof setTimeout>;
    const debouncedCheckDesktop = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(checkDesktop, 150);
    };

    checkDesktop();
    window.addEventListener("resize", debouncedCheckDesktop);
    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", debouncedCheckDesktop);
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;

    if (!isLoading && !user) {
      router.push("/login");
      return;
    }

    // Check if user has customer role - redirect non-customers to dashboard
    if (user && user.role !== "customer") {
      router.push("/dashboard");
      return;
    }
  }, [user, isLoading, mounted, router]);

  if (!mounted || isLoading || !user) {
    return <AppShellSkeleton />;
  }

  // Calculate sidebar width
  const sidebarWidthExpanded = 288; // w-72 = 18rem = 288px
  const sidebarWidthCollapsed = 80; // w-20 = 5rem = 80px
  const sidebarCollapsed = mounted ? isSidebarCollapsed : false;
  const sidebarWidth = sidebarCollapsed ? sidebarWidthCollapsed : sidebarWidthExpanded;

  // On mobile, sidebar is hidden by default (overlay), on desktop it's always visible
  const totalMargin = isDesktop ? sidebarWidth : 0;

  return (
    <div className="min-h-screen bg-muted bg-background">
      <ImpersonationBanner />
      <PortalNavbar
        onMenuToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        isSidebarOpen={isSidebarOpen}
        onToggleCollapse={() => {
          const newCollapsed = !isSidebarCollapsed;
          setIsSidebarCollapsed(newCollapsed);
          if (mounted) {
            localStorage.setItem("portalSidebarCollapsed", newCollapsed.toString());
          }
        }}
        isSidebarCollapsed={mounted ? isSidebarCollapsed : false}
        user={user}
      />
      <PortalSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        isCollapsed={mounted ? isSidebarCollapsed : false}
      />
      <main
        className="min-h-screen px-3 sm:px-4 md:px-6 lg:px-8 py-0 pb-24 sm:pb-6 lg:pb-8 transition-all duration-300"
        style={{
          marginLeft: `${totalMargin}px`,
          paddingTop: '5rem' // 80px to account for header (64px) + extra space
        }}
      >
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </main>
      <PortalMobileActionsBar />
    </div>
  );
}

