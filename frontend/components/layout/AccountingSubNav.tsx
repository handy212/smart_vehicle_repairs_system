"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { useBranding } from "@/lib/hooks/useBranding";
import { useTheme } from "@/lib/hooks/useTheme";
import { ensureVisibleColor } from "@/lib/utils/color-utils";
import { useModules } from "@/lib/hooks/useModules";
import {
  ACCOUNTING_NAV_GROUPS,
  getAccountingActiveGroupId,
  getAccountingActiveItem,
  type AccountingNavGroup,
  type AccountingNavItem,
} from "./accounting-nav-config";

interface AccountingSubNavProps {
  onToggle?: (collapsed: boolean) => void;
  isCollapsed?: boolean;
  sidebarCollapsed?: boolean;
}

function NavItemLink({
  item,
  isActive,
  collapsed,
  variant,
  visiblePrimary,
  brandingColor,
}: {
  item: AccountingNavItem;
  isActive: boolean;
  collapsed: boolean;
  variant: "mobile" | "desktop" | "dropdown";
  visiblePrimary?: string;
  brandingColor?: string;
}) {
  const Icon = item.icon;

  const className = cn(
    variant === "dropdown"
      ? "flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none"
      : variant === "mobile"
        ? "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors"
        : cn(
            "flex items-center w-full transition-colors relative rounded-lg text-sm font-medium",
            collapsed ? "justify-center px-2 py-2" : "px-3 py-2",
            isActive
              ? "font-semibold shadow-sm ring-1 ring-black/5 dark:ring-white/10"
              : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
          ),
    variant === "mobile" &&
      (isActive
        ? "font-semibold shadow-sm ring-1 ring-black/5 dark:ring-white/10"
        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground")
  );

  const style =
    isActive && variant !== "dropdown"
      ? { backgroundColor: `${visiblePrimary}15`, color: visiblePrimary }
      : undefined;

  const link = (
    <Link
      href={item.href}
      className={className}
      style={style}
      title={collapsed ? item.name : item.description}
    >
      {Icon && (
        <Icon
          className={cn(
            "shrink-0",
            variant === "mobile" ? "h-3.5 w-3.5" : "h-4 w-4",
            variant !== "dropdown" && !collapsed && variant === "desktop" && "mr-3",
            variant === "dropdown" && "h-4 w-4 text-muted-foreground"
          )}
          style={isActive && variant !== "dropdown" ? { color: visiblePrimary } : undefined}
        />
      )}
      {(variant === "mobile" || variant === "dropdown" || !collapsed) && (
        <span className={variant === "dropdown" ? "flex-1" : undefined}>{item.name}</span>
      )}
      {isActive && variant === "desktop" && !collapsed && brandingColor && (
        <div
          className="absolute right-2 top-1/2 h-1 w-1 -translate-y-1/2 rounded-full"
          style={{ backgroundColor: brandingColor }}
        />
      )}
    </Link>
  );

  if (item.permissions?.length) {
    return (
      <PermissionGuard permissions={[...item.permissions]}>{link}</PermissionGuard>
    );
  }
  if (item.permission) {
    return <PermissionGuard permission={item.permission}>{link}</PermissionGuard>;
  }
  return link;
}

function GuardedNavItem({
  item,
  children,
}: {
  item: AccountingNavItem;
  children: React.ReactNode;
}) {
  if (item.permissions?.length) {
    return (
      <PermissionGuard permissions={[...item.permissions]}>{children}</PermissionGuard>
    );
  }
  if (item.permission) {
    return <PermissionGuard permission={item.permission}>{children}</PermissionGuard>;
  }
  return <>{children}</>;
}

export function AccountingSubNav({
  onToggle,
  isCollapsed: externalCollapsed,
  sidebarCollapsed = false,
}: AccountingSubNavProps) {
  const pathname = usePathname();
  const { resolvedTheme, theme: activeTheme } = useTheme();
  const { isModuleEnabled } = useModules();
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const isCollapsed = externalCollapsed !== undefined ? externalCollapsed : internalCollapsed;

  const { primaryColor } = useBranding("authenticated");
  const branding = { primary_color: primaryColor };

  const activeItem = getAccountingActiveItem(pathname);
  const activeGroupId = getAccountingActiveGroupId(pathname);

  const defaultOpenGroups = useMemo(() => {
    const ids = ACCOUNTING_NAV_GROUPS.map((g) => g.id);
    if (activeGroupId && ids.includes(activeGroupId)) {
      return [activeGroupId];
    }
    return ["ledger"];
  }, [activeGroupId]);

  const [openGroups, setOpenGroups] = useState<string[]>(defaultOpenGroups);

  useEffect(() => {
    if (activeGroupId) {
      setOpenGroups((current) =>
        current.includes(activeGroupId) ? current : [...current, activeGroupId]
      );
    }
  }, [activeGroupId]);

  const handleToggle = () => {
    const newState = !isCollapsed;
    if (externalCollapsed === undefined) {
      setInternalCollapsed(newState);
    }
    onToggle?.(newState);
  };

  const isPerfexTheme = activeTheme.startsWith("perfex");
  const isDark = resolvedTheme === "dark";
  const visiblePrimary = branding.primary_color
    ? ensureVisibleColor(branding.primary_color, isDark)
    : undefined;
  const sidebarLeft = sidebarCollapsed
    ? "64px"
    : isPerfexTheme
      ? "var(--sidebar-width)"
      : "256px";

  if (!isModuleEnabled("accounting")) {
    return null;
  }

  const overviewGroup = ACCOUNTING_NAV_GROUPS.find((g) => g.id === "overview");
  const overviewItem = overviewGroup?.items[0];
  const dropdownGroups = ACCOUNTING_NAV_GROUPS.filter((g) => g.id !== "overview");

  const renderDesktopGroup = (group: AccountingNavGroup) => {
    const groupActive = group.items.some((item) => item.href === activeItem?.href);
    const GroupIcon = group.icon;

    if (isCollapsed) {
      if (group.items.length === 1) {
        const item = group.items[0];
        return (
          <div key={group.id}>
            <NavItemLink
              item={item}
              isActive={item.href === activeItem?.href}
              collapsed
              variant="desktop"
              visiblePrimary={visiblePrimary}
              brandingColor={branding.primary_color}
            />
          </div>
        );
      }

      return (
        <div key={group.id}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center justify-center rounded-lg px-2 py-2 transition-colors",
                  groupActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                )}
                title={group.label}
                style={
                  groupActive
                    ? { backgroundColor: `${visiblePrimary}15`, color: visiblePrimary }
                    : undefined
                }
              >
                <GroupIcon className="h-4 w-4 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="w-52">
              <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </p>
              {group.items.map((item) => (
                <GuardedNavItem key={item.href} item={item}>
                  <DropdownMenuItem asChild>
                    <NavItemLink
                      item={item}
                      isActive={item.href === activeItem?.href}
                      collapsed={false}
                      variant="dropdown"
                      visiblePrimary={visiblePrimary}
                    />
                  </DropdownMenuItem>
                </GuardedNavItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    }

    if (group.items.length === 1) {
      const item = group.items[0];
      return (
        <div key={group.id} className="px-1">
          <NavItemLink
            item={item}
            isActive={item.href === activeItem?.href}
            collapsed={false}
            variant="desktop"
            visiblePrimary={visiblePrimary}
            brandingColor={branding.primary_color}
          />
        </div>
      );
    }

    return (
      <AccordionItem key={group.id} value={group.id} className="border-none">
        <AccordionTrigger
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-medium hover:no-underline [&>svg]:h-3.5 [&>svg]:w-3.5",
            groupActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <span className="flex items-center gap-2.5">
            <GroupIcon className="h-4 w-4 shrink-0" />
            <span>{group.label}</span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="space-y-0.5 pb-1 pl-2 pt-0">
          {group.items.map((item) => (
            <NavItemLink
              key={item.href}
              item={item}
              isActive={item.href === activeItem?.href}
              collapsed={false}
              variant="desktop"
              visiblePrimary={visiblePrimary}
              brandingColor={branding.primary_color}
            />
          ))}
        </AccordionContent>
      </AccordionItem>
    );
  };

  const renderMobileGroup = (group: AccountingNavGroup) => {
    const groupActive = group.items.some((item) => item.href === activeItem?.href);

    if (group.id === "overview" && group.items.length === 1) {
      return (
        <NavItemLink
          key={group.id}
          item={group.items[0]}
          isActive={group.items[0].href === activeItem?.href}
          collapsed={false}
          variant="mobile"
          visiblePrimary={visiblePrimary}
        />
      );
    }

    return (
      <DropdownMenu key={group.id}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
              groupActive
                ? "font-semibold shadow-sm ring-1 ring-black/5 dark:ring-white/10"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
            style={
              groupActive
                ? { backgroundColor: `${visiblePrimary}15`, color: visiblePrimary }
                : undefined
            }
          >
            {group.label}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {group.items.map((item) => (
            <GuardedNavItem key={item.href} item={item}>
              <DropdownMenuItem asChild>
                <NavItemLink
                  item={item}
                  isActive={item.href === activeItem?.href}
                  collapsed={false}
                  variant="dropdown"
                  visiblePrimary={visiblePrimary}
                />
              </DropdownMenuItem>
            </GuardedNavItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <>
      {/* Mobile: grouped dropdown tabs */}
      <div
        className={cn(
          "fixed top-[var(--header-height)] left-0 right-0 z-20 border-b border-border bg-background shadow-sm lg:hidden",
          isPerfexTheme && "bg-card shadow-none"
        )}
      >
        <nav className="flex items-center gap-1.5 overflow-x-auto px-2 py-2 scrollbar-none">
          {ACCOUNTING_NAV_GROUPS.map(renderMobileGroup)}
        </nav>
      </div>

      {/* Desktop: accordion sidebar */}
      <aside
        className={cn(
          "fixed top-[var(--header-height)] bottom-0 z-10 hidden transition-all duration-200 lg:block",
          isPerfexTheme
            ? cn("border-r border-border bg-card", isCollapsed ? "w-12" : "w-52")
            : cn("border-r border-border bg-background shadow-sm", isCollapsed ? "w-12" : "w-52")
        )}
        style={{ left: sidebarLeft }}
      >
        <div className={cn(isPerfexTheme ? "pt-2" : "p-3", isCollapsed && "px-2")}>
          <div
            className={cn(
              "flex items-center",
              isPerfexTheme ? "mb-1 px-3 py-2" : "mb-3",
              isCollapsed ? "justify-center" : "justify-between"
            )}
          >
            {!isCollapsed && (
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Accounting
              </h2>
            )}
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-6 w-6 shrink-0", !isCollapsed && "ml-auto")}
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

          <nav className={isPerfexTheme ? "space-y-0" : "space-y-1"}>
            {!isCollapsed && overviewItem && (
              <div className="mb-1 px-1">
                <NavItemLink
                  item={overviewItem}
                  isActive={overviewItem.href === activeItem?.href}
                  collapsed={false}
                  variant="desktop"
                  visiblePrimary={visiblePrimary}
                  brandingColor={branding.primary_color}
                />
              </div>
            )}

            {isCollapsed && overviewItem && (
              <NavItemLink
                item={overviewItem}
                isActive={overviewItem.href === activeItem?.href}
                collapsed
                variant="desktop"
                visiblePrimary={visiblePrimary}
                brandingColor={branding.primary_color}
              />
            )}

            {!isCollapsed ? (
              <Accordion
                type="multiple"
                value={openGroups}
                onValueChange={(value) => setOpenGroups(Array.isArray(value) ? value : [value])}
                className="space-y-0.5"
              >
                {dropdownGroups.map(renderDesktopGroup)}
              </Accordion>
            ) : (
              dropdownGroups.map(renderDesktopGroup)
            )}
          </nav>
        </div>
      </aside>
    </>
  );
}
