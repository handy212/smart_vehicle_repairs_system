"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, CheckCircle, FileMinus2 } from "lucide-react";

import { billingApi } from "@/lib/api/billing";
import { useQuickBooksConnection } from "@/hooks/useQuickBooksConnection";
import { useQboEntitySync } from "@/hooks/useQboEntitySync";
import { QboSyncBadge } from "@/components/integrations/QboSyncBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/lib/hooks/useToast";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { ApplyVendorCreditDialog } from "@/components/billing/ApplyVendorCreditDialog";

function getStatusVariant(status: string): BadgeProps["variant"] {
  switch (status) {
    case "issued":
      return "success";
    case "applied":
      return "info";
    case "void":
      return "danger";
    default:
      return "default";
  }
}

function VendorCreditDetailContent() {
  const { formatCurrency } = useCurrency();
  const params = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const id = parseInt(params.id as string, 10);
  const isValidId = !Number.isNaN(id) && id > 0;
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const { isLinked: isQboConnected, isOperational: isQboCanSync, connectionIssue: qboConnectionIssue } = useQuickBooksConnection();

  const { isSyncing, isClearing, handleSync, handleClearMapping } = useQboEntitySync({
    entityType: "vendor_credit",
    objectId: id,
    queryKey: ["vendorCredit", id],
    extraQueryKeys: [["vendor-credits"]],
    syncSuccessMessage: "Vendor credit push to QuickBooks triggered. Status should update shortly.",
    syncErrorMessage: "Could not trigger vendor credit sync with QuickBooks.",
  });

  const { data: credit, isLoading, error } = useQuery({
    queryKey: ["vendorCredit", id],
    queryFn: () => billingApi.vendorCredits.get(id),
    enabled: isValidId,
  });

  const issueMutation = useMutation({
    mutationFn: () => billingApi.vendorCredits.issue(id),
    onSuccess: () => {
      toast({ title: "Credit issued", description: "Vendor credit is ready to apply to bills." });
      queryClient.invalidateQueries({ queryKey: ["vendorCredit", id] });
      queryClient.invalidateQueries({ queryKey: ["vendor-credits"] });
    },
    onError: (err: unknown) => {
      let description = "Failed to issue vendor credit.";
      if (err && typeof err === "object" && "response" in err) {
        const d = (err as { response?: { data?: { error?: string } } }).response?.data;
        if (d?.error) description = d.error;
      }
      toast({ title: "Error", description, variant: "destructive" });
    },
  });

  if (!isValidId) {
    return (
      <div className="p-8">
        <Link href="/billing/vendor-credits">
          <Button variant="outline">Back</Button>
        </Link>
        <p className="mt-4 text-destructive">Invalid vendor credit ID.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !credit) {
    return <div className="p-8 text-destructive">Error loading vendor credit.</div>;
  }

  const unusedNum = parseFloat(credit.unused_amount || "0");
  const vendorId = Number(credit.vendor);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <ApplyVendorCreditDialog
        open={applyDialogOpen}
        onOpenChange={setApplyDialogOpen}
        vendorCreditId={id}
        vendorId={vendorId}
        unusedCredit={unusedNum}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Link href="/billing/vendor-credits">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold">
              <FileMinus2 className="h-5 w-5 text-muted-foreground" />
              {credit.credit_number}
              <Badge variant={getStatusVariant(credit.status)}>{credit.status.toUpperCase()}</Badge>
              {isQboConnected && (
                <QboSyncBadge
                  status={credit.qbo_sync_status}
                  error={credit.qbo_sync_error}
                  connected={isQboConnected}
              connectionIssue={!isQboCanSync ? qboConnectionIssue : undefined}
                  onRetry={isQboCanSync ? handleSync : undefined}
                  onClearMapping={isQboCanSync ? handleClearMapping : undefined}
                  isRetrying={isSyncing}
                  isClearing={isClearing}
                />
              )}
            </h1>
            <p className="text-sm text-muted-foreground">
              {credit.vendor_name} · {format(new Date(credit.credit_date), "MMM d, yyyy")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {credit.status === "draft" && (
            <Button
              onClick={() => issueMutation.mutate()}
              disabled={issueMutation.isPending}
              className="bg-success hover:bg-green-700"
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              {issueMutation.isPending ? "Issuing…" : "Issue credit"}
            </Button>
          )}
          {credit.status === "issued" && unusedNum > 0.001 && (
            <Button onClick={() => setApplyDialogOpen(true)}>Apply to bill</Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Total</p>
            <p className="text-xl font-bold">{formatCurrency(credit.total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Unused</p>
            <p className="text-xl font-bold text-primary">{formatCurrency(credit.unused_amount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Related bill</p>
            {credit.bill ? (
              <Link href={`/billing/bills/${credit.bill}`} className="text-sm font-medium text-primary hover:underline">
                {credit.bill_number || `#${credit.bill}`}
              </Link>
            ) : (
              <p className="text-sm font-medium">—</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Line items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {credit.line_items?.map((item, idx) => (
                <TableRow key={item.id ?? idx}>
                  <TableCell>{item.description}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.total || "0")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {credit.applications && credit.applications.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Applications</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bill</TableHead>
                  <TableHead>Applied</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {credit.applications.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell>
                      <Link href={`/billing/bills/${app.bill}`} className="text-primary hover:underline">
                        {app.bill_number || `#${app.bill}`}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {app.applied_at ? format(new Date(app.applied_at), "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell>{app.applied_by_name || "—"}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(app.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {(credit.reason || credit.notes) && (
        <Card>
          <CardContent className="space-y-3 p-4 text-sm">
            {credit.reason && (
              <div>
                <p className="text-muted-foreground">Reason</p>
                <p>{credit.reason}</p>
              </div>
            )}
            {credit.notes && (
              <div>
                <p className="text-muted-foreground">Notes</p>
                <p>{credit.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function VendorCreditDetailPage() {
  return (
    <PermissionPageGuard permission="view_billing">
      <VendorCreditDetailContent />
    </PermissionPageGuard>
  );
}
