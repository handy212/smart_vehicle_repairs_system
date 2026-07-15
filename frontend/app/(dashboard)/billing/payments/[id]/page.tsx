"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { billingApi, type PaymentAllocation } from "@/lib/api/billing";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  CreditCard,
  Database,
  DollarSign,
  FileText,
  MoreHorizontal,
  Printer,
  RotateCcw,
  Split,
  User,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { PaymentAllocationModal } from "@/components/billing/PaymentAllocationModal";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ProcessRefundDialog from "@/app/(dashboard)/billing/invoices/[id]/components/ProcessRefundDialog";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { usePrint } from "@/lib/hooks/usePrint";
import { useQuickBooksConnection } from "@/hooks/useQuickBooksConnection";
import { useQboEntitySync } from "@/hooks/useQboEntitySync";
import { QboSyncBadge } from "@/components/integrations/QboSyncBadge";
import { cn } from "@/lib/utils/cn";

export default function PaymentDetailPage() {
  const { formatCurrency } = useCurrency();
  const { openPrintWindow, isOpeningPrint } = usePrint();
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = parseInt(params.id as string);
  const [isRefundDialogOpen, setIsRefundDialogOpen] = useState(false);
  const [allocationOpen, setAllocationOpen] = useState(false);
  const { isLinked: isQboConnected, isOperational: isQboCanSync, connectionIssue: qboConnectionIssue } = useQuickBooksConnection();
  const {
    isSyncing,
    isClearing,
    handleSync: handleQBOSync,
    handleClearMapping: handleQboClearMapping,
  } = useQboEntitySync({
    entityType: "payment",
    objectId: id,
    queryKey: ["payment", id],
    syncSuccessMessage: "Payment push to QuickBooks triggered. Status should update shortly.",
    syncErrorMessage: "Could not trigger payment sync with QuickBooks.",
  });

  const isValidId = !Number.isNaN(id) && id > 0;

  const { data: payment, isLoading, error } = useQuery({
    queryKey: ["payment", id],
    queryFn: () => billingApi.payments.get(id),
    enabled: isValidId,
  });

  const { data: allocations } = useQuery({
    queryKey: ["payment-allocations", id],
    queryFn: () => billingApi.payments.allocations(id),
    enabled: isValidId && !!payment,
  });

  const { data: unallocatedData } = useQuery({
    queryKey: ["payment-unallocated", id],
    queryFn: () => billingApi.payments.unallocatedAmount(id),
    enabled: isValidId && !!payment,
  });

  if (!isValidId) {
    return (
      <div className="space-y-4 p-8">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Card className="border-destructive/20 bg-destructive/10">
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-destructive">Invalid Payment ID</p>
            <p className="mt-1 text-sm text-destructive">The payment ID in the URL is invalid.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return <div className="flex justify-center p-8">Loading payment details...</div>;
  }

  if (error || !payment) {
    return (
      <div className="space-y-4 p-8">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="text-destructive">Error loading payment details or payment not found.</div>
      </div>
    );
  }

  const getStatusVariant = (status: string) => {
    const variants: Record<string, "warning" | "success" | "destructive" | "secondary" | "default"> = {
      pending: "warning",
      completed: "success",
      failed: "destructive",
      refunded: "secondary",
      partially_refunded: "warning",
    };
    return variants[status] || "default";
  };

  const unallocatedAmount = parseFloat(
    unallocatedData?.unallocated ?? payment.unallocated_balance ?? "0"
  );
  const maxRefundable = parseFloat(payment.amount) - parseFloat(payment.refund_amount || "0");
  const canAllocate =
    payment.status === "completed" && Boolean(payment.customer) && unallocatedAmount > 0.01;
  const canRequestRefund = payment.status === "completed" && maxRefundable > 0.01;

  return (
    <div className="min-h-screen space-y-6 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="shrink-0">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Payment {payment.payment_number}</h1>
              <Badge variant={getStatusVariant(payment.status)}>
                {payment.status.replace("_", " ").toUpperCase()}
              </Badge>
              {isQboConnected && (
                <QboSyncBadge
                  status={payment.qbo_sync_status}
                  error={payment.qbo_sync_error}
                  connected={isQboConnected}
                  connectionIssue={!isQboCanSync ? qboConnectionIssue : undefined}
                  onRetry={isQboCanSync ? handleQBOSync : undefined}
                  onClearMapping={isQboCanSync ? handleQboClearMapping : undefined}
                  isRetrying={isSyncing}
                  isClearing={isClearing}
                  compact
                />
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Received on {format(new Date(payment.payment_date), "MMMM dd, yyyy")}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {canAllocate && (
            <Button size="sm" onClick={() => setAllocationOpen(true)}>
              <Split className="mr-2 h-4 w-4" />
              Allocate credit
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreHorizontal className="mr-2 h-4 w-4" />
                Actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onClick={() => openPrintWindow({ documentType: "receipt", documentId: id })}
                disabled={isOpeningPrint}
              >
                <Printer className="mr-2 h-4 w-4" />
                {isOpeningPrint ? "Opening print..." : "Print receipt"}
              </DropdownMenuItem>

              {isQboConnected && isQboCanSync && (
                <>
                  <DropdownMenuItem onClick={handleQBOSync} disabled={isSyncing || isClearing}>
                    <Database className={cn("mr-2 h-4 w-4", isSyncing && "animate-spin")} />
                    {isSyncing ? "Syncing..." : "Push to QuickBooks"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleQboClearMapping} disabled={isSyncing || isClearing}>
                    {isClearing ? "Clearing link..." : "Clear QuickBooks link"}
                  </DropdownMenuItem>
                </>
              )}

              {canRequestRefund && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setIsRefundDialogOpen(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Request refund
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isQboConnected && (
        <QboSyncBadge
          status={payment.qbo_sync_status}
          error={payment.qbo_sync_error}
          connected={isQboConnected}
          connectionIssue={!isQboCanSync ? qboConnectionIssue : undefined}
          onRetry={isQboCanSync ? handleQBOSync : undefined}
          onClearMapping={isQboCanSync ? handleQboClearMapping : undefined}
          isRetrying={isSyncing}
          isClearing={isClearing}
        />
      )}

      {canRequestRefund && (
        <Card className="border-warning/20 bg-warning/10 border-warning/20">
          <CardContent className="py-3 text-sm text-muted-foreground">
            Refunds use the approval workflow: your request is reviewed, then completed on the{" "}
            <Link href="/billing/refunds" className="font-medium text-primary hover:underline">
              Refunds
            </Link>{" "}
            page (linked from Payments).
            . Funds are not returned until the refund is approved and completed.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="space-y-6 md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-muted-foreground" />
                Payment Details
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="mb-1 text-sm font-medium text-muted-foreground">Amount</h3>
                <p className="text-2xl font-bold">{formatCurrency(parseFloat(payment.amount))}</p>
                {payment.refund_amount && parseFloat(payment.refund_amount) > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Refunded: {formatCurrency(parseFloat(payment.refund_amount))}
                  </p>
                )}
                {unallocatedAmount > 0.01 && (
                  <p className="mt-1 text-xs text-primary">
                    {formatCurrency(unallocatedAmount)} unallocated
                  </p>
                )}
              </div>
              <div>
                <h3 className="mb-1 text-sm font-medium text-muted-foreground">Method</h3>
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium capitalize">
                    {payment.payment_method.replace("_", " ")}
                  </span>
                </div>
              </div>
              <div>
                <h3 className="mb-1 text-sm font-medium text-muted-foreground">Reference</h3>
                <p className="font-medium">{payment.reference_number || "-"}</p>
              </div>
              <div>
                <h3 className="mb-1 text-sm font-medium text-muted-foreground">Transaction ID</h3>
                <p className="font-medium">{payment.transaction_id || "-"}</p>
              </div>
              {payment.notes && (
                <div className="col-span-2">
                  <h3 className="mb-1 text-sm font-medium text-muted-foreground">Notes</h3>
                  <p className="rounded-md bg-muted p-3 text-card-foreground">{payment.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                Allocations
              </CardTitle>
              <CardDescription>
                How this payment was applied to invoices
                {canAllocate ? ` — ${formatCurrency(unallocatedAmount)} available to allocate` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allocations && allocations.length > 0 ? (
                    allocations.map((alloc: PaymentAllocation) => (
                      <TableRow key={alloc.id}>
                        <TableCell>
                          <Link
                            href={`/billing/invoices/${alloc.invoice}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {alloc.invoice_number}
                          </Link>
                        </TableCell>
                        <TableCell>{format(new Date(alloc.allocated_at), "MMM dd, yyyy")}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(parseFloat(alloc.amount))}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                        No allocations found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Customer Info</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/15">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <Link
                    href={payment.customer ? `/customers/${payment.customer}` : "#"}
                    className="block font-medium hover:text-primary"
                  >
                    {payment.customer_name || "Unknown Customer"}
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>

          {payment.invoice && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Primary Invoice</CardTitle>
              </CardHeader>
              <CardContent>
                <Link
                  href={`/billing/invoices/${payment.invoice}`}
                  className="flex items-center justify-between rounded-md border p-3 transition-colors hover:bg-muted"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium">{payment.invoice_number}</span>
                  </div>
                  <ArrowLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {payment.customer ? (
        <PaymentAllocationModal
          paymentId={payment.id}
          paymentAmount={payment.amount}
          customerId={payment.customer}
          open={allocationOpen}
          onClose={() => {
            setAllocationOpen(false);
            queryClient.invalidateQueries({ queryKey: ["payment", id] });
            queryClient.invalidateQueries({ queryKey: ["payment-allocations", id] });
            queryClient.invalidateQueries({ queryKey: ["payment-unallocated", id] });
          }}
        />
      ) : null}

      <ProcessRefundDialog
        payment={payment}
        open={isRefundDialogOpen}
        onClose={() => setIsRefundDialogOpen(false)}
        onSuccess={() => {
          setIsRefundDialogOpen(false);
          queryClient.invalidateQueries({ queryKey: ["payment", id] });
        }}
      />
    </div>
  );
}
