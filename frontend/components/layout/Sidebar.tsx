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
  Settings,
  ChevronLeft,
  ChevronRight,
  Stethoscope,
  Keyboard,
  CreditCard,
  Truck,
  Calculator,
  Landmark,
  HelpCircle,
  BookOpen,
  UserCog,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { APP_CONFIG } from "@/lib/config";

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
      { name: "Technicians", href: "/technicians", icon: UserCog, permission: "view_technicians" },
    ],
  },
  {
    name: "Inventory & Billing",
    items: [
      { name: "Inventory", href: "/inventory", icon: Package, permission: "view_inventory" },
      { name: "Billing", href: "/billing", icon: Receipt, permission: "view_billing" },
      // { name: "Accounting", href: "/ledger", icon: Calculator, permission: "view_accounting" },
      { name: "Assets", href: "/fixed-assets", icon: Landmark, permission: "view_fixed_assets" },
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
          "fixed left-0 top-16 bottom-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 z-40 transition-all duration-300 ease-in-out flex flex-col",
          "lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
          isCollapsed ? "w-20" : "w-64"
        )}
      >

        <nav className={cn("flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-800", isCollapsed && "px-2")}>
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
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-blue-600 dark:bg-blue-500 rounded-r-full shadow-sm" />
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

        {/* Footer */}
        {!isCollapsed && (
          <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
            <div className="space-y-2">
              <Link
                href="/help"
                className="flex items-center px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <HelpCircle className="w-4 h-4 mr-2" />
                Help & Support
              </Link>
              <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-500">
                Version {APP_CONFIG.version}
              </div>
            </div>
          </div>
        )}
        {isCollapsed && (
          <div className="flex-shrink-0 p-2 border-t border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
            <button
              title="Help & Support"
              className="w-full flex items-center justify-center p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
