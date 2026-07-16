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
    <nav
      className="fixed top-0 left-0 right-0 z-50 border-b border-[color:var(--outline-variant)] bg-[var(--panel-bg)] shadow-workshop"
      style={{ height: "var(--header-height)" }}
    >
      <div className="h-full px-4 sm:px-5 lg:px-6">
        <div className="flex h-full items-center justify-between">
          <div className="flex flex-shrink-0 items-center gap-2.5">
            <button
              onClick={onMenuToggle}
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary lg:hidden"
              aria-label="Toggle menu"
            >
              {isSidebarOpen ? (
                <PremiumIcons.X className="h-5 w-5" />
              ) : (
                <PremiumIcons.Menu className="h-5 w-5" />
              )}
            </button>

            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="hidden rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary lg:block"
                aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={isSidebarCollapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
              >
                {isSidebarCollapsed ? (
                  <PremiumIcons.PanelLeftOpen className="h-5 w-5 transition-transform duration-200" />
                ) : (
                  <PremiumIcons.PanelLeftClose className="h-5 w-5 transition-transform duration-200" />
                )}
              </button>
            )}

            <Link href="/dashboard" className="group flex items-center gap-2.5">
              {branding.logoSrc && failedLogoSrc !== branding.logoSrc ? (
                <div className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-[color:var(--outline-variant)] bg-card">
                  <img
                    src={branding.logoSrc}
                    alt={branding.siteName}
                    className="h-full w-full object-contain p-1"
                    onError={() => setFailedLogoSrc(branding.logoSrc)}
                  />
                </div>
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors group-hover:bg-primary-container">
                  <PremiumIcons.Car className="h-5 w-5" />
                </div>
              )}
              <div className="hidden sm:block">
                <h1 className="text-base font-bold tracking-tight text-foreground transition-colors group-hover:text-primary">
                  {branding.siteName}
                </h1>
                {branding.tagline && (
                  <p className="hidden text-xs text-muted-foreground lg:block">{branding.tagline}</p>
                )}
              </div>
            </Link>
          </div>

          <div className="mx-4 hidden max-w-md flex-1 items-center gap-3 lg:mx-8 lg:flex">
            <button
              onClick={() => {
                const event = new KeyboardEvent("keydown", {
                  key: "k",
                  ctrlKey: true,
                  bubbles: true,
                });
                document.dispatchEvent(event);
              }}
              className="group flex w-full items-center gap-3 rounded-lg border border-[color:var(--outline-variant)] bg-muted/50 px-3.5 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:bg-muted"
              aria-label="Open search (Ctrl+K)"
            >
              <PremiumIcons.Search className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
              <span className="flex-1 text-left font-medium opacity-70">Search…</span>
              <kbd className="rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Ctrl K
              </kbd>
            </button>
            <QuickActionsMenu />
          </div>

          <div className="flex flex-shrink-0 items-center gap-0.5">
            <NotificationDropdown />
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </div>
    </nav>
  );
}
