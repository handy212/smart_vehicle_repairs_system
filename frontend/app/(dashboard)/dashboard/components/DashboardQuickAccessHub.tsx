"use client";

import Link from "next/link";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { useModules } from "@/lib/hooks/useModules";
import {
  DASHBOARD_QUICK_ACCESS_GROUPS,
  type DashboardQuickAccessGroup,
  type DashboardQuickAccessItem,
} from "@/lib/utils/dashboard-quick-access";
import { cn } from "@/lib/utils/cn";
import {
  ArrowRight,
  Banknote,
  BookOpen,
  Boxes,
  Briefcase,
  Calculator,
  FileBarChart,
  HandCoins,
  Landmark,
  Receipt,
  ShieldAlert,
  Users,
} from "lucide-react";

const GROUP_ICONS = {
  "customers-sales": Users,
  "vendors-purchases": HandCoins,
  "inventory-management": Boxes,
  "banking-cash": Banknote,
  "company-gl": BookOpen,
  "employees-payroll": Briefcase,
  "fixed-assets": Landmark,
  "accounts-receivable": Receipt,
  "accounts-payable": Calculator,
  "finance-reporting": FileBarChart,
  "tax-management": ShieldAlert,
} as const;

function filterVisibleGroups(
  groups: DashboardQuickAccessGroup[],
  hasPermission: (permission: string) => boolean,
  isModuleEnabled: (slug: string) => boolean
) {
  return groups
    .map((group) => {
      const items = group.items.filter((item) => {
        if (item.permission && !hasPermission(item.permission)) {
          return false;
        }

        if (item.module && !isModuleEnabled(item.module)) {
          return false;
        }

        return true;
      });

      return {
        ...group,
        items,
      };
    })
    .filter((group) => group.items.length > 0);
}

function QuickAccessRow({ item }: { item: DashboardQuickAccessItem }) {
  const content = (
    <>
      <span className="truncate">{item.label}</span>
      <span className="ml-auto flex items-center gap-2 pl-3">
        {!item.enabled && item.badge ? (
          <Badge
            variant="outline"
            className="border-dashed text-[10px] uppercase tracking-wider text-muted-foreground"
          >
            {item.badge}
          </Badge>
        ) : (
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        )}
      </span>
    </>
  );

  if (!item.enabled || !item.href) {
    return (
      <div
        aria-disabled="true"
        className="flex items-center rounded-xl border border-dashed border-border/80 bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground"
        data-testid={`quick-access-item-${item.id}`}
      >
        {content}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      className="group flex items-center rounded-xl border border-border/80 bg-background px-3 py-2.5 text-sm text-foreground transition-colors hover:border-primary/20 hover:bg-primary/5"
      data-testid={`quick-access-item-${item.id}`}
    >
      {content}
    </Link>
  );
}

export function DashboardQuickAccessHub() {
  const { hasPermission } = usePermissions();
  const { isModuleEnabled } = useModules();

  const visibleGroups = filterVisibleGroups(
    DASHBOARD_QUICK_ACCESS_GROUPS,
    hasPermission,
    isModuleEnabled
  );

  if (visibleGroups.length === 0) {
    return null;
  }

  return (
    <Card className="border-border/80 bg-card/95 shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Quick Access Hub</CardTitle>
            <CardDescription className="mt-1">
              Open customer, purchasing, payroll, accounting, and reporting tasks from one place.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
            Dashboard shortcuts
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Accordion
          type="multiple"
          defaultValue={visibleGroups.slice(0, 3).map((group) => group.id)}
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {visibleGroups.map((group) => {
            const Icon = GROUP_ICONS[group.id as keyof typeof GROUP_ICONS] ?? FileBarChart;
            const liveCount = group.items.filter((item) => item.enabled && item.href).length;

            return (
              <AccordionItem
                key={group.id}
                value={group.id}
                className="overflow-hidden rounded-2xl border border-border bg-background/70"
                data-testid={`quick-access-group-${group.id}`}
              >
                <AccordionTrigger
                  className={cn(
                    "px-4 py-4 hover:no-underline [&[data-state=open]>svg]:rotate-180",
                    "items-start gap-3"
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3 text-left">
                    <div className="rounded-xl bg-primary/10 p-2 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-foreground">{group.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {liveCount} live link{liveCount === 1 ? "" : "s"} available
                      </div>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-2">
                    {group.items.map((item) => (
                      <QuickAccessRow key={item.id} item={item} />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}

export { filterVisibleGroups };
