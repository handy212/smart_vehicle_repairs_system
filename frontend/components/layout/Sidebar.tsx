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
  SlidersHorizontal,
  Stethoscope,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";

// Group navigation items by category for better organization
const navigationGroups = [
  {
    name: "Main",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    name: "Operations",
    items: [
      { name: "Customers", href: "/customers", icon: Users },
      { name: "Vehicles", href: "/vehicles", icon: Car },
      { name: "Appointments", href: "/appointments", icon: Calendar },
      { name: "Work Orders", href: "/workorders", icon: Wrench },
    ],
  },
  {
    name: "Inventory & Billing",
    items: [
      { name: "Inventory", href: "/inventory", icon: Package },
      { name: "Billing", href: "/billing", icon: Receipt },
    ],
  },
  {
    name: "Tools & Reports",
    items: [
      { name: "Inspections", href: "/inspections", icon: FileText },
      { name: "Diagnosis", href: "/diagnosis", icon: Stethoscope },
      { name: "Reports", href: "/reports", icon: BarChart3 },
    ],
  },
  {
    name: "System",
    items: [
      { name: "Notifications", href: "/notifications", icon: Bell },
      { name: "Administration", href: "/admin", icon: Settings },
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
      {/* Collapse/Expand Toggle Button - Positioned at the top of sidebar */}
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
                const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
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
                  >
                    {/* Active indicator */}
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-600 rounded-r-full" />
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
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-600 ml-auto" />
                        )}
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      </aside>
    </>
  );
}

