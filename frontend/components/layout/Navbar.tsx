"use client";

import { PremiumIcons } from "@/components/ui/icons";
import { useAuthStore } from "@/store/authStore";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Button } from "@/components/ui/button";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { authApi } from "@/lib/api/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NotificationDropdown } from "@/components/layout/NotificationDropdown";
import { UserMenu } from "@/components/layout/UserMenu";
import { QuickActionsMenu } from "@/components/layout/QuickActionsMenu";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import Link from "next/link";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { cn } from "@/lib/utils";
import { branchesApi, adminApi, type Branch, type SystemSetting } from "@/lib/api/admin";
import { useBranchStore } from "@/store/branchStore";
import { setSystemThemeMode } from "@/lib/hooks/useTheme";
import { useBranding } from "@/lib/hooks/useBranding";

interface NavbarProps {
  onMenuToggle?: () => void;
  isSidebarOpen?: boolean;
  onToggleCollapse?: () => void;
  isSidebarCollapsed?: boolean;
}

export function Navbar({ onMenuToggle, isSidebarOpen, onToggleCollapse, isSidebarCollapsed }: NavbarProps) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { user, logout, isAuthenticated } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeBranchId, activeBranch, setBranch } = useBranchStore();
  const previousBranchIdRef = useRef<number | null>(null);
  const hasInitializedBranchRef = useRef(false);
  const [failedLogoSrc, setFailedLogoSrc] = useState<string | null>(null);

  // Use shared branding hook (authenticated variant for dashboard)
  const branding = useBranding("authenticated");

  // Fetch branding settings for theme_mode (still needed for side-effects)
  const { data: brandingSettings, isLoading: brandingLoading } = useQuery<SystemSetting[]>({
    queryKey: ["settings", "branding"],
    queryFn: async () => {
      try {
        return await adminApi.settings.byCategory("branding");
      } catch (error) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 401 || status === 403) {
          return adminApi.settings.publicBranding();
        }
        throw error;
      }
    },
    enabled: isAuthenticated,
    staleTime: 1 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  // Apply theme_mode from system settings
  useEffect(() => {
    if (brandingSettings && Array.isArray(brandingSettings) && !brandingLoading) {
      if (localStorage.getItem('theme_override') === 'true') return;
      const themeModeSetting = brandingSettings.find(s => s.key === 'theme_mode');
      if (themeModeSetting?.value) {
        const themeMode = themeModeSetting.value.toLowerCase().trim();
        const themeValue = themeMode === 'dark' || themeMode === 'perfex-dark'
          ? 'perfex-dark'
          : themeMode === 'auto' || themeMode === 'system'
            ? 'system'
            : 'perfex';
        if (themeMode !== themeValue || ['perfex', 'perfex-dark', 'system'].includes(themeMode)) {
          setSystemThemeMode(themeValue);
          window.dispatchEvent(new CustomEvent('systemThemeModeChanged', { detail: themeValue }));
        }
      }
    }
  }, [brandingSettings, brandingLoading]);

  const {
    data: accessibleBranchesData,
  } = useQuery<Branch[]>({
    queryKey: ["branches", "accessible"],
    queryFn: () => branchesApi.accessible(),
    enabled: isAuthenticated,
  });

  const branchOptions = Array.isArray(accessibleBranchesData)
    ? accessibleBranchesData
    : [];
  const sortedBranches = [...branchOptions].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!sortedBranches.length) return;

    if (!activeBranchId) {
      setBranch(sortedBranches[0]);
      return;
    }

    const matched = sortedBranches.find((branch) => branch.id === activeBranchId);
    if (!matched) {
      setBranch(sortedBranches[0]);
      return;
    }

    if (!activeBranch || matched.id !== activeBranch.id) {
      setBranch(matched);
      return;
    }

    hasInitializedBranchRef.current = true;
  }, [sortedBranches, activeBranchId, isAuthenticated, activeBranch, setBranch]);

  useEffect(() => {
    if (!hasInitializedBranchRef.current) {
      previousBranchIdRef.current = activeBranchId ?? null;
      return;
    }

    if (
      previousBranchIdRef.current !== null &&
      activeBranchId !== null &&
      activeBranchId !== previousBranchIdRef.current
    ) {
      void queryClient.invalidateQueries();
      router.refresh();
    }

    previousBranchIdRef.current = activeBranchId ?? null;
  }, [activeBranchId, queryClient, router]);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background shadow-sm" style={{ height: 'var(--header-height)' }}>
      <div className="px-4 sm:px-6 lg:px-8 h-full">
        <div className="flex justify-between items-center h-full">
          {/* Left: Menu Toggle + Logo/Brand */}
          <div className="flex items-center flex-shrink-0 space-x-3">
            {/* Mobile Menu Toggle */}
            <button
              onClick={onMenuToggle}
              className="lg:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="Toggle menu"
            >
              {isSidebarOpen ? (
                <PremiumIcons.X className="w-6 h-6" />
              ) : (
                <PremiumIcons.Menu className="w-6 h-6" />
              )}
            </button>

            {/* Desktop Sidebar Toggle */}
            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="hidden lg:block p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary"
                aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={isSidebarCollapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
              >
                {isSidebarCollapsed ? (
                  <PremiumIcons.PanelLeftOpen className="w-5 h-5 transition-transform duration-200" />
                ) : (
                  <PremiumIcons.PanelLeftClose className="w-5 h-5 transition-transform duration-200" />
                )}
              </button>
            )}

            <Link href="/dashboard" className="flex items-center space-x-2 group">
              {branding.logoSrc && failedLogoSrc !== branding.logoSrc ? (
                <div className="h-8 w-8 rounded-lg overflow-hidden bg-card flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow border border-border relative">
                  <img
                    src={branding.logoSrc}
                    alt={branding.siteName}
                    className="h-full w-full object-contain p-1"
                    onError={() => setFailedLogoSrc(branding.logoSrc)}
                  />
                </div>
              ) : (
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/90 flex items-center justify-center shadow-lg shadow-primary/20 group-hover:shadow-primary/30 transition-all">
                  <PremiumIcons.Car className="w-5 h-5 text-white" />
                </div>
              )}
              <div className="hidden sm:block">
                <h1 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                  {branding.siteName}
                </h1>
                {branding.tagline && (
                  <p className="text-xs text-muted-foreground hidden lg:block">{branding.tagline}</p>
                )}
              </div>
            </Link>
          </div>

          {/* Global Search Trigger (Centered) */}
          <div className="hidden lg:flex items-center flex-1 max-w-md mx-4 lg:mx-8 gap-3">
            <button
              onClick={() => {
                const event = new KeyboardEvent('keydown', {
                  key: 'k',
                  ctrlKey: true,
                  bubbles: true
                });
                document.dispatchEvent(event);
              }}
              className="group flex items-center gap-3 px-3.5 py-2 w-full rounded-xl border border-border bg-card text-muted-foreground text-sm shadow-sm transition-colors hover:border-primary/20 hover:bg-muted/70"
              aria-label="Open search (Ctrl+K)"
            >
              <PremiumIcons.Search className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              <span className="flex-1 text-left font-medium opacity-70">Search...</span>
              <div className="flex items-center gap-1.5 rounded border border-border bg-card px-1.5 py-0.5 shadow-none transition-colors group-hover:border-primary/20">
                <span className="text-[10px] font-bold uppercase tracking-tighter">Ctrl K</span>
              </div>
            </button>
            <QuickActionsMenu />
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Notifications */}
            <NotificationDropdown />

            {/* Theme Switcher */}
            <ThemeToggle />

            {/* User Menu */}
            <UserMenu />
          </div>
        </div>
      </div>
    </nav>
  );
}
