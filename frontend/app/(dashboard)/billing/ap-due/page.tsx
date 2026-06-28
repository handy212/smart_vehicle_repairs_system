"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { accountingApi } from "@/lib/api/accounting";
import { billingApi } from "@/lib/api/billing";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { cn } from "@/lib/utils/cn";

type DueFilter = "week" | "month" | "overdue";

export default function ApDuePage() {
  const { formatCurrency } = useCurrency();
  const [filter, setFilter] = useState<DueFilter>("week");
  const today = format(new Date(), "yyyy-MM-dd");
  const weekEnd = format(addDays(new Date(), 7), "yyyy-MM-dd");
  const monthEnd = format(addDays(new Date(), 30), "yyyy-MM-dd");

  const { data: stats } = useQuery({
    queryKey: ["billing", "bills", "stats"],
    queryFn: () => billingApi.bills.stats(),
  });

  const { data: snapshot } = useQuery({
    queryKey: ["accounting", "command-center", "ap-due"],
    queryFn: () => accountingApi.getCommandCenterSnapshot(),
    staleTime: 60 * 1000,
  });

  const listParams =
    filter === "overdue"
      ? { status: "overdue", ordering: "due_date" }
      : filter === "week"
        ? { due_date_from: today, due_date_to: weekEnd, ordering: "due_date" }
        : { due_date_from: today, due_date_to: monthEnd, ordering: "due_date" };

  const { data: billsData, isLoading } = useQuery({
    queryKey: ["billing", "bills", "ap-due", filter, listParams],
    queryFn: () => billingApi.bills.list(listParams),
  });

  const bills = (billsData?.results ?? []).filter((bill) => {
    if (filter === "overdue") return true;
    return !["paid", "void", "draft", "rejected", "pending_approval"].includes(bill.status);
  });
  const payablesSummary = snapshot?.payables.summary;

  const summaryCards: { key: DueFilter; label: string; amount: number; count: number }[] = [
    {
      key: "week",
      label: "Due This Week",
      amount: Number(payablesSummary?.due_this_week ?? 0),
      count: Number(payablesSummary?.due_this_week_count ?? 0),
    },
    {
      key: "month",
      label: "Due This Month",
      amount: Number(payablesSummary?.due_this_month ?? 0),
      count: Number(payablesSummary?.due_this_month_count ?? 0),
    },
    {
      key: "overdue",
      label: "Overdue",
      amount: Number(payablesSummary?.overdue_bills ?? stats?.financials.overdue_total ?? 0),
      count: Number(payablesSummary?.overdue_bills_count ?? stats?.counts.overdue ?? 0),
    },
  ];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AP Due</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upcoming and overdue vendor bills.
          </p>
        </div>
        <Link href="/billing/pay-bills">
          <Button size="sm">Pay Bills</Button>
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {summaryCards.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => setFilter(card.key)}
            className="text-left"
          >
            <Card
              className={cn(
                "transition-colors hover:border-primary/40",
                filter === card.key ? "border-primary/50 ring-1 ring-primary/20" : ""
              )}
            >
              <CardContent className="pt-5">
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <p className="text-2xl font-semibold mt-1">{formatCurrency(card.amount)}</p>
                <p className="text-xs text-muted-foreground mt-1">{card.count} bills</p>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      <Tabs value={filter} onValueChange={(value) => setFilter(value as DueFilter)}>
        <TabsList>
          <TabsTrigger value="week">Due This Week</TabsTrigger>
          <TabsTrigger value="month">Due This Month</TabsTrigger>
          <TabsTrigger value="overdue">Overdue</TabsTrigger>
        </TabsList>

        <TabsContent value={filter} className="mt-4">
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-base">Bills</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <TableSkeleton columns={7} rows={8} />
              ) : bills.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No bills in this bucket.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bill</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Bill Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className="text-right">Amount Due</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bills.map((bill) => (
                      <TableRow key={bill.id}>
                        <TableCell>
                          <Link
                            href={`/billing/bills/${bill.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {bill.bill_number}
                          </Link>
                        </TableCell>
                        <TableCell>{bill.vendor_name ?? "—"}</TableCell>
                        <TableCell>{bill.bill_date}</TableCell>
                        <TableCell>{bill.due_date}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(bill.amount_due)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={bill.status === "overdue" ? "destructive" : "outline"}
                            className="capitalize"
                          >
                            {bill.status.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {bill.vendor ? (
                              <Link href={`/billing/pay-bills?vendor=${bill.vendor}`}>
                                <Button variant="outline" size="sm">
                                  Pay
                                </Button>
                              </Link>
                            ) : null}
                            <Link href={`/billing/bills/${bill.id}`}>
                              <Button variant="ghost" size="sm">
                                View
                              </Button>
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
