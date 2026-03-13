"use client";

import React from "react";
import { cn } from "@/lib/utils/cn";
import { PremiumIcons } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/utils/permissions";
import LinkNext from "next/link";

interface QuickAction {
  label: string;
  icon: React.ReactNode;
  href: string;
  color: string;
  category: string;
  permission: string;
}

export function QuickActionsMenu() {
  const { hasPermission } = usePermissions();

  const allActions: QuickAction[] = [
    {
      label: "New Work Order",
      icon: <PremiumIcons.Wrench className="w-4 h-4" />,
      href: "/workorders/new",
      color: "text-blue-500",
      category: "Operations",
      permission: PERMISSIONS.CREATE_WORKORDERS
    },
    {
      label: "New Customer",
      icon: <PremiumIcons.Users className="w-4 h-4" />,
      href: "/customers/new",
      color: "text-emerald-500",
      category: "Management",
      permission: PERMISSIONS.CREATE_CUSTOMERS
    },
    {
      label: "New Vehicle",
      icon: <PremiumIcons.Car className="w-4 h-4" />,
      href: "/vehicles/new",
      color: "text-amber-500",
      category: "Management",
      permission: PERMISSIONS.CREATE_VEHICLES
    },
    {
      label: "New Appointment",
      icon: <PremiumIcons.Calendar className="w-4 h-4" />,
      href: "/appointments/new",
      color: "text-purple-500",
      category: "Operations",
      permission: PERMISSIONS.CREATE_APPOINTMENTS
    },
    {
      label: "New Invoice",
      icon: <PremiumIcons.Receipt className="w-4 h-4" />,
      href: "/billing/invoices/new",
      color: "text-pink-500",
      category: "Billing",
      permission: PERMISSIONS.CREATE_INVOICES
    },
  ];

  const actions = allActions.filter(action => hasPermission(action.permission));

  if (actions.length === 0) return null;

  // Group actions by category
  const categories = Array.from(new Set(actions.map(a => a.category)));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 rounded-xl border-border bg-muted/50 hover:bg-card hover:border-primary/30 transition-all shadow-sm group"
          title="Quick Actions"
        >
          <PremiumIcons.Plus className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 p-2 rounded-xl border-border/50 bg-background/95 backdrop-blur-xl shadow-2xl">
        <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Quick Actions
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-border/50" />
        
        {categories.map((category) => (
          <React.Fragment key={category}>
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-tighter text-muted-foreground/50 mt-1">
              {category}
            </div>
            {actions
              .filter((a) => a.category === category)
              .map((action) => (
                <DropdownMenuItem key={action.label} asChild className="rounded-lg focus:bg-primary/5 focus:text-primary cursor-pointer">
                  <LinkNext href={action.href} className="flex items-center gap-3 w-full px-2 py-2">
                    <div className={cn("p-1.5 rounded-md bg-background border border-border/50", action.color)}>
                      {action.icon}
                    </div>
                    <span className="font-medium text-sm">{action.label}</span>
                  </LinkNext>
                </DropdownMenuItem>
              ))}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
