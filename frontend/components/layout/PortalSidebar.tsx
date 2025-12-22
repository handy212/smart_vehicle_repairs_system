"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Car,
  Calendar,
  FileText,
  PlusCircle,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Package,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { LucideIcon } from "lucide-react";

// Define type for navigation items
interface NavigationItem {
  name: string;
  href: string;
  icon: LucideIcon;
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
      { name: "Dashboard", href: "/portal", icon: Home },
    ],
  },
  {
    name: "My Services",
    items: [
      { name: "My Vehicles", href: "/portal/vehicles", icon: Car },
      { name: "My Appointments", href: "/portal/appointments", icon: Calendar },
      { name: "Book Appointment", href: "/portal/book", icon: PlusCircle },
      { name: "Roadside Assistance", href: "/portal/roadside", icon: Wrench },
    ],
  },
  {
    name: "Billing & Documents",
    items: [
      { name: "My Invoices", href: "/portal/invoices", icon: FileText },
      { name: "My Estimates", href: "/portal/estimates", icon: FileText },
      { name: "Payment History", href: "/portal/payments", icon: CreditCard },
      { name: "My Subscriptions", href: "/portal/subscriptions", icon: Package },
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
              className="h-10 w-10 rounded-full shadow-md border-2 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-400 hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-lg transition-all"
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
                        "group flex items-center rounded-lg transition-all duration-200 relative",
                        isCollapsed ? "px-2 py-2.5 justify-center" : "px-3 py-2.5",
                        isActive
                          ? "bg-gradient-to-r from-blue-50 dark:from-blue-900/30 to-blue-50/50 dark:to-blue-900/20 text-blue-700 dark:text-blue-300 shadow-sm"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
                      )}
                      title={isCollapsed ? item.name : undefined}
                      aria-label={item.name}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <Icon className={cn("flex-shrink-0", isCollapsed ? "w-5 h-5" : "w-5 h-5 mr-3")} />
                      {!isCollapsed && (
                        <span className="flex-1 font-medium">{item.name}</span>
                      )}
                      {isActive && !isCollapsed && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-600 dark:bg-blue-400 rounded-r-full" />
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

