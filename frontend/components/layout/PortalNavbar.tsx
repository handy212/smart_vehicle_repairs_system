"use client";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { User, LogOut } from "lucide-react";
import { PremiumIcons } from "@/components/ui/icons";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { cn } from "@/lib/utils/cn";
import { authApi } from "@/lib/api/auth";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Badge } from "@/components/ui/badge";
import { NotificationDropdown } from "./NotificationDropdown";
import { useBranding } from "@/lib/hooks/useBranding";

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
  const [logoLoadError, setLogoLoadError] = useState(false);

  // Use shared branding hook
  const branding = useBranding("public");

  // Reset logo error when source changes
  useEffect(() => {
    setLogoLoadError(false);
  }, [branding.logoSrc]);

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
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 border-b border-border/50 shadow-sm backdrop-blur-xl sticky-navbar">
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          // Left: Logo and Menu Toggle
          <div className="flex items-center space-x-4">
            <button
              onClick={onMenuToggle}
              className="lg:hidden p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
              aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
              aria-expanded={isSidebarOpen}
            >
              {isSidebarOpen ? <PremiumIcons.X className="w-6 h-6" /> : <PremiumIcons.Menu className="w-6 h-6" />}
            </button>

            // Desktop Sidebar Toggle
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

            <Link href="/portal" className="flex items-center space-x-2" aria-label="Go to dashboard">
              {branding.logoSrc && !logoLoadError ? (
                <div className="h-8 w-8 rounded-lg overflow-hidden bg-card flex items-center justify-center shadow-sm border border-border relative">
                  <img
                    src={branding.logoSrc}
                    alt={branding.siteName}
                    className="h-full w-full object-contain p-1"
                    onError={() => setLogoLoadError(true)}
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

          // Right: Actions
          <div className="flex items-center space-x-3">
            // Notifications
            <NotificationDropdown />

            // Theme Toggle
            <ThemeToggle />

            // User Menu
            <div className="relative ml-2" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-3 pl-1 pr-2 py-1 rounded-full text-muted-foreground hover:bg-muted transition-all border border-transparent hover:border-border dark:hover:border-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center shadow-sm text-white text-xs font-bold tracking-wider ring-2 ring-white dark:ring-gray-900">
                  {user?.first_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"}
                </div>
                <div className="hidden sm:block text-left mr-1">
                  <p className="text-xs font-bold text-foreground leading-none mb-0.5">
                    {user?.first_name} {user?.last_name}
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-none truncate max-w-[100px] opacity-80">{user?.email}</p>
                </div>
              </button>

              // User Dropdown Menu
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-64 bg-card rounded-xl shadow-xl border border-border py-2 z-50 transform origin-top-right transition-all animate-in fade-in zoom-in-95 duration-200">
                  <div className="px-5 py-3 border-b border-border mb-1 bg-muted/50">
                    <p className="text-sm font-semibold text-foreground">Signed in as</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5 font-medium">{user?.email}</p>
                  </div>

                  <div className="p-1">
                    <Link
                      href="/portal/profile"
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-primary/10 dark:hover:bg-orange-900/20 hover:text-primary dark:hover:text-orange-400 rounded-lg transition-colors group"
                    >
                      <User className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      <span>My Profile</span>
                    </Link>
                  </div>

                  <div className="my-1 border-t border-border" />

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

