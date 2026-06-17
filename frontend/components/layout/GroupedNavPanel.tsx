"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { NavIcon } from "@/components/layout/nav-group-types";
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
import type { NavGroup, NavGroupItem } from "./nav-group-types";
import {
  filterNavGroups,
  getActiveNavGroupId,
  getActiveNavItem,
} from "./nav-group-utils";

export interface GroupedNavPanelProps {
  groups: NavGroup[];
  layout: "sidebar" | "subnav";
  title?: string;
  module?: string;
  isCollapsed?: boolean;
  sidebarCollapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
  onItemClick?: () => void;
}

function GuardedItem({
  item,
  children,
}: {
  item: NavGroupItem;
  children: React.ReactNode;
}) {
  if (item.permissions?.length) {
    return <PermissionGuard permissions={[...item.permissions]}>{children}</PermissionGuard>;
  }
  if (item.permission) {
    return <PermissionGuard permission={item.permission}>{children}</PermissionGuard>;
  }
  return <>{children}</>;
}

function NavLink({
  item,
  isActive,
  collapsed,
  variant,
  visiblePrimary,
  brandingColor,
  layout,
  onItemClick,
  Icon,
}: {
  item: NavGroupItem;
  isActive: boolean;
  collapsed: boolean;
  variant: "mobile" | "desktop" | "dropdown" | "sidebar";
  visiblePrimary?: string;
  brandingColor?: string;
  layout: "sidebar" | "subnav";
  onItemClick?: () => void;
  Icon?: NavIcon;
}) {
  const isSidebar = layout === "sidebar";

  const className = cn(
    variant === "dropdown" &&
      "flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none",
    variant === "mobile" &&
      "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors",
    variant === "mobile" &&
      (isActive
        ? "font-semibold shadow-sm ring-1 ring-black/5 dark:ring-white/10"
        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"),
    variant === "desktop" &&
      cn(
        "flex items-center w-full transition-colors relative rounded-lg text-sm font-medium",
        collapsed ? "justify-center px-2 py-2" : "px-3 py-2",
        isActive
          ? "font-semibold shadow-sm ring-1 ring-black/5 dark:ring-white/10"
          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
      ),
    variant === "sidebar" &&
      cn(
        "group relative mx-2 mb-1 flex items-center overflow-hidden rounded-xl transition-colors duration-200",
        collapsed ? "justify-center px-2 py-2.5" : "px-3.5 py-2.5",
        isActive
          ? "shadow-md font-semibold ring-1 ring-black/5 dark:ring-white/5"
          : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
      )
  );

  const style =
    isActive && variant !== "dropdown"
      ? { backgroundColor: `${visiblePrimary}15`, color: visiblePrimary }
      : undefined;

  const link = (
    <Link
      href={item.href}
      onClick={onItemClick}
      className={className}
      style={style}
      title={collapsed ? item.name : item.description}
    >
      {isActive && variant === "sidebar" && (
        <div className="absolute inset-0 opacity-10" style={{ backgroundColor: visiblePrimary }} />
      )}
      {Icon && (
        <Icon
          className={cn(
            "shrink-0 transition-colors duration-200",
            variant === "mobile" && "h-3.5 w-3.5",
            variant === "dropdown" && "h-4 w-4 text-muted-foreground",
            (variant === "desktop" || variant === "sidebar") &&
              (collapsed
                ? isSidebar
                  ? "h-6 w-6"
                  : "h-4 w-4"
                : isSidebar
                  ? "mr-3.5 h-5 w-5"
                  : "mr-3 h-4 w-4"),
            isActive && variant !== "dropdown" ? "" : "text-muted-foreground group-hover:text-foreground"
          )}
          style={isActive && variant !== "dropdown" ? { color: visiblePrimary } : undefined}
        />
      )}
      {(variant === "mobile" || variant === "dropdown" || !collapsed) && (
        <span className={cn(variant === "dropdown" && "flex-1", variant === "sidebar" && "flex-1 tracking-tight")}>
          {item.name}
        </span>
      )}
      {isActive && variant === "desktop" && !collapsed && brandingColor && (
        <div
          className="absolute right-2 top-1/2 h-1 w-1 -translate-y-1/2 rounded-full"
          style={{ backgroundColor: brandingColor }}
        />
      )}
      {isActive && variant === "sidebar" && !collapsed && (
        <div
          className="ml-auto h-1.5 w-1.5 rounded-full shadow-sm"
          style={{ backgroundColor: visiblePrimary }}
        />
      )}
    </Link>
  );

  return <GuardedItem item={item}>{link}</GuardedItem>;
}

export function GroupedNavPanel({
  groups,
  layout,
  title,
  module,
  isCollapsed = false,
  sidebarCollapsed = false,
  onToggleCollapse,
  onItemClick,
}: GroupedNavPanelProps) {
  const pathname = usePathname();
  const { resolvedTheme, theme: activeTheme } = useTheme();
  const { canViewModuleManagement, isModuleEnabled } = useModules();
  const { primaryColor } = useBranding("authenticated");

  const isPerfexTheme = activeTheme.startsWith("perfex");
  const isDark = resolvedTheme === "dark";
  const visiblePrimary = primaryColor ? ensureVisibleColor(primaryColor, isDark) : undefined;
  const sidebarLeft = sidebarCollapsed
    ? "64px"
    : isPerfexTheme
      ? "var(--sidebar-width)"
      : "256px";

  const visibleGroups = useMemo(
    () =>
      filterNavGroups(groups, {
        isModuleEnabled,
        canViewModuleManagement,
      }),
    [groups, isModuleEnabled, canViewModuleManagement]
  );

  const allItems = useMemo(
    () => visibleGroups.flatMap((group) => group.items),
    [visibleGroups]
  );

  const activeItem = getActiveNavItem(pathname, allItems);
  const activeGroupId = getActiveNavGroupId(pathname, visibleGroups);

  const accordionGroups = visibleGroups.filter((group) => !group.pinned);
  const pinnedGroups = visibleGroups.filter((group) => group.pinned);

  const defaultOpenGroup =
    activeGroupId && accordionGroups.some((g) => g.id === activeGroupId)
      ? activeGroupId
      : accordionGroups[0]?.id ?? "";

  const [openGroup, setOpenGroup] = useState(defaultOpenGroup);

  useEffect(() => {
    if (activeGroupId) {
      setOpenGroup(activeGroupId);
    }
  }, [activeGroupId]);

  if (module && !isModuleEnabled(module)) {
    return null;
  }

  const renderPinnedItems = (variant: "desktop" | "sidebar" | "mobile") => {
    return pinnedGroups.flatMap((group) =>
      group.items.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          isActive={item.href === activeItem?.href}
          collapsed={variant !== "mobile" && isCollapsed}
          variant={variant}
          visiblePrimary={visiblePrimary}
          brandingColor={primaryColor}
          layout={layout}
          onItemClick={onItemClick}
          Icon={item.icon}
        />
      ))
    );
  };

  const renderAccordionGroup = (group: NavGroup, variant: "desktop" | "sidebar") => {
    const groupActive = group.items.some((item) => item.href === activeItem?.href);
    const GroupIcon = group.icon;

    if (isCollapsed) {
      if (group.items.length === 1) {
        const item = group.items[0];
        return (
          <div key={group.id}>
            <NavLink
              item={item}
              isActive={item.href === activeItem?.href}
              collapsed
              variant={variant}
              visiblePrimary={visiblePrimary}
              brandingColor={primaryColor}
              layout={layout}
              onItemClick={onItemClick}
              Icon={item.icon}
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
                  layout === "sidebar" && "mx-2 mb-1 rounded-xl",
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
                <GroupIcon className={cn("shrink-0", layout === "sidebar" ? "h-6 w-6" : "h-4 w-4")} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="w-52">
              <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </p>
              {group.items.map((item) => (
                <GuardedItem key={item.href} item={item}>
                  <DropdownMenuItem asChild>
                    <NavLink
                      item={item}
                      isActive={item.href === activeItem?.href}
                      collapsed={false}
                      variant="dropdown"
                      visiblePrimary={visiblePrimary}
                      layout={layout}
                      onItemClick={onItemClick}
                      Icon={item.icon}
                    />
                  </DropdownMenuItem>
                </GuardedItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    }

    if (group.items.length === 1) {
      const item = group.items[0];
      return (
        <div key={group.id} className={layout === "subnav" ? "px-1" : undefined}>
          <NavLink
            item={item}
            isActive={item.href === activeItem?.href}
            collapsed={false}
            variant={variant}
            visiblePrimary={visiblePrimary}
            brandingColor={primaryColor}
            layout={layout}
            onItemClick={onItemClick}
            Icon={item.icon}
          />
        </div>
      );
    }

    return (
      <AccordionItem key={group.id} value={group.id} className="border-none">
        <AccordionTrigger
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-medium hover:no-underline [&>svg]:h-3.5 [&>svg]:w-3.5",
            layout === "sidebar" && "mx-2 mb-0.5",
            groupActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <span className="flex items-center gap-2.5">
            <GroupIcon className="h-4 w-4 shrink-0" />
            <span>{group.label}</span>
          </span>
        </AccordionTrigger>
        <AccordionContent
          className={cn("space-y-0.5 pb-1 pt-0", layout === "subnav" ? "pl-2" : "pl-3")}
        >
          {group.items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              isActive={item.href === activeItem?.href}
              collapsed={false}
              variant={variant}
              visiblePrimary={visiblePrimary}
              brandingColor={primaryColor}
              layout={layout}
              onItemClick={onItemClick}
              Icon={item.icon}
            />
          ))}
        </AccordionContent>
      </AccordionItem>
    );
  };

  const renderMobileGroup = (group: NavGroup) => {
    const groupActive = group.items.some((item) => item.href === activeItem?.href);

    if (group.pinned && group.items.length === 1) {
      return (
        <NavLink
          key={group.id}
          item={group.items[0]}
          isActive={group.items[0].href === activeItem?.href}
          collapsed={false}
          variant="mobile"
          visiblePrimary={visiblePrimary}
          layout={layout}
          onItemClick={onItemClick}
          Icon={group.items[0].icon}
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
            <GuardedItem key={item.href} item={item}>
              <DropdownMenuItem asChild>
                <NavLink
                  item={item}
                  isActive={item.href === activeItem?.href}
                  collapsed={false}
                  variant="dropdown"
                  visiblePrimary={visiblePrimary}
                  layout={layout}
                  onItemClick={onItemClick}
                  Icon={item.icon}
                />
              </DropdownMenuItem>
            </GuardedItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  if (layout === "sidebar") {
    return (
      <nav className={cn("space-y-1", isCollapsed && "px-0")}>
        {renderPinnedItems("sidebar")}
        {!isCollapsed ? (
          <Accordion
            type="single"
            collapsible
            value={openGroup}
            onValueChange={(value) => setOpenGroup(Array.isArray(value) ? value[0] ?? "" : value)}
            className="space-y-0.5"
          >
            {accordionGroups.map((group) => renderAccordionGroup(group, "sidebar"))}
          </Accordion>
        ) : (
          accordionGroups.map((group) => renderAccordionGroup(group, "sidebar"))
        )}
      </nav>
    );
  }

  return (
    <>
      <div
        className={cn(
          "fixed top-[var(--header-height)] left-0 right-0 z-20 border-b border-border bg-background shadow-sm lg:hidden",
          isPerfexTheme && "bg-card shadow-none"
        )}
      >
        <nav className="flex items-center gap-1.5 overflow-x-auto px-2 py-2 scrollbar-none">
          {visibleGroups.map(renderMobileGroup)}
        </nav>
      </div>

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
            {!isCollapsed && title && (
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {title}
              </h2>
            )}
            {onToggleCollapse && (
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-6 w-6 shrink-0", !isCollapsed && "ml-auto")}
                onClick={() => onToggleCollapse(!isCollapsed)}
                title={isCollapsed ? "Expand" : "Collapse"}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>

          <div className={isPerfexTheme ? "space-y-0" : "space-y-1"}>
            {!isCollapsed && pinnedGroups.length > 0 && (
              <div className="mb-1 space-y-0.5 px-1">{renderPinnedItems("desktop")}</div>
            )}
            {isCollapsed && renderPinnedItems("desktop")}

            {!isCollapsed ? (
              <Accordion
                type="single"
                collapsible
                value={openGroup}
                onValueChange={(value) => setOpenGroup(Array.isArray(value) ? value[0] ?? "" : value)}
                className="space-y-0.5"
              >
                {accordionGroups.map((group) => renderAccordionGroup(group, "desktop"))}
              </Accordion>
            ) : (
              accordionGroups.map((group) => renderAccordionGroup(group, "desktop"))
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
