"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { billingApi } from "@/lib/api/billing";
import { quickbooksApi } from "@/lib/api/quickbooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { QboSyncBadge } from "@/components/integrations/QboSyncBadge";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useToast } from "@/lib/hooks/useToast";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { useQuickBooksConnection } from "@/hooks/useQuickBooksConnection";
import { cn } from "@/lib/utils/cn";
import { ArrowLeft, Ban, Database, Edit, Loader2 } from "lucide-react";

export default function VendorExpenseDetailPage() {
  const { formatCurrency } = useCurrency();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const { isConnected: isQboConnected } = useQuickBooksConnection();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isVoidDialogOpen, setIsVoidDialogOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const params = useParams();
  const id = parseInt(params.id as string, 10);

  const canManage = hasPermission("manage_billing");

  const { data: expense, isLoading } = useQuery({
    queryKey: ["vendor-expense", id],
    queryFn: () => billingApi.vendorExpenses.get(id),
    enabled: !Number.isNaN(id),
  });

  const voidMutation = useMutation({
    mutationFn: () => billingApi.vendorExpenses.void(id, voidReason || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor-expense", id] });
      queryClient.invalidateQueries({ queryKey: ["vendor-expenses"] });
      setIsVoidDialogOpen(false);
      setVoidReason("");
      toast({ title: "Expense voided", description: "The vendor expense was voided and GL reversed." });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { error?: string } } };
      toast({
        title: "Void failed",
        description: apiError.response?.data?.error || "Could not void vendor expense.",
        variant: "destructive",
      });
    },
  });

  const handleQBOSync = async () => {
    try {
      setIsSyncing(true);
      await quickbooksApi.syncOutbound({ entity_type: "vendor_expense", object_id: id });
      toast({
        title: "QuickBooks Sync",
        description: "Vendor expense push to QuickBooks triggered. Status should update shortly.",
      });
      queryClient.invalidateQueries({ queryKey: ["vendor-expense", id] });
      queryClient.invalidateQueries({ queryKey: ["vendor-expenses"] });
    } catch {
      toast({
        title: "QuickBooks Sync Failed",
        description: "Could not trigger vendor expense sync with QuickBooks.",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading || !expense) {
    return <div className="p-6 text-sm text-muted-foreground">Loading expense…</div>;
  }

  const isVoid = expense.status === "void";
  const isSynced = expense.qbo_sync_status === "synced";
  const canEdit = canManage && !isVoid && !isSynced;
  const canVoid = canManage && !isVoid;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/billing/expenses">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Expenses
            </Button>
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold">{expense.expense_number}</h1>
              <Badge variant={isVoid ? "destructive" : "secondary"} className="capitalize">
                {expense.status}
              </Badge>
              <QboSyncBadge status={expense.qbo_sync_status} error={expense.qbo_sync_error} />
            </div>
            <p className="text-sm text-muted-foreground">{expense.vendor_name}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/billing/expenses/${id}/edit`}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </Button>
          )}
          {canVoid && (
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/30 text-destructive hover:bg-destructive/5"
              onClick={() => setIsVoidDialogOpen(true)}
            >
              <Ban className="mr-2 h-4 w-4" />
              Void
            </Button>
          )}
          {isQboConnected && !isVoid && (
            <Button variant="outline" size="sm" onClick={handleQBOSync} disabled={isSyncing}>
              <Database className={cn("mr-2 h-4 w-4", isSyncing && "animate-spin")} />
              {isSyncing ? "Syncing..." : "Push to QuickBooks"}
            </Button>
          )}
        </div>
      </div>

      {isSynced && !isVoid && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="py-3 text-sm text-amber-900">
            Synced to QuickBooks — edit in QBO or void in SVR and recreate. SVR does not auto-void
            the QBO purchase.
          </CardContent>
        </Card>
      )}

      {isQboConnected && expense.qbo_sync_status === "failed" && expense.qbo_sync_error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">{expense.qbo_sync_error}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm md:grid-cols-2">
          <div>Date: {expense.expense_date}</div>
          <div className="capitalize">Method: {expense.payment_method.replace(/_/g, " ")}</div>
          <div>Total: {formatCurrency(expense.total)}</div>
          <div className="capitalize">Status: {expense.status}</div>
          {expense.reference_number ? <div>Reference: {expense.reference_number}</div> : null}
          {expense.notes ? <div className="md:col-span-2">Notes: {expense.notes}</div> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lines</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(expense.line_items ?? []).map((line) => (
            <div key={line.id} className="flex justify-between gap-4 text-sm">
              <div>
                <div>{line.description}</div>
                {line.expense_account ? (
                  <div className="text-xs text-muted-foreground">Account #{line.expense_account}</div>
                ) : null}
              </div>
              <span>{formatCurrency(line.total)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={isVoidDialogOpen} onOpenChange={setIsVoidDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void vendor expense</DialogTitle>
            <DialogDescription>
              This reverses the GL entry in SVR.{" "}
              {isSynced
                ? "The QuickBooks purchase will not be voided automatically."
                : "If already synced to QuickBooks, void the purchase there separately."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason (optional)"
            value={voidReason}
            onChange={(event) => setVoidReason(event.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsVoidDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => voidMutation.mutate()}
              disabled={voidMutation.isPending}
            >
              {voidMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Void expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
