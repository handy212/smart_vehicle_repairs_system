"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { User, LogOut, Settings } from "lucide-react"; // Keep specialized icons for now if missing in Premium
import { PremiumIcons } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils/cn";
import { authApi } from "@/lib/api/auth";
import { adminApi, type SystemSetting } from "@/lib/api/admin";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/lib/hooks/useTheme";
import { Badge } from "@/components/ui/badge";
import { NotificationDropdown } from "./NotificationDropdown";

interface PortalNavbarProps {
  onMenuToggle?: () => void;
  isSidebarOpen?: boolean;
  onToggleCollapse?: () => void;
  isSidebarCollapsed?: boolean;
  user?: any;
}

export function PortalNavbar({ onMenuToggle, isSidebarOpen, onToggleCollapse, isSidebarCollapsed, user }: PortalNavbarProps) {
  const router = useRouter();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { theme, resolvedTheme } = useTheme();

  // Fetch branding settings (site_name, company_tagline, logo)
  const { data: brandingSettings } = useQuery<SystemSetting[]>({
    queryKey: ["settings", "branding", "public"],
    queryFn: () => adminApi.settings.publicBranding(),
    staleTime: 5 * 60 * 1000,
  });

  // Extract branding values
  const branding = useMemo(() => {
    if (!brandingSettings) {
      return {
        siteName: "Smart Vehicle Repairs",
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

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await authApi.logout();
      router.push("/login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-card/80 bg-background/80 border-b border-border/50 border-border/50 shadow-sm backdrop-blur-xl sticky-navbar">
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Left: Logo and Menu Toggle */}
          <div className="flex items-center space-x-4">
            <button
              onClick={onMenuToggle}
              className="lg:hidden p-2 rounded-md text-muted-foreground text-muted-foreground hover:text-foreground dark:hover:text-gray-300 hover:bg-gray-100 hover:bg-muted"
              aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
              aria-expanded={isSidebarOpen}
            >
              {isSidebarOpen ? <PremiumIcons.X className="w-6 h-6" /> : <PremiumIcons.Menu className="w-6 h-6" />}
            </button>

            {/* Desktop Sidebar Toggle */}
            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="hidden lg:block p-2 rounded-lg text-muted-foreground text-muted-foreground hover:text-foreground dark:hover:text-gray-300 hover:bg-gray-100 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary"
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

            <Link href="/portal" className="flex items-center space-x-2" aria-label="Go to dashboard">
              {logoSrc ? (
                <div className="h-8 w-8 rounded-lg overflow-hidden bg-card flex items-center justify-center shadow-sm border border-border border-border relative">
                  <img
                    src={logoSrc}
                    alt={branding.siteName}
                    key={`${logoToUse?.path ?? "logo"}-${logoToUse?.cacheKey ?? "0"}`}
                    className="h-full w-full object-contain p-1"
                  />
                </div>
              ) : (
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center shadow-lg shadow-primary/20" aria-hidden="true">
                  <PremiumIcons.Car className="w-5 h-5 text-white" />
                </div>
              )}
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 hidden sm:inline tracking-tight">
                {branding.siteName}
              </span>
            </Link>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center space-x-3">
            {/* Notifications */}
            <NotificationDropdown />

            {/* Theme Toggle */}
            <ThemeToggle />

            {/* User Menu */}
            <div className="relative ml-2" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-3 pl-1 pr-2 py-1 rounded-full text-muted-foreground text-muted-foreground hover:bg-gray-100 hover:bg-muted transition-all border border-transparent hover:border-border dark:hover:border-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center shadow-sm text-white text-xs font-bold tracking-wider ring-2 ring-white dark:ring-gray-900">
                  {user?.first_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"}
                </div>
                <div className="hidden sm:block text-left mr-1">
                  <p className="text-xs font-bold text-foreground text-foreground leading-none mb-0.5">
                    {user?.first_name} {user?.last_name}
                  </p>
                  <p className="text-[10px] text-muted-foreground text-muted-foreground leading-none truncate max-w-[100px] opacity-80">{user?.email}</p>
                </div>
              </button>

              {/* User Dropdown Menu */}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-64 bg-card rounded-xl shadow-xl border border-border border-border py-2 z-50 transform origin-top-right transition-all animate-in fade-in zoom-in-95 duration-200">
                  <div className="px-5 py-3 border-b border-border border-border mb-1 bg-muted/50 bg-muted/50">
                    <p className="text-sm font-semibold text-foreground text-foreground">Signed in as</p>
                    <p className="text-xs text-muted-foreground text-muted-foreground truncate mt-0.5 font-medium">{user?.email}</p>
                  </div>

                  <div className="p-1">
                    <Link
                      href="/portal/profile"
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground text-foreground hover:bg-primary/10 dark:hover:bg-orange-900/20 hover:text-primary dark:hover:text-orange-400 rounded-lg transition-colors group"
                    >
                      <User className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      <span>My Profile</span>
                    </Link>
                  </div>

                  <div className="my-1 border-t border-border border-border" />

                  <div className="p-1">
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        handleLogout();
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors group"
                    >
                      <LogOut className="w-4 h-4 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors" />
                      <span>Sign out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

