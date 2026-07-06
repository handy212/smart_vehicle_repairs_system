"use client";

import { GroupedNavPanel } from "./GroupedNavPanel";
import {
  SUB_NAV_GROUPS,
  SUB_NAV_MODULES,
  SUB_NAV_TITLES,
  getSubNavGroupKey,
} from "./sub-nav-groups";
import { flattenNavGroups } from "./nav-group-utils";
import type { NavGroupItem } from "./nav-group-types";

export interface SubNavItem extends NavGroupItem {
  group?: string;
}

interface SubNavProps {
  title: string;
  groups: import("./nav-group-types").NavGroup[];
  onToggle?: (collapsed: boolean) => void;
  isCollapsed?: boolean;
  sidebarCollapsed?: boolean;
  module?: string;
}

export function SubNav({
  title,
  groups,
  onToggle,
  isCollapsed,
  sidebarCollapsed,
  module,
}: SubNavProps) {
  return (
    <GroupedNavPanel
      groups={groups}
      layout="subnav"
      title={title}
      module={module}
      isCollapsed={isCollapsed}
      sidebarCollapsed={sidebarCollapsed}
      onToggleCollapse={onToggle}
    />
  );
}

/** @deprecated Use SUB_NAV_GROUPS — flat list kept for legacy imports */
export const subNavConfig: Record<string, SubNavItem[]> = Object.fromEntries(
  Object.entries(SUB_NAV_GROUPS).map(([key, groups]) => [
    key,
    flattenNavGroups(groups).map((item) => ({
      ...item,
      group: groups.find((g) => g.items.some((i) => i.href === item.href))?.label,
    })),
  ])
);

export function getSubNavConfig(
  pathname: string | null
): { groups: import("./nav-group-types").NavGroup[]; title: string; module?: string } | null {
  const key = getSubNavGroupKey(pathname);
  if (!key) return null;

  return {
    groups: SUB_NAV_GROUPS[key],
    title: SUB_NAV_TITLES[key],
    module: SUB_NAV_MODULES[key],
  };
}
