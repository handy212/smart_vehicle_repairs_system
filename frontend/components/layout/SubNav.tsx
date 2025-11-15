"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";

interface SubNavItem {
  name: string;
  href: string;
}

interface SubNavProps {
  items: SubNavItem[];
  title: string;
  onToggle?: (collapsed: boolean) => void;
  isCollapsed?: boolean;
}

export function SubNav({ items, title, onToggle, isCollapsed: externalCollapsed }: SubNavProps) {
  const pathname = usePathname();
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const isCollapsed = externalCollapsed !== undefined ? externalCollapsed : internalCollapsed;

  const handleToggle = () => {
    const newState = !isCollapsed;
    if (externalCollapsed === undefined) {
      setInternalCollapsed(newState);
    }
    onToggle?.(newState);
  };

  return (
    <aside
      className={cn(
        "fixed left-64 top-16 bottom-0 bg-gray-50 border-r border-gray-200 overflow-y-auto z-10 transition-all duration-300",
        isCollapsed ? "w-12" : "w-56"
      )}
    >
      <div className={cn("p-4", isCollapsed && "px-2")}>
        <div className={cn("flex items-center mb-3", isCollapsed ? "justify-center" : "justify-between")}>
          {!isCollapsed && (
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {title}
            </h2>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-6 w-6", !isCollapsed && "ml-auto")}
            onClick={handleToggle}
            title={isCollapsed ? "Expand" : "Collapse"}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>
        <nav className="space-y-1">
          {items.map((item) => {
            // For sub-nav items, check exact match or if pathname starts with the href
            // Exclude the base route to avoid false positives
            const isExactMatch = pathname === item.href;
            const isSubRoute = pathname?.startsWith(item.href + "/");
            const isActive = isExactMatch || isSubRoute;
            
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                  isActive
                    ? "bg-blue-100 text-blue-700 font-semibold"
                    : "text-gray-700 hover:bg-gray-100",
                  isCollapsed && "justify-center"
                )}
                title={isCollapsed ? item.name : undefined}
              >
                {isCollapsed ? (
                  <span className="text-xs font-bold">{item.name.charAt(0)}</span>
                ) : (
                  item.name
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}

// Define sub-navigation items for each module
export const subNavConfig: Record<string, SubNavItem[]> = {
  inventory: [
    { name: "Parts", href: "/inventory" },
    { name: "Categories", href: "/inventory/categories" },
    { name: "Suppliers", href: "/inventory/suppliers" },
    { name: "Purchase Orders", href: "/inventory/purchase-orders" },
  ],
  workorders: [
    { name: "List View", href: "/workorders" },
    { name: "Kanban Board", href: "/workorders/kanban" },
  ],
  appointments: [
    { name: "List View", href: "/appointments" },
    { name: "Calendar", href: "/appointments/calendar" },
  ],
  billing: [
    { name: "Invoices", href: "/billing" },
    { name: "Estimates", href: "/billing/estimates" },
  ],
  admin: [
    { name: "Dashboard", href: "/admin" },
    { name: "Users", href: "/admin/users" },
    { name: "Roles", href: "/admin/roles" },
    { name: "Branches", href: "/admin/branches" },
    { name: "Backups", href: "/admin/backups" },
    { name: "Settings", href: "/admin/settings" },
    { name: "Audit Log", href: "/admin/audit-log" },
  ],
};

// Helper function to get sub-nav config based on pathname
export function getSubNavConfig(pathname: string | null): { items: SubNavItem[]; title: string } | null {
  if (!pathname) return null;

  if (pathname.startsWith("/inventory")) {
    return {
      items: subNavConfig.inventory,
      title: "Inventory",
    };
  }

  if (pathname.startsWith("/workorders")) {
    return {
      items: subNavConfig.workorders,
      title: "Work Orders",
    };
  }

  if (pathname.startsWith("/appointments")) {
    return {
      items: subNavConfig.appointments,
      title: "Appointments",
    };
  }

  if (pathname.startsWith("/billing")) {
    return {
      items: subNavConfig.billing,
      title: "Billing",
    };
  }

  if (pathname.startsWith("/admin")) {
    return {
      items: subNavConfig.admin,
      title: "Administration",
    };
  }

  return null;
}

