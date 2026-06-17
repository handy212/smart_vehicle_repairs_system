"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { AlertCircle, FileText, HandCoins } from "lucide-react";

type OverdueInvoice = {
  id: number;
  invoice_number: string;
  customer?: number;
  customer_name?: string;
  due_date: string;
  amount_due?: string;
  balance_due?: string;
  days_overdue?: number;
  status: string;
};

type AgingBucket = {
  key: string;
  label: string;
  min: number;
  max: number | null;
};

const AGING_BUCKETS: AgingBucket[] = [
  { key: "1-30", label: "1–30 days", min: 1, max: 30 },
  { key: "31-60", label: "31–60 days", min: 31, max: 60 },
  { key: "61-90", label: "61–90 days", min: 61, max: 90 },
  { key: "90+", label: "90+ days", min: 91, max: null },
];

function bucketAmount(invoices: OverdueInvoice[], bucket: AgingBucket) {
  return invoices
    .filter((invoice) => {
      const days = invoice.days_overdue ?? 0;
      if (bucket.max == null) return days >= bucket.min;
      return days >= bucket.min && days <= bucket.max;
    })
    .reduce((sum, invoice) => sum + Number(invoice.amount_due ?? invoice.balance_due ?? 0), 0);
}

export default function CollectionsPage() {
  const { formatCurrency } = useCurrency();

  const { data, isLoading } = useQuery({
    queryKey: ["billing", "overdue-invoices"],
    queryFn: () => billingApi.invoices.overdue(),
  });

  const invoices = (data ?? []) as OverdueInvoice[];
  const totalOverdue = invoices.reduce(
    (sum, invoice) => sum + Number(invoice.amount_due ?? invoice.balance_due ?? 0),
    0
  );

  const agingSummary = useMemo(
    () =>
      AGING_BUCKETS.map((bucket) => ({
        ...bucket,
        count: invoices.filter((invoice) => {
          const days = invoice.days_overdue ?? 0;
          if (bucket.max == null) return days >= bucket.min;
          return days >= bucket.min && days <= bucket.max;
        }).length,
        amount: bucketAmount(invoices, bucket),
      })),
    [invoices]
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Collections</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Overdue invoice workspace with aging summary and quick follow-up actions.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Overdue Invoices</p>
            <p className="text-3xl font-semibold">{invoices.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Total Overdue</p>
            <p className="text-3xl font-semibold text-destructive">{formatCurrency(totalOverdue)}</p>
          </CardContent>
        </Card>
        <Card className="sm:col-span-2">
          <CardContent className="pt-5">
            <p className="mb-3 text-sm font-medium text-foreground">Aging summary</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {agingSummary.map((bucket) => (
                <div key={bucket.key} className="flex items-center justify-between rounded border border-border/60 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">{bucket.label}</span>
                  <div className="text-right">
                    <div className="font-medium">{formatCurrency(bucket.amount)}</div>
                    <div className="text-xs text-muted-foreground">{bucket.count} invoice{bucket.count === 1 ? "" : "s"}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertCircle className="h-4 w-4 text-destructive" />
            Overdue Invoices
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton columns={7} rows={8} />
          ) : invoices.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No overdue invoices. Great work!</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Days Overdue</TableHead>
                  <TableHead className="text-right">Amount Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>
                      <Link href={`/billing/invoices/${invoice.id}`} className="font-medium text-primary hover:underline">
                        {invoice.invoice_number}
                      </Link>
                    </TableCell>
                    <TableCell>{invoice.customer_name ?? "—"}</TableCell>
                    <TableCell>{invoice.due_date}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="danger">{invoice.days_overdue ?? 0} days</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(invoice.amount_due ?? invoice.balance_due ?? 0)}
                    </TableCell>
                    <TableCell className="capitalize">{invoice.status.replace(/_/g, " ")}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                          <Link href={`/billing/payments?invoice=${invoice.id}`}>
                            <HandCoins className="mr-1 h-3 w-3" />
                            Payment
                          </Link>
                        </Button>
                        {invoice.customer ? (
                          <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                            <Link href={`/customers/${invoice.customer}?view=statement`}>
                              <FileText className="mr-1 h-3 w-3" />
                              Statement
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
