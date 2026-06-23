"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { DASHBOARD_REQUIREMENTS_NAV_GROUPS } from "@/components/layout/dashboard-requirements-nav-config";
import { filterNavGroups } from "@/components/layout/nav-group-utils";
import type { NavGroup, NavGroupItem, NavIcon } from "@/components/layout/nav-group-types";
import { useModules } from "@/lib/hooks/useModules";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { cn } from "@/lib/utils/cn";

function splitIntoGridColumns<T>(items: T[], columnCount: number): T[][] {
  if (columnCount <= 1) {
    return [items];
  }

  const columns = Array.from({ length: columnCount }, () => [] as T[]);
  items.forEach((item, index) => {
    columns[index % columnCount].push(item);
  });
  return columns;
}

function useDashboardRequirementsColumnCount() {
  const [columnCount, setColumnCount] = useState(1);

  useEffect(() => {
    const update = () => {
      const width = window.innerWidth;
      setColumnCount(width >= 1280 ? 3 : width >= 640 ? 2 : 1);
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return columnCount;
}

function itemIsVisible(
  item: NavGroupItem,
  hasPermission: (permission: string) => boolean,
  hasAnyPermission: (permissions: string[]) => boolean
) {
  if (item.permissions?.length) {
    return hasAnyPermission(item.permissions);
  }
  if (item.permission) {
    return hasPermission(item.permission);
  }
  return true;
}

function filterVisibleGroups(
  groups: NavGroup[],
  options: {
    hasPermission: (permission: string) => boolean;
    hasAnyPermission: (permissions: string[]) => boolean;
    isModuleEnabled: (module: string) => boolean;
    canViewModuleManagement: boolean;
  }
): NavGroup[] {
  const moduleFiltered = filterNavGroups(groups, {
    isModuleEnabled: options.isModuleEnabled,
    canViewModuleManagement: options.canViewModuleManagement,
  });

  return moduleFiltered
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          (!item.superAdminOnly || options.canViewModuleManagement) &&
          itemIsVisible(item, options.hasPermission, options.hasAnyPermission)
      ),
    }))
    .filter((group) => group.items.length > 0);
}

function RequirementLink({
  item,
  Icon,
}: {
  item: NavGroupItem;
  Icon?: NavIcon;
}) {
  return (
    <Link
      href={item.href}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-primary/80" />}
      <span className="leading-snug">{item.name}</span>
    </Link>
  );
}

function RequirementGroup({
  group,
}: {
  group: NavGroup;
}) {
  const GroupIcon = group.icon;

  return (
    <AccordionItem
      value={group.id}
      className="h-auto rounded-md border border-border/70 border-b border-border/70 bg-background/70 px-2"
    >
      <AccordionTrigger
        className={cn(
          "rounded-md px-2 py-2.5 text-sm font-medium hover:no-underline [&>svg]:h-3.5 [&>svg]:w-3.5",
          "text-foreground"
        )}
      >
        <span className="flex items-center gap-2 text-left">
          <GroupIcon className="h-4 w-4 shrink-0 text-primary" />
          <span>{group.label}</span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-0.5 pb-2 pt-0">
        {group.items.map((item) => (
          <RequirementLink key={`${group.id}-${item.href}-${item.name}`} item={item} Icon={item.icon} />
        ))}
      </AccordionContent>
    </AccordionItem>
  );
}

export function DashboardRequirementsPanel() {
  const { hasPermission, hasAnyPermission } = usePermissions();
  const { isModuleEnabled, canViewModuleManagement } = useModules();
  const columnCount = useDashboardRequirementsColumnCount();

  const visibleGroups = useMemo(
    () =>
      filterVisibleGroups(DASHBOARD_REQUIREMENTS_NAV_GROUPS, {
        hasPermission,
        hasAnyPermission,
        isModuleEnabled,
        canViewModuleManagement,
      }),
    [hasPermission, hasAnyPermission, isModuleEnabled, canViewModuleManagement]
  );

  const groupedColumns = useMemo(
    () => splitIntoGridColumns(visibleGroups, columnCount),
    [visibleGroups, columnCount]
  );

  const [openGroup, setOpenGroup] = useState(visibleGroups[0]?.id ?? "");

  if (visibleGroups.length === 0) {
    return null;
  }

  return (
    <Card className="rounded-md border border-border bg-card shadow-[0px_1px_15px_1px_rgba(90,90,90,0.08)]">
      <CardHeader className="border-b border-border/60 px-4 py-3">
        <CardTitle className="text-sm font-semibold">Dashboard Requirements</CardTitle>
      </CardHeader>
      <CardContent className="p-3">
        <Accordion
          type="single"
          collapsible
          value={openGroup}
          onValueChange={(value) => setOpenGroup(Array.isArray(value) ? value[0] ?? "" : value)}
        >
          <div
            className={cn(
              "flex items-start gap-2",
              columnCount > 1 ? "flex-row" : "flex-col"
            )}
          >
            {groupedColumns.map((columnGroups, columnIndex) => (
              <div
                key={`requirements-column-${columnIndex}`}
                className="flex min-w-0 flex-1 flex-col gap-2"
              >
                {columnGroups.map((group) => (
                  <RequirementGroup key={group.id} group={group} />
                ))}
              </div>
            ))}
          </div>
        </Accordion>
      </CardContent>
    </Card>
  );
}
