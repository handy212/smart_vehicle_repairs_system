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
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import { NavCategoryBadge } from "./NavCategoryBadge";

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
  layout,
  onItemClick,
  Icon,
  groupId,
  nested = false,
}: {
  item: NavGroupItem;
  isActive: boolean;
  collapsed: boolean;
  variant: "mobile" | "desktop" | "dropdown" | "sidebar";
  visiblePrimary?: string;
  layout: "sidebar" | "subnav";
  onItemClick?: () => void;
  Icon?: NavIcon;
  groupId?: string;
  nested?: boolean;
}) {
  const className = cn(
    "transition-colors duration-150",
    variant === "dropdown" &&
      "flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm outline-none",
    variant === "mobile" &&
      cn(
        "flex items-center gap-2 px-3 py-1.5 text-sm font-medium whitespace-nowrap shrink-0 rounded-full",
        isActive
          ? "font-semibold bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      ),
    variant === "desktop" &&
      cn(
        "flex w-full items-center rounded-md text-sm",
        collapsed
          ? "justify-center p-1.5"
          : cn("py-1.5", nested ? "pl-3 pr-2" : "px-2.5 gap-2.5"),
        !collapsed && isActive
          ? "font-medium text-foreground bg-muted/80"
          : !collapsed
            ? "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            : ""
      ),
    variant === "sidebar" &&
      cn(
        "flex items-center rounded-md text-sm",
        collapsed
          ? "mx-1.5 justify-center p-1.5"
          : cn(nested ? "py-1.5 pr-2" : "mx-1.5 gap-2.5 px-2.5 py-2"),
        !collapsed && isActive
          ? cn(
              "font-medium text-foreground",
              nested ? "bg-muted/70" : "bg-muted/80"
            )
          : !collapsed
            ? "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            : ""
      )
  );

  const style: React.CSSProperties | undefined =
    isActive && visiblePrimary
      ? {
          ...(nested && !collapsed
            ? { boxShadow: `inset 2px 0 0 ${visiblePrimary}` }
            : {}),
          ...(!nested && !collapsed ? { color: visiblePrimary } : {}),
        }
      : undefined;

  return (
    <GuardedItem item={item}>
      <Link
        href={item.href}
        onClick={onItemClick}
        className={className}
        style={style}
        title={collapsed ? item.name : item.description}
        aria-current={isActive ? "page" : undefined}
      >
        {Icon && groupId && !nested && (
          <NavCategoryBadge
            icon={Icon}
            groupId={groupId}
            size="sm"
            active={isActive}
          />
        )}
        {(variant === "mobile" || variant === "dropdown" || !collapsed) && (
          <span className={cn("truncate", variant === "dropdown" && "flex-1")}>
            {item.name}
          </span>
        )}
      </Link>
    </GuardedItem>
  );
}

function NavGroupChildren({
  group,
  variant,
  activeItem,
  visiblePrimary,
  layout,
  onItemClick,
}: {
  group: NavGroup;
  variant: "desktop" | "sidebar";
  activeItem: NavGroupItem | null;
  visiblePrimary?: string;
  layout: "sidebar" | "subnav";
  onItemClick?: () => void;
}) {
  return (
    <div className="ml-[1.125rem] space-y-0.5 border-l border-border/60 pl-3">
      {group.items.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          isActive={item.href === activeItem?.href}
          collapsed={false}
          variant={variant}
          visiblePrimary={visiblePrimary}
          layout={layout}
          onItemClick={onItemClick}
          nested
        />
      ))}
    </div>
  );
}

