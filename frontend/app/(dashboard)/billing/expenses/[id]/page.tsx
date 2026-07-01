"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { billingApi } from "@/lib/api/billing";
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
import { useQboEntitySync } from "@/hooks/useQboEntitySync";
import { ArrowLeft, Ban, Edit, Loader2 } from "lucide-react";

export default function VendorExpenseDetailPage() {
  const { formatCurrency } = useCurrency();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const { isLinked: isQboConnected, isOperational: isQboCanSync, connectionIssue: qboConnectionIssue } = useQuickBooksConnection();
  const params = useParams();
  const id = parseInt(params.id as string, 10);
  const {
    isSyncing,
    isClearing,
    handleSync: handleQBOSync,
    handleClearMapping: handleQboClearMapping,
  } = useQboEntitySync({
    entityType: "vendor_expense",
    objectId: id,
    queryKey: ["vendor-expense", id],
    extraQueryKeys: [["vendor-expenses"]],
    syncSuccessMessage: "Vendor expense push to QuickBooks triggered. Status should update shortly.",
    syncErrorMessage: "Could not trigger vendor expense sync with QuickBooks.",
  });
  const [isVoidDialogOpen, setIsVoidDialogOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");

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
              {isQboConnected && (
                <QboSyncBadge
                  status={expense.qbo_sync_status}
                  error={expense.qbo_sync_error}
                  connected={isQboConnected}
              connectionIssue={!isQboCanSync ? qboConnectionIssue : undefined}
                  onRetry={!isVoid && isQboCanSync ? handleQBOSync : undefined}
                  onClearMapping={!isVoid && isQboCanSync ? handleQboClearMapping : undefined}
                  isRetrying={isSyncing}
                  isClearing={isClearing}
                  compact
                />
              )}
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
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Expense details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-lg font-semibold">{formatCurrency(expense.total)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Subtotal</p>
            <p>{formatCurrency(expense.subtotal)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Payment method</p>
            <p className="capitalize">{expense.payment_method?.replace(/_/g, " ") || "—"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Expense date</p>
            <p>{expense.expense_date || "—"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Branch</p>
            <p>{expense.branch ? `#${expense.branch}` : "—"}</p>
          </div>
          {expense.reference_number && (
            <div>
              <p className="text-sm text-muted-foreground">Reference</p>
              <p>{expense.reference_number}</p>
            </div>
          )}
          {expense.notes && (
            <div className="sm:col-span-2">
              <p className="text-sm text-muted-foreground">Notes</p>
              <p className="text-sm whitespace-pre-wrap">{expense.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isVoidDialogOpen} onOpenChange={setIsVoidDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void vendor expense</DialogTitle>
            <DialogDescription>
              This reverses GL entries. SVR does not auto-void the matching QBO purchase if already synced.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason (optional)"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
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
              {voidMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Voiding…
                </>
              ) : (
                "Void expense"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
