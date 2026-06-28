"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { billingApi } from "@/lib/api/billing";
import { useQuickBooksConnection } from "@/hooks/useQuickBooksConnection";
import { useQboEntitySync } from "@/hooks/useQboEntitySync";
import { QboSyncBadge } from "@/components/integrations/QboSyncBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useToast } from "@/lib/hooks/useToast";
import { cn } from "@/lib/utils/cn";
import { ArrowLeft, Database, Wallet } from "lucide-react";

export default function VendorPaymentDetailPage() {
  const { formatCurrency } = useCurrency();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isConnected: isQboConnected } = useQuickBooksConnection();
  const params = useParams();
  const id = parseInt(params.id as string, 10);
  const {
    isSyncing,
    isClearing,
    handleSync: handleQBOSync,
    handleClearMapping: handleQboClearMapping,
  } = useQboEntitySync({
    entityType: "bill_payment",
    objectId: id,
    queryKey: ["bill-payment", id],
    extraQueryKeys: [["billing", "bill-payments"]],
    syncSuccessMessage: "Bill payment push triggered. Status should update shortly.",
    syncErrorMessage: "Could not push bill payment to QuickBooks.",
  });

  const { data: payment, isLoading } = useQuery({
    queryKey: ["bill-payment", id],
    queryFn: () => billingApi.billPayments.get(id),
    enabled: !Number.isNaN(id),
  });

  const { data: batchList } = useQuery({
    queryKey: ["bill-payments", "batch", payment?.payment_batch],
    queryFn: () =>
      billingApi.billPayments.list({
        vendor: payment?.vendor_id,
        page_size: 100,
      }),
    enabled: Boolean(payment?.payment_batch && payment.vendor_id),
    select: (data) =>
      (data.results ?? []).filter((row) => row.payment_batch === payment?.payment_batch),
  });

  const batchPayments = batchList && batchList.length > 1 ? batchList : payment ? [payment] : [];

  if (isLoading || !payment) {
    return <div className="p-6 text-sm text-muted-foreground">Loading payment…</div>;
  }

  const payFromAccount =
    payment.payment_method === "cash"
      ? payment.till_account_name
      : payment.bank_account_name;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/billing/vendor-payments">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Payments
            </Button>
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold">{payment.payment_number}</h1>
              <Badge variant="secondary" className="capitalize">
                {payment.payment_method.replace(/_/g, " ")}
              </Badge>
              {isQboConnected ? (
                <QboSyncBadge
                  status={payment.qbo_sync_status ?? "un-synced"}
                  error={payment.qbo_sync_error}
                  connected={isQboConnected}
                  onRetry={handleQBOSync}
                  onClearMapping={handleQboClearMapping}
                  isRetrying={isSyncing}
                  isClearing={isClearing}
                  compact
                />
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {payment.vendor_name} ·{" "}
              {payment.payment_date
                ? format(new Date(payment.payment_date), "MMM d, yyyy")
                : "—"}
            </p>
          </div>
        </div>
        {isQboConnected ? (
          <QboSyncBadge
            status={payment.qbo_sync_status ?? "un-synced"}
            error={payment.qbo_sync_error}
            connected={isQboConnected}
            onRetry={handleQBOSync}
            onClearMapping={handleQboClearMapping}
            isRetrying={isSyncing}
            isClearing={isClearing}
          />
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Wallet className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Amount paid</p>
              <p className="text-xl font-semibold">{formatCurrency(payment.amount)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Paid from</p>
            <p className="text-sm font-medium">{payFromAccount || "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Recorded by</p>
            <p className="text-sm font-medium">{payment.paid_by_name || "—"}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm md:grid-cols-2">
          <div>Reference: {payment.reference_number || "—"}</div>
          <div>
            Bill:{" "}
            <Link href={`/billing/bills/${payment.bill}`} className="text-primary hover:underline">
              {payment.bill_number ?? `#${payment.bill}`}
            </Link>
          </div>
          {payment.gross_amount && parseFloat(payment.gross_amount) !== parseFloat(payment.amount) ? (
            <div>Gross (incl. WHT): {formatCurrency(payment.gross_amount)}</div>
          ) : null}
          {payment.notes ? <div className="md:col-span-2">Notes: {payment.notes}</div> : null}
          {payment.payment_batch ? (
            <div className="md:col-span-2 text-xs text-muted-foreground">
              Batch payment — {batchPayments.length} bill{batchPayments.length === 1 ? "" : "s"} in this run
            </div>
          ) : null}
        </CardContent>
      </Card>

      {batchPayments.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bills in this payment run</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment #</TableHead>
                  <TableHead>Bill</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batchPayments.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      {row.id === payment.id ? (
                        <span className="font-mono text-xs">{row.payment_number}</span>
                      ) : (
                        <Link
                          href={`/billing/vendor-payments/${row.id}`}
                          className="font-mono text-xs text-primary hover:underline"
                        >
                          {row.payment_number}
                        </Link>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link href={`/billing/bills/${row.bill}`} className="hover:underline">
                        {row.bill_number ?? `#${row.bill}`}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(row.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {payment.vendor_id ? (
        <div className="flex flex-wrap gap-2">
          <Link href={`/billing/pay-bills?vendor=${payment.vendor_id}`}>
            <Button variant="outline" size="sm">
              Pay more bills for {payment.vendor_name}
            </Button>
          </Link>
          <Link href={`/billing/bills?vendor=${payment.vendor_id}`}>
            <Button variant="ghost" size="sm">
              View vendor bills
            </Button>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
