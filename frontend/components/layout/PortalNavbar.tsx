"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { User, LogOut } from "lucide-react";
import { PremiumIcons } from "@/components/ui/icons";
import { cn } from "@/lib/utils/cn";
import { authApi } from "@/lib/api/auth";
import { Badge } from "@/components/ui/badge";
import { NotificationDropdown } from "./NotificationDropdown";
import { useBranding } from "@/lib/hooks/useBranding";

interface UserData {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  customer_profile?: {
    id: number;
  };
}

interface PortalNavbarProps {
  onMenuToggle?: () => void;
  isSidebarOpen?: boolean;
  onToggleCollapse?: () => void;
  isSidebarCollapsed?: boolean;
  user?: UserData;
}

export function PortalNavbar({ onMenuToggle, isSidebarOpen, onToggleCollapse, isSidebarCollapsed, user }: PortalNavbarProps) {
  const router = useRouter();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [logoLoadError, setLogoLoadError] = useState(false);

  // Use shared branding hook
  const branding = useBranding("public");

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
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md sticky-navbar group/nav">
      {/* Premium top border gradient */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover/nav:opacity-100 transition-opacity duration-500" />
      
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 border-b border-border/50">
        <div className="flex justify-between items-center h-16">
          {/* Left: Logo and Menu Toggle */}
          <div className="flex items-center space-x-4">
            <button
              onClick={onMenuToggle}
              className="lg:hidden p-2 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all active:scale-95"
              aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
              aria-expanded={isSidebarOpen}
            >
              {isSidebarOpen ? <PremiumIcons.X className="w-6 h-6" /> : <PremiumIcons.Menu className="w-6 h-6" />}
            </button>

            {/* Desktop Sidebar Toggle */}
            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="hidden lg:flex p-2 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all active:scale-95"
                aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={isSidebarCollapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
              >
                {isSidebarCollapsed ? (
                  <PremiumIcons.PanelLeftOpen className="w-5 h-5 transition-transform duration-300" />
                ) : (
                  <PremiumIcons.PanelLeftClose className="w-5 h-5 transition-transform duration-300" />
                )}
              </button>
            )}

            <Link href="/portal" className="flex items-center space-x-3 group/logo" aria-label="Go to dashboard">
              {branding.logoSrc && !logoLoadError ? (
                <div className="h-9 w-9 rounded-xl overflow-hidden bg-white dark:bg-gray-900 flex items-center justify-center shadow-sm border border-border group-hover/logo:border-primary/30 transition-all group-hover/logo:shadow-md group-hover/logo:shadow-primary/5 relative">
                  <img
                    src={branding.logoSrc}
                    alt={branding.siteName}
                    key={branding.logoSrc}
                    className="h-full w-full object-contain p-1.5 transition-transform group-hover/logo:scale-110"
                    onError={() => setLogoLoadError(true)}
                  />
                </div>
              ) : (
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20 group-hover/logo:scale-110 transition-all" aria-hidden="true">
                  <PremiumIcons.Car className="w-5.5 h-5.5 text-white" />
                </div>
              )}
              <div className="flex flex-col">
                <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-br from-gray-900 via-gray-700 to-gray-500 dark:from-white dark:via-gray-200 dark:to-gray-400 hidden sm:inline tracking-tight leading-none mb-0.5">
                  {branding.siteName}
                </span>
                <span className="text-[10px] font-medium text-primary uppercase tracking-[0.2em] leading-none opacity-80 hidden sm:inline">Customer Portal</span>
              </div>
            </Link>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            <NotificationDropdown />

            {/* User Menu */}
            <div className="relative ml-2" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className={cn(
                  "flex items-center gap-2 pl-1 pr-1 sm:pr-2 py-1 rounded-full text-muted-foreground hover:bg-muted/80 transition-all border border-transparent hover:border-border dark:hover:border-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/20",
                  showUserMenu && "bg-muted border-border"
                )}
              >
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary via-primary/80 to-primary-foreground flex items-center justify-center shadow-md text-white text-xs font-bold tracking-wider ring-2 ring-background ring-offset-1 ring-offset-border/20">
                  {user?.first_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"}
                </div>
                <div className="hidden md:block text-left mr-1">
                  <p className="text-xs font-bold text-foreground leading-none mb-0.5">
                    {user?.first_name} {user?.last_name}
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-none truncate max-w-[120px] opacity-70">Customer</p>
                </div>
                <PremiumIcons.ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200 opacity-50", showUserMenu && "rotate-180 opacity-100")} />
              </button>

              {/* User Dropdown Menu */}
              {showUserMenu && (
                <div className="absolute right-0 mt-3 w-72 bg-card/95 backdrop-blur-xl rounded-2xl shadow-2xl shadow-black/10 dark:shadow-primary/5 border border-border/50 py-2 z-50 transform origin-top-right transition-all animate-in fade-in zoom-in-95 duration-200">
                  <div className="px-5 py-4 border-b border-border/50 mb-2 bg-muted/30">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary-foreground flex items-center justify-center text-white text-sm font-bold shadow-inner">
                        {user?.first_name?.[0]?.toUpperCase() || "U"}
                      </div>
                      <div className="flex flex-col">
                        <p className="text-sm font-bold text-foreground truncate">
                          {user?.first_name} {user?.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                       <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-wider py-0 px-2 border-primary/20 bg-primary/5 text-primary">
                        Customer Account
                      </Badge>
                    </div>
                  </div>

                  <div className="p-1 space-y-0.5">
                    <Link
                      href="/portal/profile"
                      onClick={() => setShowUserMenu(false)}
                      className="group flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-primary/10 hover:text-primary hover:translate-x-1"
                    >
                      <div className="p-1.5 rounded-lg bg-muted group-hover:bg-primary/20 transition-colors">
                        <User className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <span>My Profile Settings</span>
                    </Link>
                  </div>

                  <div className="my-2 border-t border-border/50 mx-2" />

                  <div className="p-1">
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        handleLogout();
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-destructive dark:text-red-400 hover:bg-destructive/10 dark:hover:bg-red-950/20 rounded-xl transition-all group hover:translate-x-1"
                    >
                      <div className="p-1.5 rounded-lg bg-destructive/5 group-hover:bg-destructive/10 transition-colors">
                        <LogOut className="w-4 h-4 group-hover:text-destructive dark:group-hover:text-red-400 transition-colors" />
                      </div>
                      <span>Sign out securely</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Dynamic bottom shadow border */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-border to-transparent opacity-50" />
    </nav>
  );
}
