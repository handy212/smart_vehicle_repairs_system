"use client";

import Link from "next/link";
import { ArrowRight, Calculator, ClipboardList, Wrench } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const LINKS = [
  {
    title: "Work Orders",
    description: "Active jobs, diagnosis, repairs, and shop floor pipeline.",
    href: "/workorders",
    icon: Wrench,
  },
  {
    title: "Estimates",
    description: "Customer quotes awaiting approval or conversion.",
    href: "/billing/estimates",
    icon: Calculator,
  },
  {
    title: "Kanban Board",
    description: "Visual work order board by stage.",
    href: "/workorders/kanban",
    icon: ClipboardList,
  },
];

export default function SalesOrdersPage() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sales Orders</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Work orders and estimates — your operational sales pipeline without a separate sales order model.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <Link key={link.href} href={link.href} className="group">
              <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/20">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <CardTitle className="text-base">{link.title}</CardTitle>
                  <CardDescription>{link.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="text-xs font-medium text-primary">Open</span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
