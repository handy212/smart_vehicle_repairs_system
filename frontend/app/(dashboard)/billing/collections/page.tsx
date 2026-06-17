"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { AlertCircle } from "lucide-react";

type OverdueInvoice = {
  id: number;
  invoice_number: string;
  customer_name?: string;
  due_date: string;
  amount_due?: string;
  balance_due?: string;
  days_overdue?: number;
  status: string;
};

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

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Collections</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Overdue customer invoices requiring follow-up.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 max-w-xl">
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
            <TableSkeleton columns={6} rows={8} />
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
                      <Badge variant="destructive">{invoice.days_overdue ?? 0} days</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(invoice.amount_due ?? invoice.balance_due ?? 0)}
                    </TableCell>
                    <TableCell className="capitalize">{invoice.status.replace(/_/g, " ")}</TableCell>
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