function NavSectionLabel({
  group,
  groupActive,
  compact = false,
}: {
  group: NavGroup;
  groupActive: boolean;
  compact?: boolean;
}) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2.5">
      <NavCategoryBadge
        icon={group.icon}
        groupId={group.id}
        size={compact ? "xs" : "sm"}
        active={groupActive}
      />
      <span
        className={cn(
          "truncate font-semibold leading-none",
          compact
            ? "text-[11px] uppercase tracking-wide text-muted-foreground"
            : "text-sm text-foreground"
        )}
      >
        {group.label}
      </span>
    </span>
  );
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
  const isSubnav = layout === "subnav";

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

  const defaultOpenGroup = useMemo(() => {
    if (activeGroupId && accordionGroups.some((g) => g.id === activeGroupId)) {
      return activeGroupId;
    }
    return accordionGroups[0]?.id ?? "";
  }, [accordionGroups, activeGroupId]);

  const defaultOpenGroups = useMemo(() => {
    const ids = accordionGroups.map((group) => group.id);
    if (activeGroupId && ids.includes(activeGroupId)) {
      return [activeGroupId];
    }
    return ids.length > 0 ? [ids[0]] : [];
  }, [accordionGroups, activeGroupId]);

  const [openGroup, setOpenGroup] = useState(defaultOpenGroup);
  const [openGroups, setOpenGroups] = useState<string[]>(defaultOpenGroups);

  useEffect(() => {
    if (activeGroupId) {
      setOpenGroup(activeGroupId);
      setOpenGroups((current) =>
        current.includes(activeGroupId) ? current : [...current, activeGroupId]
      );
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
          layout={layout}
          onItemClick={onItemClick}
          Icon={group.icon}
          groupId={group.id}
        />
      ))
    );
  };

  const renderCollapsedGroup = (group: NavGroup, variant: "desktop" | "sidebar") => {
    const groupActive = group.items.some((item) => item.href === activeItem?.href);

    if (group.items.length === 1) {
      return (
        <NavLink
          key={group.id}
          item={group.items[0]}
          isActive={group.items[0].href === activeItem?.href}
          collapsed
          variant={variant}
          visiblePrimary={visiblePrimary}
          layout={layout}
          onItemClick={onItemClick}
          Icon={group.icon}
          groupId={group.id}
        />
      );
    }

    return (
      <DropdownMenu key={group.id} modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "mx-1.5 flex w-full max-w-full items-center justify-center rounded-md p-1.5 transition-colors hover:bg-muted/50",
              groupActive && "bg-muted/60"
            )}
            title={group.label}
            aria-label={group.label}
          >
            <NavCategoryBadge
              icon={group.icon}
              groupId={group.id}
              size="sm"
              active={groupActive}
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="right"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="z-[200] max-h-[min(24rem,calc(100vh-var(--header-height)-2rem))] w-56 overflow-y-auto"
        >
          <DropdownMenuLabel className="text-sm font-semibold">{group.label}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {group.items.map((item) => (
            <GuardedItem key={item.href} item={item}>
              <DropdownMenuItem asChild>
                <Link
                  href={item.href}
                  onClick={onItemClick}
                  className={cn(
                    "cursor-pointer text-sm",
                    item.href === activeItem?.href && "font-medium text-foreground"
                  )}
                >
                  {item.name}
                </Link>
              </DropdownMenuItem>
            </GuardedItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const renderExpandedGroup = (group: NavGroup, variant: "desktop" | "sidebar") => {
    const groupActive = group.items.some((item) => item.href === activeItem?.href);

    if (group.items.length === 1) {
      const item = group.items[0];
      return (
        <div key={group.id}>
          <NavLink
            item={item}
            isActive={item.href === activeItem?.href}
            collapsed={false}
            variant={variant}
            visiblePrimary={visiblePrimary}
            layout={layout}
            onItemClick={onItemClick}
            Icon={group.icon}
            groupId={group.id}
          />
        </div>
      );
    }

    return (
      <AccordionItem key={group.id} value={group.id} className="border-none">
        <AccordionTrigger
          className={cn(
            "rounded-md px-2.5 py-2 hover:no-underline [&>svg:last-child]:ml-2 [&>svg:last-child]:h-3.5 [&>svg:last-child]:w-3.5 [&>svg:last-child]:opacity-50",
            layout === "sidebar" && "mx-1.5 w-[calc(100%-0.75rem)]",
            isSubnav && variant === "desktop" && "w-full",
            groupActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <NavSectionLabel group={group} groupActive={groupActive} compact={isSubnav} />
        </AccordionTrigger>
        <AccordionContent className="pb-1 pt-0 [&>div]:pb-1 [&>div]:pt-0">
          <NavGroupChildren
            group={group}
            variant={variant}
            activeItem={activeItem}
            visiblePrimary={visiblePrimary}
            layout={layout}
            onItemClick={onItemClick}
          />
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
          Icon={group.icon}
          groupId={group.id}
        />
      );
    }

    return (
      <DropdownMenu key={group.id}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
              groupActive
                ? "bg-muted font-semibold text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            {group.label}
            <ChevronDown className="h-3.5 w-3.5 opacity-50" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          {group.items.map((item) => (
            <GuardedItem key={item.href} item={item}>
              <DropdownMenuItem asChild>
                <Link
                  href={item.href}
                  onClick={onItemClick}
                  className={cn(
                    "cursor-pointer text-sm",
                    item.href === activeItem?.href && "font-medium"
                  )}
                >
                  {item.name}
                </Link>
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
            onValueChange={(value) =>
              setOpenGroup(Array.isArray(value) ? value[0] ?? "" : value)
            }
            className="space-y-0.5"
          >
            {accordionGroups.map((group) => renderExpandedGroup(group, "sidebar"))}
          </Accordion>
        ) : (
          accordionGroups.map((group) => renderCollapsedGroup(group, "sidebar"))
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
        <div
          className={cn(
            "flex h-full flex-col",
            isPerfexTheme ? "pt-2" : "p-3",
            isCollapsed && "px-1.5"
          )}
        >
          <div
            className={cn(
              "flex items-center",
              isPerfexTheme ? "mb-1 px-2 py-1.5" : "mb-2",
              isCollapsed ? "justify-center" : "justify-between"
            )}
          >
            {!isCollapsed && title && (
              <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {title}
              </h2>
            )}
            {onToggleCollapse && (
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-7 w-7 shrink-0", !isCollapsed && "ml-auto")}
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

          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {!isCollapsed && pinnedGroups.length > 0 && (
              <div className="mb-2 space-y-0.5">{renderPinnedItems("desktop")}</div>
            )}
            {isCollapsed && renderPinnedItems("desktop")}

            {!isCollapsed ? (
              <Accordion
                type="multiple"
                value={openGroups}
                onValueChange={(value) =>
                  setOpenGroups(Array.isArray(value) ? value : value ? [value] : [])
                }
                className="space-y-0.5"
              >
                {accordionGroups.map((group) => renderExpandedGroup(group, "desktop"))}
              </Accordion>
            ) : (
              accordionGroups.map((group) => renderCollapsedGroup(group, "desktop"))
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
