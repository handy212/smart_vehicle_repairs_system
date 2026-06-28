"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PremiumIcons } from "@/components/ui/icons";
import { cn } from "@/lib/utils/cn";
import { useBranding } from "@/lib/hooks/useBranding";
import { NavCategoryBadge } from "@/components/layout/NavCategoryBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavigationItem {
  name: string;
  href: string;
}

interface NavigationGroup {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  items: NavigationItem[];
}

const navigationGroups: NavigationGroup[] = [
  {
    id: "main",
    name: "Main",
    icon: PremiumIcons.Home,
    items: [{ name: "Dashboard", href: "/portal" }],
  },
  {
    id: "services",
    name: "My Services",
    icon: PremiumIcons.Wrench,
    items: [
      { name: "Vehicles", href: "/portal/vehicles" },
      { name: "Appointments", href: "/portal/appointments" },
      { name: "Book Appointment", href: "/portal/book" },
      { name: "Roadside Assistance", href: "/portal/roadside" },
      { name: "Work Orders", href: "/portal/work-orders" },
    ],
  },
  {
    id: "billing",
    name: "Billing & Documents",
    icon: PremiumIcons.FileText,
    items: [
      { name: "Invoices", href: "/portal/invoices" },
      { name: "Estimates", href: "/portal/estimates" },
      { name: "Payment History", href: "/portal/payments" },
      { name: "Subscriptions", href: "/portal/subscriptions" },
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
  const { primaryColor } = useBranding("public");

  const handleNavigate = () => {
    if (onClose && typeof window !== "undefined" && window.innerWidth < 1024) {
      onClose();
    }
  };

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
          "fixed left-0 top-16 bottom-0 z-40 overflow-y-auto transition-all duration-200 ease-out",
          "lg:translate-x-0 border-r border-border bg-background shadow-sm",
          isOpen ? "translate-x-0" : "-translate-x-full",
          isCollapsed ? "w-16" : "w-64"
        )}
      >
        <nav className={cn("p-3 space-y-3", isCollapsed && "px-1.5")}>
          {navigationGroups.map((group) => {
            const groupActive = group.items.some(
              (item) =>
                pathname === item.href ||
                (item.href !== "/portal" && pathname?.startsWith(item.href))
            );

            if (isCollapsed && group.items.length === 1) {
              const item = group.items[0];
              const isActive =
                pathname === item.href ||
                (item.href !== "/portal" && pathname?.startsWith(item.href));
              return (
                <Link
                  key={group.id}
                  href={item.href}
                  onClick={handleNavigate}
                  className="mx-1.5 flex justify-center rounded-md p-1.5"
                  title={item.name}
                  aria-current={isActive ? "page" : undefined}
                >
                  <NavCategoryBadge
                    icon={group.icon}
                    groupId={group.id}
                    size="sm"
                    active={isActive}
                  />
                </Link>
              );
            }

            if (isCollapsed) {
              return (
                <DropdownMenu key={group.id}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="mx-1.5 flex w-[calc(100%-0.75rem)] items-center justify-center rounded-md p-1.5 transition-colors hover:bg-muted/50"
                      title={group.name}
                    >
                      <NavCategoryBadge
                        icon={group.icon}
                        groupId={group.id}
                        size="sm"
                        active={groupActive}
                      />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="right" align="start" className="w-52">
                    <DropdownMenuLabel className="text-sm font-semibold">{group.name}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {group.items.map((item) => {
                      const isActive =
                        pathname === item.href ||
                        (item.href !== "/portal" && pathname?.startsWith(item.href));
                      return (
                        <DropdownMenuItem key={item.name} asChild>
                          <Link
                            href={item.href}
                            onClick={handleNavigate}
                            className={cn(
                              "cursor-pointer text-sm",
                              isActive && "font-medium text-foreground"
                            )}
                          >
                            {item.name}
                          </Link>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            }

            return (
              <section key={group.id} className="space-y-1.5">
                <div className="flex items-center gap-2.5 px-2.5">
                  <NavCategoryBadge
                    icon={group.icon}
                    groupId={group.id}
                    size="sm"
                    active={groupActive}
                  />
                  <h3 className="text-sm font-semibold text-foreground">{group.name}</h3>
                </div>

                <div className="ml-[1.125rem] space-y-0.5 border-l border-border/60 pl-3">
                  {group.items.map((item) => {
                    const isActive =
                      pathname === item.href ||
                      (item.href !== "/portal" && pathname?.startsWith(item.href));

                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        onClick={handleNavigate}
                        className={cn(
                          "block rounded-md py-1.5 pr-2 text-sm transition-colors",
                          isActive
                            ? "bg-muted/70 font-medium text-foreground"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        )}
                        style={
                          isActive
                            ? { boxShadow: `inset 2px 0 0 ${primaryColor}` }
                            : undefined
                        }
                        aria-current={isActive ? "page" : undefined}
                      >
                        {item.name}
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
