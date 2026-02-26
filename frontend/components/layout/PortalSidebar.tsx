"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PremiumIcons } from "@/components/ui/icons";
import {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ChevronLeft,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ChevronRight,
  PlusCircle, // Keep specialized UI icons or replace later
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Button } from "@/components/ui/button";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      { name: "Vehicles", href: "/portal/vehicles", icon: PremiumIcons.Car },
      { name: "Appointments", href: "/portal/appointments", icon: PremiumIcons.Calendar },
      { name: "Book Appointment", href: "/portal/book", icon: PlusCircle }, // Keep PlusCircle for now
      { name: "Roadside Assistance", href: "/portal/roadside", icon: PremiumIcons.Truck },
      { name: "Work Orders", href: "/portal/work-orders", icon: PremiumIcons.ClipboardList },
    ],
  },
  {
    name: "Billing & Documents",
    items: [
      { name: "Invoices", href: "/portal/invoices", icon: PremiumIcons.FileText },
      { name: "Estimates", href: "/portal/estimates", icon: PremiumIcons.FileText },
      { name: "Payment History", href: "/portal/payments", icon: PremiumIcons.CreditCard },
      { name: "Subscriptions", href: "/portal/subscriptions", icon: PremiumIcons.Package },
    ],
  },
];

interface PortalSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  isCollapsed?: boolean;
}

export function PortalSidebar({ isOpen = true, onClose, isCollapsed = false }: PortalSidebarProps) {
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
          "bg-card/80 bg-background/80 backdrop-blur-xl border-r border-border/60 border-border/60 shadow-xl", // Premium glass effect
          isOpen ? "translate-x-0" : "-translate-x-full",
          isCollapsed ? "w-20" : "w-72" // Slightly wider for premium feel
        )}
      >


        <nav className={cn("p-4 space-y-6", isCollapsed && "px-2")}>
          {navigationGroups.map((group) => (
            <div key={group.name}>
              {!isCollapsed && (
                <h3 className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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
                          : "text-muted-foreground hover:bg-muted/80 hover:bg-muted/50 hover:text-foreground "
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
                          isActive ? "scale-110" : "group-hover:scale-110 text-muted-foreground group-hover:text-muted-foreground dark:group-hover:text-gray-300"
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
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border bg-muted bg-background/50">
            {/* <div className="text-xs text-muted-foreground text-center">
              <p>Version 1.0</p>
            </div> */}
          </div>
        )}
      </aside>
    </>
  );
}

