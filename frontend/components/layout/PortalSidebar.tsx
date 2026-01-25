"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PremiumIcons } from "@/components/ui/icons";
import {
  ChevronLeft,
  ChevronRight,
  PlusCircle, // Keep specialized UI icons or replace later
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { LucideIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { adminApi, SystemSetting } from "@/lib/api/admin";
import { useMemo } from "react";

// Define type for navigation items
interface NavigationItem {
  name: string;
  href: string;
  icon: any; // Allow any component
  badge?: boolean;
}

interface NavigationGroup {
  name: string;
  items: NavigationItem[];
}

// Group navigation items by category for better organization
const navigationGroups: NavigationGroup[] = [
  {
    name: "Main",
    items: [
      { name: "Dashboard", href: "/portal", icon: PremiumIcons.Home }, // Assuming Home icon added or map to Dashboard
    ],
  },
  {
    name: "My Services",
    items: [
      { name: "My Vehicles", href: "/portal/vehicles", icon: PremiumIcons.Car },
      { name: "My Appointments", href: "/portal/appointments", icon: PremiumIcons.Calendar },
      { name: "Book Appointment", href: "/portal/book", icon: PlusCircle }, // Keep PlusCircle for now
      { name: "Roadside Assistance", href: "/portal/roadside", icon: PremiumIcons.Truck },
    ],
  },
  {
    name: "Billing & Documents",
    items: [
      { name: "My Invoices", href: "/portal/invoices", icon: PremiumIcons.FileText },
      { name: "My Estimates", href: "/portal/estimates", icon: PremiumIcons.FileText },
      { name: "Payment History", href: "/portal/payments", icon: PremiumIcons.CreditCard },
      { name: "My Subscriptions", href: "/portal/subscriptions", icon: PremiumIcons.Package },
    ],
  },
];

interface PortalSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function PortalSidebar({ isOpen = true, onClose, isCollapsed = false, onToggleCollapse }: PortalSidebarProps) {
  const pathname = usePathname();

  const { data: brandingSettings } = useQuery<SystemSetting[]>({
    queryKey: ["settings", "branding", "public"],
    queryFn: () => adminApi.settings.publicBranding(),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const branding = useMemo(() => {
    if (!brandingSettings) {
      return {
        primary_color: "#ff8040", // Default orange
      };
    }

    const getSetting = (key: string): string | null => {
      const setting = brandingSettings.find((s) => s.key === key);
      return setting?.value && setting.value.trim() !== "" ? setting.value : null;
    };

    return {
      primary_color: getSetting("primary_color") || "#ff8040",
    };
  }, [brandingSettings]);

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-16 bottom-0 overflow-y-auto z-40 transition-all duration-300 ease-out",
          "lg:translate-x-0",
          "bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-r border-gray-200/60 dark:border-gray-800/60 shadow-xl", // Premium glass effect
          isOpen ? "translate-x-0" : "-translate-x-full",
          isCollapsed ? "w-20" : "w-72" // Slightly wider for premium feel
        )}
      >
        {/* Collapse/Expand Toggle Button */}
        {onToggleCollapse && (
          <div
            className={cn(
              "hidden lg:block fixed z-50 transition-all duration-300 ease-in-out",
              isCollapsed ? "left-20" : "left-64"
            )}
            style={{
              top: '4rem', // 64px - at the top, aligned with header
              transform: "translateX(-50%)"
            }}
          >
            <Button
              variant="default"
              size="icon"
              onClick={onToggleCollapse}
              className="h-10 w-10 rounded-full shadow-md border-2 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-primary/10 dark:hover:bg-orange-900/30 hover:text-orange-700 dark:hover:text-orange-400 hover:border-orange-400 dark:hover:border-primary hover:shadow-lg transition-all"
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? (
                <ChevronRight className="w-5 h-5" />
              ) : (
                <ChevronLeft className="w-5 h-5" />
              )}
            </Button>
          </div>
        )}

        <nav className={cn("p-4 space-y-6", isCollapsed && "px-2")}>
          {navigationGroups.map((group) => (
            <div key={group.name}>
              {!isCollapsed && (
                <h3 className="px-3 mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {group.name}
                </h3>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = pathname === item.href || (item.href !== "/portal" && pathname?.startsWith(item.href));
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => {
                        // Close sidebar on mobile when clicking a link
                        if (onClose && typeof window !== 'undefined' && window.innerWidth < 1024) {
                          onClose();
                        }
                      }}
                      className={cn(
                        "group flex items-center rounded-xl transition-all duration-300 relative mx-2 mb-1 overflow-hidden",
                        isCollapsed ? "px-2 py-3 justify-center" : "px-4 py-3",
                        isActive
                          ? "shadow-md font-semibold ring-1 ring-black/5 dark:ring-white/5"
                          : "text-gray-600 dark:text-gray-400 hover:bg-gray-50/80 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-100"
                      )}
                      style={isActive ? {
                        backgroundColor: `${branding.primary_color}15`, // 10% opacity hex
                        color: branding.primary_color,
                      } : undefined}
                      title={isCollapsed ? item.name : undefined}
                      aria-label={item.name}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <Icon
                        className={cn(
                          "transition-transform duration-300 flex-shrink-0",
                          isCollapsed ? "w-6 h-6" : "w-5 h-5 mr-3.5",
                          isActive ? "scale-110" : "group-hover:scale-110 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300"
                        )}
                        style={isActive ? { color: branding.primary_color } : undefined}
                      />
                      {!isCollapsed && (
                        <span className="flex-1 tracking-tight">{item.name}</span>
                      )}
                      {isActive && !isCollapsed && (
                        <div
                          className="w-1.5 h-1.5 rounded-full ml-auto shadow-sm"
                          style={{ backgroundColor: branding.primary_color }}
                        />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer section with user info when expanded */}
        {!isCollapsed && (
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
            <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
              <p>Version 1.0</p>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

