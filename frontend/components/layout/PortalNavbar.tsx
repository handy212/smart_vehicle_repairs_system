"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { User, LogOut, Settings } from "lucide-react"; // Keep specialized icons for now if missing in Premium
import { PremiumIcons } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils/cn";
import { authApi } from "@/lib/api/auth";
import { Badge } from "@/components/ui/badge";
import { NotificationDropdown } from "./NotificationDropdown";

interface PortalNavbarProps {
  onMenuToggle?: () => void;
  isSidebarOpen?: boolean;
  user?: any;
}

export function PortalNavbar({ onMenuToggle, isSidebarOpen, user }: PortalNavbarProps) {
  const router = useRouter();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

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
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-gray-900/80 border-b border-gray-200/50 dark:border-gray-800/50 shadow-sm backdrop-blur-xl sticky-navbar">
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Left: Logo and Menu Toggle */}
          <div className="flex items-center space-x-4">
            <button
              onClick={onMenuToggle}
              className="lg:hidden p-2 rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
              aria-expanded={isSidebarOpen}
            >
              {isSidebarOpen ? <PremiumIcons.X className="w-6 h-6" /> : <PremiumIcons.Menu className="w-6 h-6" />}
            </button>
            <Link href="/portal" className="flex items-center space-x-2" aria-label="Go to dashboard">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center shadow-lg shadow-primary/20" aria-hidden="true">
                <PremiumIcons.Car className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 hidden sm:inline tracking-tight">
                Smart Auto
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
                className="flex items-center gap-3 pl-1 pr-2 py-1 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all border border-transparent hover:border-gray-200 dark:hover:border-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center shadow-sm text-white text-xs font-bold tracking-wider ring-2 ring-white dark:ring-gray-900">
                  {user?.first_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"}
                </div>
                <div className="hidden sm:block text-left mr-1">
                  <p className="text-xs font-bold text-gray-900 dark:text-gray-100 leading-none mb-0.5">
                    {user?.first_name} {user?.last_name}
                  </p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-none truncate max-w-[100px] opacity-80">{user?.email}</p>
                </div>
              </button>

              {/* User Dropdown Menu */}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 py-2 z-50 transform origin-top-right transition-all animate-in fade-in zoom-in-95 duration-200">
                  <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 mb-1 bg-gray-50/50 dark:bg-gray-800/50">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Signed in as</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5 font-medium">{user?.email}</p>
                  </div>

                  <div className="p-1">
                    <Link
                      href="/portal/profile"
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-primary/10 dark:hover:bg-orange-900/20 hover:text-primary dark:hover:text-orange-400 rounded-lg transition-colors group"
                    >
                      <User className="w-4 h-4 text-gray-400 group-hover:text-primary transition-colors" />
                      <span>My Profile</span>
                    </Link>
                  </div>

                  <div className="my-1 border-t border-gray-100 dark:border-gray-800" />

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

