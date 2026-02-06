"use client";

import { PremiumIcons } from "@/components/ui/icons";
import { useAuthStore } from "@/store/authStore";
import { User, LogOut, Settings } from "lucide-react"; // Keep User for avatar fallback if needed, or replace
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NotificationDropdown } from "@/components/layout/NotificationDropdown";
import { UserMenu } from "@/components/layout/UserMenu";
import Link from "next/link";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { searchApi, SearchResult } from "@/lib/api/search";
import { cn } from "@/lib/utils/cn";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { branchesApi, adminApi, type Branch, type SystemSetting } from "@/lib/api/admin";
import { useBranchStore } from "@/store/branchStore";
import { useTheme, setSystemThemeMode } from "@/lib/hooks/useTheme";

interface NavbarProps {
  onMenuToggle?: () => void;
  isSidebarOpen?: boolean;
  onToggleCollapse?: () => void;
  isSidebarCollapsed?: boolean;
}

export function Navbar({ onMenuToggle, isSidebarOpen, onToggleCollapse, isSidebarCollapsed }: NavbarProps) {
  const { user, logout, isAuthenticated } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeBranchId, activeBranch, setBranch } = useBranchStore();
  const previousBranchIdRef = useRef<number | null>(null);
  const hasInitializedBranchRef = useRef(false);
  const { theme, resolvedTheme } = useTheme();

  // Fetch branding settings (site_name, company_tagline, logo)
  const { data: brandingSettings, isLoading: brandingLoading } = useQuery<SystemSetting[]>({
    queryKey: ["settings", "branding"],
    queryFn: () => adminApi.settings.byCategory("branding"),
    enabled: isAuthenticated,
    staleTime: 1 * 60 * 1000, // 1 minute (reduced for better real-time updates)
    refetchOnWindowFocus: true, // Refetch when window gains focus
    refetchOnMount: true, // Always refetch when component mounts
  });

  // Apply theme_mode from system settings
  useEffect(() => {
    if (brandingSettings && !brandingLoading) {
      const themeModeSetting = brandingSettings.find(s => s.key === 'theme_mode');
      if (themeModeSetting?.value) {
        const themeMode = themeModeSetting.value.toLowerCase().trim();
        if (['light', 'dark', 'system', 'auto'].includes(themeMode)) {
          // Map 'auto' to 'system'
          const themeValue = themeMode === 'auto' ? 'system' : themeMode;
          setSystemThemeMode(themeValue as 'light' | 'dark' | 'system');
          // Trigger theme re-initialization by dispatching a custom event
          window.dispatchEvent(new CustomEvent('systemThemeModeChanged', { detail: themeValue }));
        }
      }
    }
  }, [brandingSettings, brandingLoading]);

  // Extract branding values
  const branding = useMemo(() => {
    if (!brandingSettings) {
      return {
        siteName: "Smart Vehicle Repairs",
        tagline: "Management System",
        logoPath: null,
        logoDarkPath: null,
        logoUpdatedAt: null,
        logoDarkUpdatedAt: null,
      };
    }

    const getSetting = (key: string): string | null => {
      const setting = brandingSettings.find((s) => s.key === key);
      return setting?.value && setting.value.trim() !== "" ? setting.value : null;
    };

    const getSettingUpdatedAt = (key: string): string | null => {
      const setting = brandingSettings.find((s) => s.key === key);
      return setting?.updated_at || null;
    };

    return {
      siteName: getSetting("site_name") || "Smart Vehicle Repairs",
      tagline: getSetting("company_tagline") || "Management System",
      logoPath: getSetting("logo_path"),
      logoDarkPath: getSetting("logo_dark_path"),
      logoUpdatedAt: getSettingUpdatedAt("logo_path"),
      logoDarkUpdatedAt: getSettingUpdatedAt("logo_dark_path"),
    };
  }, [brandingSettings]);

  // Determine which logo to use based on theme
  const logoToUse = useMemo(() => {
    const isDark = resolvedTheme === "dark" || theme === "dark";
    if (isDark && branding.logoDarkPath) {
      return {
        path: branding.logoDarkPath,
        cacheKey: branding.logoDarkUpdatedAt ? new Date(branding.logoDarkUpdatedAt).getTime() : Date.now(),
      };
    }
    if (branding.logoPath) {
      return {
        path: branding.logoPath,
        cacheKey: branding.logoUpdatedAt ? new Date(branding.logoUpdatedAt).getTime() : Date.now(),
      };
    }
    return null;
  }, [branding.logoPath, branding.logoDarkPath, branding.logoUpdatedAt, branding.logoDarkUpdatedAt, resolvedTheme, theme]);

  // Get media base URL from API URL (remove /api suffix)
  const mediaBaseUrl = useMemo(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
    // Remove /api from the end if present
    return apiUrl.replace(/\/api\/?$/, "");
  }, []);

  const getMediaUrl = useCallback(
    (path: string, cacheKey?: number) => {
      if (path.startsWith("http")) {
        return cacheKey ? `${path}${path.includes("?") ? "&" : "?"}v=${cacheKey}` : path;
      }
      const url = `${mediaBaseUrl}/media/${path}`;
      return cacheKey ? `${url}${url.includes("?") ? "&" : "?"}v=${cacheKey}` : url;
    },
    [mediaBaseUrl]
  );

  const logoSrc = useMemo(
    () => (logoToUse ? getMediaUrl(logoToUse.path, logoToUse.cacheKey) : null),
    [logoToUse, getMediaUrl]
  );



  const {
    data: accessibleBranchesData,
  } = useQuery<Branch[]>({
    queryKey: ["branches", "accessible"],
    queryFn: () => branchesApi.accessible(),
    enabled: isAuthenticated,
  });

  const branchOptions = accessibleBranchesData ?? [];
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
      queryClient.clear();
      if (typeof window !== "undefined") {
        window.location.reload();
      } else {
        router.refresh();
      }
    }

    previousBranchIdRef.current = activeBranchId ?? null;
  }, [activeBranchId, queryClient, router]);





  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-card/80 bg-background/80 border-b border-border/50 border-border/50 shadow-sm backdrop-blur-xl">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Left: Menu Toggle + Logo/Brand */}
          <div className="flex items-center flex-shrink-0 space-x-3">
            {/* Mobile Menu Toggle */}
            <button
              onClick={onMenuToggle}
              className="lg:hidden p-2 rounded-lg text-muted-foreground text-muted-foreground hover:text-foreground dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary"
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
                className="hidden lg:block p-2 rounded-lg text-muted-foreground text-muted-foreground hover:text-foreground dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary"
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
              {logoSrc ? (
                <div className="h-8 w-8 rounded-lg overflow-hidden bg-card flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow border border-border border-border relative">
                  <img
                    src={logoSrc}
                    alt={branding.siteName}
                    key={`${logoToUse?.path ?? "logo"}-${logoToUse?.cacheKey ?? "0"}`} // Force re-render when logo changes
                    className="h-full w-full object-contain p-1"
                    onError={(e) => {
                      if (!logoToUse) return;
                      // Log error for debugging
                      console.error("Logo failed to load:", {
                        path: logoToUse.path,
                        fullUrl: logoSrc,
                        attemptedUrl: (e.target as HTMLImageElement).src,
                        error: e,
                      });
                      // Hide image and show fallback icon if logo fails to load
                      const target = e.target as HTMLImageElement;
                      if (target) {
                        target.style.display = "none";
                        const parent = target.parentElement;
                        if (parent && !parent.querySelector(".fallback-icon")) {
                          const iconWrapper = document.createElement("div");
                          iconWrapper.className = "fallback-icon absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary to-primary/90 rounded-lg";
                          const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                          icon.setAttribute("class", "w-5 h-5 text-white");
                          icon.setAttribute("fill", "none");
                          icon.setAttribute("viewBox", "0 0 24 24");
                          icon.setAttribute("stroke", "currentColor");
                          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                          path.setAttribute("stroke-linecap", "round");
                          path.setAttribute("stroke-linejoin", "round");
                          path.setAttribute("stroke-width", "2");
                          path.setAttribute("d", "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4");
                          icon.appendChild(path);
                          iconWrapper.appendChild(icon);
                          parent.appendChild(iconWrapper);
                        }
                      }
                    }}
                    onLoad={() => {
                      if (!logoToUse) return;
                      console.log("✅ Logo loaded successfully:", {
                        path: logoToUse.path,
                        fullUrl: logoSrc,
                      });
                      // Remove any fallback icon when logo loads successfully
                      const img = document.querySelector(`img[alt="${branding.siteName}"]`);
                      if (img) {
                        const parent = img.parentElement;
                        if (parent) {
                          const fallback = parent.querySelector(".fallback-icon");
                          if (fallback) {
                            fallback.remove();
                          }
                        }
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/90 flex items-center justify-center shadow-lg shadow-primary/20 group-hover:shadow-primary/30 transition-all">
                  <PremiumIcons.Car className="w-5 h-5 text-white" />
                </div>
              )}
              <div className="hidden sm:block">
                <h1 className="text-lg font-bold text-foreground text-foreground group-hover:text-primary dark:group-hover:text-orange-400 transition-colors">
                  {branding.siteName}
                </h1>
                {branding.tagline && (
                  <p className="text-xs text-muted-foreground text-muted-foreground hidden lg:block">{branding.tagline}</p>
                )}
              </div>
            </Link>
          </div>

          {/* Global Search Trigger (Centered) */}
          <div className="hidden lg:flex items-center flex-1 max-w-md mx-4 lg:mx-8">
            <button
              onClick={() => {
                const event = new KeyboardEvent('keydown', {
                  key: 'k',
                  ctrlKey: true,
                  bubbles: true
                });
                document.dispatchEvent(event);
              }}
              className="group flex items-center gap-3 px-4 py-2 w-full bg-muted border border-border border-border rounded-xl text-muted-foreground hover:text-muted-foreground dark:hover:text-gray-300 hover:bg-card dark:hover:bg-gray-700 transition-all text-sm shadow-sm hover:shadow-md"
            >
              <PremiumIcons.Search className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              <span className="flex-1 text-left font-medium opacity-70">Search...</span>
              <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded border border-border dark:border-gray-600 bg-card group-hover:border-orange-200 dark:group-hover:border-orange-900 transition-colors shadow-none">
                <span className="text-[10px] font-bold uppercase tracking-tighter">Ctrl K</span>
              </div>
            </button>
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center space-x-2 flex-shrink-0">

            {/* Theme Toggle */}
            <ThemeToggle />

            {/* Notifications */}
            <NotificationDropdown />

            {/* User Menu */}
            <UserMenu />
          </div>
        </div>

      </div>
    </nav>
  );
}

