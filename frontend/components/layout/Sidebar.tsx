"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PremiumIcons } from "@/components/ui/icons";
import {
  HelpCircle, // Keep HelpCircle for footer/help if needed, or replace
  ChevronLeft,
  ChevronRight, // Keep UI controls from Lucide for now or replace if desired
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { APP_CONFIG } from "@/lib/config";
import { useQuery } from "@tanstack/react-query";
import { adminApi, SystemSetting } from "@/lib/api/admin";
import { useMemo } from "react";

// Group navigation items by category for better organization with permission requirements
const navigationGroups = [
  {
    name: "Main",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: PremiumIcons.Dashboard, permission: "view_dashboard" },
    ],
  },
  {
    name: "Operations",
    items: [
      { name: "Customers", href: "/customers", icon: PremiumIcons.Users, permission: "view_customers" },
      { name: "Vehicles", href: "/vehicles", icon: PremiumIcons.Car, permission: "view_vehicles" },
      { name: "Appointments", href: "/appointments", icon: PremiumIcons.Calendar, permission: "view_appointments" },
      { name: "Work Orders", href: "/workorders", icon: PremiumIcons.Wrench, permission: "view_workorders" },
      { name: "Services Due", href: "/services-due", icon: PremiumIcons.Clock, permission: "view_vehicles" },
      { name: "Gate Passes", href: "/gatepass", icon: PremiumIcons.FileText, permission: "view_gatepass" },
      { name: "Roadside", href: "/roadside", icon: PremiumIcons.Truck, permission: "view_roadside" },
      { name: "Technicians", href: "/technicians", icon: PremiumIcons.UserCog, permission: "view_technicians" },
    ],
  },
  {
    name: "Inventory & Billing",
    items: [
      { name: "Inventory", href: "/inventory", icon: PremiumIcons.Package, permission: "view_inventory" },
      { name: "Billing", href: "/billing", icon: PremiumIcons.Receipt, permission: "view_billing" },
      { name: "Accounting", href: "/accounting", icon: PremiumIcons.Calculator, permission: "view_accounting" },
      { name: "Fixed Assets", href: "/fixed-assets", icon: PremiumIcons.Landmark, permission: "view_assets" },
      { name: "Subscriptions", href: "/subscriptions", icon: PremiumIcons.CreditCard, permission: "view_subscriptions" },
    ],
  },
  {
    name: "Tools & Reports",
    items: [
      { name: "Inspections", href: "/inspections", icon: PremiumIcons.FileText, permission: "view_inspections" },
      { name: "Diagnosis", href: "/diagnosis", icon: PremiumIcons.Stethoscope, permission: "view_diagnosis" },
      { name: "Reports", href: "/reports", icon: PremiumIcons.BarChart, permission: "view_reports" },
    ],
  },
  {
    name: "System",
    items: [
      { name: "Configurations", href: "/admin", icon: PremiumIcons.Settings, permission: "view_settings" },
      { name: "SMS Console", href: "/sms", icon: PremiumIcons.MessageSquare, permission: "send_notifications" },
    ],
  },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ isOpen = true, onClose, isCollapsed = false, onToggleCollapse }: SidebarProps) {
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
          "fixed left-0 top-16 bottom-0 z-40 transition-all duration-300 ease-out flex flex-col",
          "lg:translate-x-0",
          "bg-card/80 bg-background/80 backdrop-blur-xl border-r border-border/60 border-border/60 shadow-xl", // Premium glass effect
          isOpen ? "translate-x-0" : "-translate-x-full",
          isCollapsed ? "w-20" : "w-72" // Slightly wider for premium feel
        )}
      >

        <nav className={cn("flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-800", isCollapsed && "px-2")}>
          {navigationGroups.map((group) => (
            <div key={group.name}>
              {!isCollapsed && group.name !== "Main" && (
                <h3 className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {group.name}
                </h3>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
                  const Icon = item.icon;

                  const navItem = (
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
                    >
                      {/* Active indicator background effect */}
                      {isActive && (
                        <div
                          className="absolute inset-0 opacity-10"
                          style={{ backgroundColor: branding.primary_color }}
                        />
                      )}
                      <Icon
                        className={cn(
                          "transition-transform duration-300 flex-shrink-0",
                          isCollapsed ? "w-6 h-6" : "w-5 h-5 mr-3.5",
                          isActive ? "scale-110" : "group-hover:scale-110 text-muted-foreground group-hover:text-muted-foreground dark:group-hover:text-gray-300"
                        )}
                        style={isActive ? { color: branding.primary_color } : undefined}
                      />
                      {!isCollapsed && (
                        <>
                          <span className="flex-1 tracking-tight">{item.name}</span>
                          {isActive && (
                            <div
                              className="w-1.5 h-1.5 rounded-full ml-auto shadow-sm"
                              style={{ backgroundColor: branding.primary_color }}
                            />
                          )}
                        </>
                      )}
                    </Link>
                  );

                  // Wrap with permission guard if permission is specified
                  if (item.permission) {
                    return (
                      <PermissionGuard key={item.name} permission={item.permission}>
                        {navItem}
                      </PermissionGuard>
                    );
                  }

                  // No permission check - show item
                  return navItem;
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        {!isCollapsed && (
          <div className="flex-shrink-0 p-4 border-t border-border bg-muted/50 bg-background/50">
            <div className="space-y-2">
              <Link
                href="/help"
                className="flex items-center px-3 py-2 text-sm text-muted-foreground hover:text-foreground  hover:bg-muted hover:bg-muted rounded-lg transition-colors"
              >
                <HelpCircle className="w-4 h-4 mr-2" />
                Help & Support
              </Link>
              <div className="px-3 py-2 text-xs text-muted-foreground">
                Version {APP_CONFIG.version}
              </div>
            </div>
          </div>
        )}
        {isCollapsed && (
          <div className="flex-shrink-0 p-2 border-t border-border bg-muted/50 bg-background/50">
            <button
              title="Help & Support"
              className="w-full flex items-center justify-center p-2 text-muted-foreground hover:text-foreground  hover:bg-muted hover:bg-muted rounded-lg transition-colors"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
