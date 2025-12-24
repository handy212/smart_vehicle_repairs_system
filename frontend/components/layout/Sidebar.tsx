"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Car,
  Calendar,
  Wrench,
  Package,
  Receipt,
  FileText,
  BarChart3,
  Bell,
  Settings,
  ChevronLeft,
  ChevronRight,
  Stethoscope,
  Keyboard,
  CreditCard,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { PermissionGuard } from "@/components/auth/PermissionGuard";

// Group navigation items by category for better organization with permission requirements
const navigationGroups = [
  {
    name: "Main",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: "view_dashboard" },
    ],
  },
  {
    name: "Operations",
    items: [
      { name: "Customers", href: "/customers", icon: Users, permission: "view_customers" },
      { name: "Vehicles", href: "/vehicles", icon: Car, permission: "view_vehicles" },
      { name: "Appointments", href: "/appointments", icon: Calendar, permission: "view_appointments" },
      { name: "Work Orders", href: "/workorders", icon: Wrench, permission: "view_workorders" },
      { name: "Roadside", href: "/roadside", icon: Truck, permission: "view_roadside" },
    ],
  },
  {
    name: "Inventory & Billing",
    items: [
      { name: "Inventory", href: "/inventory", icon: Package, permission: "view_inventory" },
      { name: "Billing", href: "/billing", icon: Receipt, permission: "view_billing" },
      { name: "Subscriptions", href: "/subscriptions", icon: CreditCard, permission: "view_subscriptions" },
    ],
  },
  {
    name: "Tools & Reports",
    items: [
      { name: "Inspections", href: "/inspections", icon: FileText, permission: "view_inspections" },
      { name: "Diagnosis", href: "/diagnosis", icon: Stethoscope, permission: "view_diagnosis" },
      { name: "Reports", href: "/reports", icon: BarChart3, permission: "view_reports" },
    ],
  },
  {
    name: "System",
    items: [
      { name: "Notifications", href: "/notifications", icon: Bell, permission: undefined },
      { name: "Administration", href: "/admin", icon: Settings, permission: "view_admin" },
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
          "fixed left-0 top-16 bottom-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 overflow-y-auto z-40 transition-all duration-300 ease-in-out",
          "lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
          isCollapsed ? "w-20" : "w-64"
        )}
      >
        {/* Collapse/Expand Toggle Button - Inside sidebar at top */}
        {onToggleCollapse && (
          <div className="hidden lg:flex items-center justify-end p-3 border-b border-gray-200 dark:border-gray-800">
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleCollapse}
              className="h-8 w-8 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              title={`${isCollapsed ? "Expand" : "Collapse"} sidebar (Ctrl+B)`}
            >
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
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
                        "group flex items-center rounded-lg transition-all duration-200 relative",
                        isCollapsed ? "px-2 py-2.5 justify-center" : "px-3 py-2.5",
                        isActive
                          ? "bg-gradient-to-r from-blue-50 dark:from-blue-900/30 to-blue-50/50 dark:to-blue-900/20 text-blue-700 dark:text-blue-300 shadow-sm font-medium"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
                      )}
                      title={isCollapsed ? item.name : undefined}
                    >
                      {/* Active indicator */}
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-600 dark:bg-blue-500 rounded-r-full" />
                      )}
                      <Icon
                        className={cn(
                          "transition-colors flex-shrink-0",
                          isCollapsed ? "w-5 h-5" : "w-5 h-5 mr-3",
                          isActive
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300"
                        )}
                      />
                      {!isCollapsed && (
                        <>
                          <span className="flex-1">{item.name}</span>
                          {isActive && (
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400 ml-auto" />
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
      </aside>
    </>
  );
}

