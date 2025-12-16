"use client";

import { useAuthStore } from "@/store/authStore";
import { Bell, User, LogOut, Search, ChevronDown, Settings, Car, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationsApi } from "@/lib/api/notifications";
import Link from "next/link";
import { useState, useEffect, useRef, ChangeEvent, useMemo, useCallback } from "react";
import { searchApi, SearchResult } from "@/lib/api/search";
import { cn } from "@/lib/utils/cn";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Select } from "@/components/ui/select";
import { branchesApi, adminApi, type Branch, type SystemSetting } from "@/lib/api/admin";
import { useBranchStore } from "@/store/branchStore";
import { useTheme, setSystemThemeMode } from "@/lib/hooks/useTheme";

interface NavbarProps {
  onMenuToggle?: () => void;
  isSidebarOpen?: boolean;
}

export function Navbar({ onMenuToggle, isSidebarOpen }: NavbarProps) {
  const { user, logout, isAuthenticated } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
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
      const result = {
        path: branding.logoDarkPath,
        cacheKey: branding.logoDarkUpdatedAt ? new Date(branding.logoDarkUpdatedAt).getTime() : Date.now(),
      };
      console.log('🌙 Using dark logo:', result);
      return result;
    }
    if (branding.logoPath) {
      const result = {
        path: branding.logoPath,
        cacheKey: branding.logoUpdatedAt ? new Date(branding.logoUpdatedAt).getTime() : Date.now(),
      };
      console.log('☀️ Using light logo:', result);
      return result;
    }
    console.log('⚠️ No logo found in branding settings, using fallback icon. LogoPath:', branding.logoPath, 'LogoDarkPath:', branding.logoDarkPath);
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
      // Construct full media URL: http://localhost:8000/media/branding/logo_path.png
      const url = `${mediaBaseUrl}/media/${path}`;
      return cacheKey ? `${url}${url.includes("?") ? "&" : "?"}v=${cacheKey}` : url;
    },
    [mediaBaseUrl]
  );

  const logoSrc = useMemo(
    () => (logoToUse ? getMediaUrl(logoToUse.path, logoToUse.cacheKey) : null),
    [logoToUse, getMediaUrl]
  );

  const hasAccessToken =
    typeof window !== "undefined" && !!localStorage.getItem("access_token");

  const { data: unreadCountData } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => notificationsApi.unreadCount(),
    enabled: isAuthenticated && hasAccessToken,
    refetchOnWindowFocus: false,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const {
    data: accessibleBranchesData,
    isLoading: isBranchesLoading,
  } = useQuery<Branch[]>({
    queryKey: ["branches", "accessible"],
    queryFn: () => branchesApi.accessible(),
    enabled: isAuthenticated,
  });

  const branchOptions = accessibleBranchesData ?? [];
  const sortedBranches = [...branchOptions].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const hasMultipleBranches = sortedBranches.length > 1;
  const showBranchSwitcher =
    isAuthenticated &&
    ((user?.role === "admin" && sortedBranches.length > 0) ||
      hasMultipleBranches);

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

  const handleBranchChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const selectedId = parseInt(event.target.value, 10);
    const selectedBranch = sortedBranches.find(
      (branch) => branch.id === selectedId
    );
    if (selectedBranch) {
      setBranch(selectedBranch);
    }
  };

  const currentBranchId =
    activeBranchId ?? (sortedBranches.length ? sortedBranches[0].id : null);

  const unreadCount = unreadCountData?.unread_count || 0;

  // Search functionality
  useEffect(() => {
    const handleSearch = async () => {
      if (searchQuery.length >= 2) {
        try {
          const trimmedQuery = searchQuery.trim();
          const results = await searchApi.global(trimmedQuery);
          setSearchResults(results.results || []);
          setShowSearchResults(true);
        } catch (error: any) {
          console.error("Search error:", error);
          console.error("Error details:", error.response?.data || error.message);
          setSearchResults([]);
          setShowSearchResults(true); // Show "No results" message even on error
        }
      } else {
        setSearchResults([]);
        setShowSearchResults(false);
      }
    };

    const timeoutId = setTimeout(handleSearch, 500); // Debounce - increased to 500ms
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // Close search results and user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.length >= 2) {
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
      setShowSearchResults(false);
      setSearchQuery("");
    }
  };

  const handleLogout = () => {
    authApi.logout();
    logout();
    router.push("/login");
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm backdrop-blur-sm bg-white/95 dark:bg-gray-900/95 supports-[backdrop-filter]:bg-white/80 supports-[backdrop-filter]:dark:bg-gray-900/80">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Left: Menu Toggle + Logo/Brand */}
          <div className="flex items-center flex-shrink-0 space-x-3">
            {/* Mobile Menu Toggle */}
            <button
              onClick={onMenuToggle}
              className="lg:hidden p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Toggle menu"
            >
              {isSidebarOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>

            <Link href="/dashboard" className="flex items-center space-x-2 group">
              {logoSrc ? (
                <div className="h-8 w-8 rounded-lg overflow-hidden bg-white dark:bg-gray-800 flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow border border-gray-200 dark:border-gray-700 relative">
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
                          iconWrapper.className = "fallback-icon absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg";
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
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
                  <Car className="w-5 h-5 text-white" />
                </div>
              )}
              <div className="hidden sm:block">
                <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {branding.siteName}
                </h1>
                {branding.tagline && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 hidden lg:block">{branding.tagline}</p>
                )}
              </div>
            </Link>
          </div>

          {/* Global Search - Centered (Hidden on mobile, shown when toggled) */}
          <div className={cn(
            "hidden lg:flex items-center flex-1 max-w-2xl mx-4 lg:mx-8",
            showMobileSearch && "lg:flex"
          )}>
            <div className="relative w-full" ref={searchRef}>
              <form onSubmit={handleSearchSubmit} className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" />
                <Input
                  type="text"
                  placeholder="Search customers, vehicles, work orders..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => searchQuery.length >= 2 && setShowSearchResults(true)}
                  className="pl-10 pr-4 h-10 w-full bg-gray-50 border-gray-300 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                />
              </form>
              {showSearchResults && searchQuery.length >= 2 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 max-h-96 overflow-y-auto">
                  {searchResults.length > 0 ? (
                    <>
                      <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          Quick Results
                        </p>
                      </div>
                      {searchResults.map((result) => (
                        <Link
                          key={`${result.type}-${result.id}`}
                          href={result.url}
                          onClick={() => {
                            setShowSearchResults(false);
                            setSearchQuery("");
                          }}
                          className="block px-4 py-3 hover:bg-blue-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0 transition-colors group"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 dark:text-gray-100 group-hover:text-blue-700 dark:group-hover:text-blue-400 truncate">
                                {result.title}
                              </p>
                              {result.subtitle && (
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">{result.subtitle}</p>
                              )}
                            </div>
                            <div className="ml-4 flex-shrink-0">
                              <span className="text-xs px-2.5 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full font-medium capitalize">
                                {result.type}
                              </span>
                            </div>
                          </div>
                        </Link>
                      ))}
                      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-b-xl">
                        <Link
                          href={`/search?q=${encodeURIComponent(searchQuery)}`}
                          onClick={() => {
                            setShowSearchResults(false);
                            setSearchQuery("");
                          }}
                          className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium flex items-center justify-center group"
                        >
                          View all results
                          <ChevronDown className="w-4 h-4 ml-1 transform group-hover:translate-y-0.5 transition-transform" />
                        </Link>
                      </div>
                    </>
                  ) : (
                    <div className="px-4 py-8 text-center">
                      <Search className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                      <p className="text-gray-600 dark:text-gray-400 font-medium mb-1">No results found</p>
                      <p className="text-gray-500 dark:text-gray-500 text-sm mb-4">Try different keywords</p>
                      <Link
                        href={`/search?q=${encodeURIComponent(searchQuery)}`}
                        onClick={() => {
                          setShowSearchResults(false);
                          setSearchQuery("");
                        }}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium inline-flex items-center"
                      >
                        Try advanced search
                        <ChevronDown className="w-4 h-4 ml-1" />
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center space-x-2 flex-shrink-0">
            {/* Mobile Search Toggle */}
            <button
              onClick={() => setShowMobileSearch(!showMobileSearch)}
              className="lg:hidden p-2.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Toggle search"
            >
              <Search className="w-5 h-5" />
            </button>

            {showBranchSwitcher && (
              <div className="hidden md:flex items-center mr-2">
                <Select
                  value={currentBranchId ? currentBranchId.toString() : ""}
                  onChange={handleBranchChange}
                  disabled={isBranchesLoading || sortedBranches.length === 0}
                  className="w-44 bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700 focus:bg-white dark:focus:bg-gray-700 transition-colors text-sm"
                  title="Switch branch"
                >
                  {!currentBranchId && (
                    <option value="" disabled>
                      {isBranchesLoading ? "Loading..." : "Select branch"}
                    </option>
                  )}
                  {sortedBranches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                      {branch.is_headquarters && " (HQ)"}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {/* Theme Toggle */}
            <ThemeToggle />

            {/* Notifications */}
            <Link href="/notifications">
              <button
                className={cn(
                  "relative p-2.5 rounded-lg transition-all",
                  "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800",
                  "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                  unreadCount > 0 && "text-blue-600 dark:text-blue-400"
                )}
                title={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 flex items-center justify-center min-w-[20px] h-[20px] px-1.5 text-xs font-semibold text-white bg-red-500 dark:bg-red-600 rounded-full ring-2 ring-white dark:ring-gray-900">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>
            </Link>

            {/* User Menu */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className={cn(
                  "flex items-center space-x-2 px-3 py-2 rounded-lg transition-all",
                  "hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                  showUserMenu && "bg-gray-100 dark:bg-gray-800"
                )}
              >
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center text-white font-semibold shadow-sm">
                  {user?.first_name?.[0] || user?.email?.[0] || "U"}
                </div>
                <div className="hidden md:block text-left">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {user?.first_name} {user?.last_name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{user?.role}</p>
                </div>
                <ChevronDown
                  className={cn(
                    "hidden md:block w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform",
                    showUserMenu && "transform rotate-180"
                  )}
                />
              </button>

              {/* User Dropdown Menu */}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-2 z-50 animate-in fade-in-0 zoom-in-95">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {user?.first_name} {user?.last_name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{user?.email}</p>
                    <span className="inline-block mt-1.5 text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full font-medium capitalize">
                      {user?.role}
                    </span>
                  </div>
                  <Link
                    href="/admin/profile"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <User className="w-4 h-4 mr-3 text-gray-400 dark:text-gray-500" />
                    Profile Settings
                  </Link>
                  <Link
                    href="/admin"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <Settings className="w-4 h-4 mr-3 text-gray-400 dark:text-gray-500" />
                    Administration
                  </Link>
                  <div className="border-t border-gray-100 dark:border-gray-700 my-2" />
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      handleLogout();
                    }}
                    className="w-full flex items-center px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left"
                  >
                    <LogOut className="w-4 h-4 mr-3" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Search Bar (Full Width) */}
        {showMobileSearch && (
          <div className="lg:hidden pb-4 pt-2">
            <div className="relative" ref={searchRef}>
              <form onSubmit={handleSearchSubmit} className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" />
                <Input
                  type="text"
                  placeholder="Search customers, vehicles, work orders..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => searchQuery.length >= 2 && setShowSearchResults(true)}
                  className="pl-10 pr-4 h-10 w-full bg-gray-50 border-gray-300 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                />
              </form>
              {showSearchResults && searchQuery.length >= 2 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-96 overflow-y-auto">
                  {searchResults.length > 0 ? (
                    <>
                      <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                          Quick Results
                        </p>
                      </div>
                      {searchResults.map((result) => (
                        <Link
                          key={`${result.type}-${result.id}`}
                          href={result.url}
                          onClick={() => {
                            setShowSearchResults(false);
                            setSearchQuery("");
                            setShowMobileSearch(false);
                          }}
                          className="block px-4 py-3 hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors group"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 group-hover:text-blue-700 truncate">
                                {result.title}
                              </p>
                              {result.subtitle && (
                                <p className="text-sm text-gray-500 mt-0.5 truncate">{result.subtitle}</p>
                              )}
                            </div>
                            <div className="ml-4 flex-shrink-0">
                              <span className="text-xs px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full font-medium capitalize">
                                {result.type}
                              </span>
                            </div>
                          </div>
                        </Link>
                      ))}
                      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl">
                        <Link
                          href={`/search?q=${encodeURIComponent(searchQuery)}`}
                          onClick={() => {
                            setShowSearchResults(false);
                            setSearchQuery("");
                            setShowMobileSearch(false);
                          }}
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center justify-center group"
                        >
                          View all results
                          <ChevronDown className="w-4 h-4 ml-1 transform group-hover:translate-y-0.5 transition-transform" />
                        </Link>
                      </div>
                    </>
                  ) : (
                    <div className="px-4 py-8 text-center">
                      <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-600 font-medium mb-1">No results found</p>
                      <p className="text-gray-500 text-sm mb-4">Try different keywords</p>
                      <Link
                        href={`/search?q=${encodeURIComponent(searchQuery)}`}
                        onClick={() => {
                          setShowSearchResults(false);
                          setSearchQuery("");
                          setShowMobileSearch(false);
                        }}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium inline-flex items-center"
                      >
                        Try advanced search
                        <ChevronDown className="w-4 h-4 ml-1" />
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

