"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { accountingApi, type Budget } from "@/lib/api/accounting";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Calendar, Lock, Shield } from "lucide-react";

export default function FiscalYearPage() {
  const { data: budgets = [], isLoading } = useQuery({
    queryKey: ["budgets", "fiscal-year"],
    queryFn: () => accountingApi.getBudgets(),
  });

  const { data: settings } = useQuery({
    queryKey: ["accounting", "settings", "fiscal-year"],
    queryFn: () => accountingApi.getAccountingSettings(),
  });

  const fiscalYears = useMemo(() => {
    const grouped = new Map<number, Budget[]>();
    for (const budget of budgets) {
      const year = budget.fiscal_year;
      const list = grouped.get(year) ?? [];
      list.push(budget);
      grouped.set(year, list);
    }
    return [...grouped.entries()].sort((a, b) => b[0] - a[0]);
  }, [budgets]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Budgets by Year & Period Lock</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review budgets grouped by calendar year and manage the accounting period lock date.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/accounting/controls">
            <Shield className="mr-2 h-4 w-4" />
            Period Lock & Controls
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" />
            Period Lock
          </CardTitle>
          <CardDescription>
            Transactions on or before the lock date cannot be posted or edited.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Current lock date</p>
            <p className="text-lg font-semibold">
              {settings?.period_lock_date
                ? format(new Date(settings.period_lock_date), "MMM d, yyyy")
                : "Not set"}
            </p>
          </div>
          <Button asChild>
            <Link href="/accounting/controls">Manage in Controls</Link>
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <TableSkeleton columns={5} rows={6} />
      ) : fiscalYears.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Calendar className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No budgets configured yet.</p>
            <Button className="mt-4" variant="outline" asChild>
              <Link href="/accounting/budgets">Create a budget</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        fiscalYears.map(([year, yearBudgets]) => (
          <Card key={year}>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">FY {year}</CardTitle>
                <Badge variant="outline">{yearBudgets.length} budget{yearBudgets.length === 1 ? "" : "s"}</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Budget</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {yearBudgets.map((budget) => (
                    <TableRow key={budget.id}>
                      <TableCell className="font-medium">{budget.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {budget.start_date} — {budget.end_date}
                      </TableCell>
                      <TableCell>{budget.branch_name ?? "All branches"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{budget.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="link" className="px-0" asChild>
                          <Link href={`/accounting/budgets/${budget.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
