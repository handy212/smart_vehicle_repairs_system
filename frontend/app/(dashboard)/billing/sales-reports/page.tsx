"use client";

import Link from "next/link";
import { ArrowRight, BarChart3, FileText, PieChart, Receipt } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const LINKS = [
  {
    title: "Revenue Report",
    description: "Revenue by period, service type, and collection trends.",
    href: "/reports/financial",
    icon: BarChart3,
  },
  {
    title: "Management Reports",
    description: "Executive KPIs, branch scorecards, and revenue mix.",
    href: "/accounting/reports/management",
    icon: PieChart,
  },
  {
    title: "Invoices",
    description: "Customer invoices, aging, and collections.",
    href: "/billing/invoices",
    icon: Receipt,
  },
  {
    title: "Collections",
    description: "Overdue invoices and days past due.",
    href: "/billing/collections",
    icon: FileText,
  },
];

export default function SalesReportsPage() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sales Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Revenue analytics, management reporting, and receivables.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
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
                  <span className="text-xs font-medium text-primary">Open report</span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
