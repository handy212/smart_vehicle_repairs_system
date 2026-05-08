"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PremiumIcons } from "@/components/ui/icons";
import {
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { useQuery } from "@tanstack/react-query";
import { adminApi, SystemSetting } from "@/lib/api/admin";
import { useMemo } from "react";
import { useTheme } from "@/lib/hooks/useTheme";
import { ensureVisibleColor } from "@/lib/utils/color-utils";

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
      { name: "Gate Passes", href: "/gatepass", icon: PremiumIcons.FileText, permission: "view_gatepass" },
      { name: "Roadside", href: "/roadside", icon: PremiumIcons.Truck, permission: "view_roadside" },
      { name: "Technicians", href: "/technicians", icon: PremiumIcons.UserCog, permission: "view_technicians" },
      { name: "HR", href: "/hr", icon: PremiumIcons.Building2, permission: "view_hr" },
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
    name: "Communications",
    items: [
      { name: "SMS Console", href: "/sms", icon: PremiumIcons.MessageSquare, permission: "send_notifications" },
    ],
  },
  {
    name: "System",
    items: [
      { name: "Configurations", href: "/admin/settings", icon: PremiumIcons.Settings, permission: "view_settings" },
    ],
  },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ isOpen = true, onClose, isCollapsed = false }: SidebarProps) {
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();

  const { data: brandingSettings } = useQuery<SystemSetting[]>({
    queryKey: ["settings", "branding", "public"],
    queryFn: () => adminApi.settings.publicBranding(),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const branding = useMemo(() => {
    if (!brandingSettings) {
      return { primary_color: "#ff8040" };
    }
    const getSetting = (key: string): string | null => {
      const setting = brandingSettings.find((s) => s.key === key);
      return setting?.value && setting.value.trim() !== "" ? setting.value : null;
    };
    return { primary_color: getSetting("primary_color") || "#ff8040" };
  }, [brandingSettings]);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed left-0 bottom-0 z-40 flex flex-col transition-all duration-200 ease-out",
          "lg:translate-x-0",
          "border-r border-border bg-background shadow-sm",
          isOpen ? "translate-x-0" : "-translate-x-full",
          isCollapsed ? "w-16" : ""
        )}
        style={{ 
          top: 'var(--header-height)',
          width: isCollapsed ? '64px' : 'var(--sidebar-width)'
        }}
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
                  const isDark = resolvedTheme === "dark";
                  const visiblePrimary = branding.primary_color ? ensureVisibleColor(branding.primary_color, isDark) : undefined;
                  const Icon = item.icon;

                  const navItem = (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => {
                        if (onClose && typeof window !== 'undefined' && window.innerWidth < 1024) {
                          onClose();
                        }
                      }}
                      className={cn(
                        "group relative mx-2 mb-1 flex items-center overflow-hidden rounded-xl transition-colors duration-200",
                        isCollapsed ? "justify-center px-2 py-2.5" : "px-3.5 py-2.5",
                        isActive
                          ? "shadow-md font-semibold ring-1 ring-black/5 dark:ring-white/5"
                          : "text-muted-foreground hover:bg-muted/80 hover:text-foreground "
                      )}
                      style={isActive ? {
                        backgroundColor: `${visiblePrimary}15`,
                        color: visiblePrimary,
                      } : undefined}
                      title={isCollapsed ? item.name : undefined}
                    >
                      {isActive && (
                        <div
                          className="absolute inset-0 opacity-10"
                          style={{ backgroundColor: visiblePrimary }}
                        />
                      )}
                      <Icon
                        className={cn(
                          "flex-shrink-0 transition-colors duration-200",
                          isCollapsed ? "w-6 h-6" : "w-5 h-5 mr-3.5",
                          isActive ? "" : "text-muted-foreground group-hover:text-foreground"
                        )}
                        style={isActive ? { color: visiblePrimary } : undefined}
                      />
                      {!isCollapsed && (
                        <>
                          <span className="flex-1 tracking-tight">{item.name}</span>
                          {isActive && (
                            <div
                              className="w-1.5 h-1.5 rounded-full ml-auto shadow-sm"
                              style={{ backgroundColor: visiblePrimary }}
                            />
                          )}
                        </>
                      )}
                    </Link>
                  );

                  if (item.permission) {
                    return (
                      <PermissionGuard key={item.name} permission={item.permission}>
                        {navItem}
                      </PermissionGuard>
                    );
                  }
                  return navItem;
                })}
              </div>
            </div>
          ))}
        </nav>

        {!isCollapsed && (
          <div className="flex-shrink-0 border-t border-border bg-background p-4">
            <Link
              href="/help"
              className="flex items-center px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              <HelpCircle className="w-4 h-4 mr-2" />
              Help & Support
            </Link>
          </div>
        )}
        {isCollapsed && (
          <div className="flex-shrink-0 border-t border-border bg-background p-2">
            <Link
              href="/help"
              title="Help & Support"
              className="w-full flex items-center justify-center p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              <HelpCircle className="w-5 h-5" />
            </Link>
          </div>
        )}
      </aside>
    </>
  );
}
