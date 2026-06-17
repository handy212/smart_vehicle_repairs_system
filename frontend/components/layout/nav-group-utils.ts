import type { NavGroup, NavGroupItem } from "./nav-group-types";

export function flattenNavGroups(groups: NavGroup[]): NavGroupItem[] {
  return groups.flatMap((group) => group.items);
}

export function getActiveNavItem(
  pathname: string | null,
  items: NavGroupItem[]
): NavGroupItem | null {
  if (!pathname) return null;

  const matches = items.filter(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );

  if (matches.length === 0) return null;

  return matches.reduce((prev, curr) =>
    curr.href.length > prev.href.length ? curr : prev
  );
}

export function getActiveNavGroupId(
  pathname: string | null,
  groups: NavGroup[]
): string | null {
  const activeItem = getActiveNavItem(pathname, flattenNavGroups(groups));
  if (!activeItem) return null;

  return (
    groups.find((group) => group.items.some((item) => item.href === activeItem.href))
      ?.id ?? null
  );
}

export function filterNavGroups(
  groups: NavGroup[],
  options: {
    isModuleEnabled: (module: string) => boolean;
    canViewModuleManagement?: boolean;
  }
): NavGroup[] {
  const { isModuleEnabled, canViewModuleManagement = false } = options;

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.superAdminOnly && !canViewModuleManagement) return false;
        if (item.module && !isModuleEnabled(item.module)) return false;
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);
}
