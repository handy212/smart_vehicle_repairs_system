"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowDownUp,
  ArrowLeft,
  CheckCircle,
  Loader2,
  Lock,
  XCircle,
} from "lucide-react";
import {
  accountingApi,
  type Till,
  type TillCashMovement,
} from "@/lib/api/accounting";
import { ACCOUNTING_TABLE_HEAD_CLASS } from "@/lib/constants/table-typography";
import { cn } from "@/lib/utils/cn";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const DENOMINATIONS = ["200", "100", "50", "20", "10", "5", "2", "1", "0.50", "0.20", "0.10"];

export default function TillDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = parseInt(params.id as string, 10);
  const isValidId = !Number.isNaN(id) && id > 0;
  const { formatCurrency } = useCurrency();
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();

  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [countedAmount, setCountedAmount] = useState("");
  const [useDenominationCount, setUseDenominationCount] = useState(false);
  const [denominationQuantities, setDenominationQuantities] = useState<Record<string, string>>({});
  const [varianceReason, setVarianceReason] = useState("");
  const [movementType, setMovementType] = useState<"pay_in" | "pay_out">("pay_in");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementReason, setMovementReason] = useState("");

  const { data: till, isLoading, error } = useQuery({
    queryKey: ["accounting", "till", id],
    queryFn: () => accountingApi.getTill(id),
    enabled: isValidId,
  });

  const { data: movements = [], isLoading: movementsLoading } = useQuery({
    queryKey: ["accounting", "till-movements", id],
    queryFn: () => accountingApi.getTillMovements(id),
    enabled: isValidId && !!till,
  });

  const invalidateTill = () => {
    queryClient.invalidateQueries({ queryKey: ["accounting", "till", id] });
    queryClient.invalidateQueries({ queryKey: ["accounting", "till-movements", id] });
    queryClient.invalidateQueries({ queryKey: ["accounting", "tills"] });
    queryClient.invalidateQueries({ queryKey: ["accounting", "till-reconciliation"] });
  };

  const closeMutation = useMutation({
    mutationFn: () => {
      const cash_counts = DENOMINATIONS.map((denomination) => ({
        denomination,
        quantity: Number(denominationQuantities[denomination] || 0),
      })).filter((row) => row.quantity > 0);
      return accountingApi.closeTill(
        id,
        useDenominationCount
          ? { cash_counts, counted_amount: countedAmount, notes: varianceReason }
          : { counted_amount: countedAmount, notes: varianceReason }
      );
    },
    onSuccess: (data) => {
      invalidateTill();
      success(`Till closed. Variance: ${formatCurrency(data.variance)}`);
      setCloseDialogOpen(false);
      setCountedAmount("");
      setVarianceReason("");
      setUseDenominationCount(false);
      setDenominationQuantities({});
    },
    onError: (err: unknown) => toastError(getUserFacingError(err, "Failed to close till")),
  });

  const movementMutation = useMutation({
    mutationFn: () =>
      accountingApi.recordTillMovement(id, {
        movement_type: movementType,
        amount: movementAmount,
        reason: movementReason,
      }),
    onSuccess: () => {
      invalidateTill();
      success("Cash movement recorded.");
      setMovementDialogOpen(false);
      setMovementAmount("");
      setMovementReason("");
      setMovementType("pay_in");
    },
    onError: (err: unknown) => toastError(getUserFacingError(err, "Failed to record cash movement")),
  });

  const approveVarianceMutation = useMutation({
    mutationFn: () => accountingApi.approveTillVariance(id),
    onSuccess: () => {
      invalidateTill();
      success("Till variance approved.");
    },
    onError: (err: unknown) => toastError(getUserFacingError(err, "Failed to approve variance")),
  });

  const closeExpected = till
    ? Number(till.current_expected_balance || till.expected_balance || till.opening_balance || 0)
    : 0;

  function updateDenomination(denomination: string, quantity: string) {
    const next = { ...denominationQuantities, [denomination]: quantity };
    setDenominationQuantities(next);
    const total = DENOMINATIONS.reduce(
      (sum, denom) => sum + Number(denom) * Number(next[denom] || 0),
      0
    );
    setCountedAmount(total ? total.toFixed(2) : "");
  }

  if (!isValidId) {
    return (
      <div className="space-y-4 p-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <p className="text-sm text-destructive">Invalid till session ID.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !till) {
    return (
      <div className="space-y-4 p-6">
        <Button variant="ghost" asChild>
          <Link href="/accounting/tills">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Till Management
          </Link>
        </Button>
        <p className="text-sm text-destructive">Till session not found.</p>
      </div>
    );
  }

  const needsVarianceApproval = till.variance_approval_status === "supervisor_required";
  const expectedBalance = till.current_expected_balance || till.expected_balance || till.opening_balance;

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 border-b border-border pb-3 md:flex-row md:items-center">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/accounting/tills">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Till Management
            </Link>
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">
                {till.till_account_code} — {till.till_account_name}
              </h1>
              <TillStatusBadge till={till} />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {till.branch_name} · Opened {format(new Date(till.opened_at), "MMM d, yyyy h:mm a")}
              {till.closed_at ? ` · Closed ${format(new Date(till.closed_at), "MMM d, yyyy h:mm a")}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {till.status === "open" && (
            <>
              <Button variant="outline" size="sm" onClick={() => setMovementDialogOpen(true)}>
                <ArrowDownUp className="mr-2 h-4 w-4" />
                Pay In / Out
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setCloseDialogOpen(true)}>
                <Lock className="mr-2 h-4 w-4" />
                Close Till
              </Button>
            </>
          )}
          {needsVarianceApproval && (
            <Button
              size="sm"
              disabled={approveVarianceMutation.isPending}
              onClick={() => approveVarianceMutation.mutate()}
            >
              Approve Variance
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Cashier" value={till.cashier_name} />
        <MetricCard label="Opening Balance" value={formatCurrency(till.opening_balance)} mono />
        <MetricCard label="Expected Balance" value={formatCurrency(expectedBalance)} mono />
        <MetricCard
          label="Variance"
          value={till.variance != null ? formatCurrency(till.variance) : "—"}
          mono
          warning={Number(till.variance || 0) !== 0}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b border-border pb-3">
            <CardTitle className="text-base">Session Summary</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
            <MetricCard label="Cash Received" value={formatCurrency(till.cash_payments_total || "0")} mono />
            <MetricCard label="Cash Refunds" value={formatCurrency(till.cash_refunds_total || "0")} mono />
            <MetricCard label="Bill Payments" value={formatCurrency(till.cash_bill_payments_total || "0")} mono />
            <MetricCard label="Net Movements" value={formatCurrency(till.till_cash_movements_net || "0")} mono />
            {till.closing_balance != null && (
              <MetricCard label="Closing Balance" value={formatCurrency(till.closing_balance)} mono />
            )}
            {till.duration && <MetricCard label="Duration" value={till.duration} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border pb-3">
            <CardTitle className="text-base">Cash Movements</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className={ACCOUNTING_TABLE_HEAD_CLASS}>Type</TableHead>
                  <TableHead className={ACCOUNTING_TABLE_HEAD_CLASS}>Amount</TableHead>
                  <TableHead className={ACCOUNTING_TABLE_HEAD_CLASS}>Reason</TableHead>
                  <TableHead className={ACCOUNTING_TABLE_HEAD_CLASS}>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movementsLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : movements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      No cash movements recorded.
                    </TableCell>
                  </TableRow>
                ) : (
                  movements.map((movement: TillCashMovement) => (
                    <TableRow key={movement.id}>
                      <TableCell className="px-4 py-2 capitalize">
                        {movement.movement_type.replace("_", " ")}
                      </TableCell>
                      <TableCell className="px-4 py-2 font-mono text-sm">
                        {formatCurrency(movement.amount)}
                      </TableCell>
                      <TableCell className="px-4 py-2 text-sm">{movement.reason || "—"}</TableCell>
                      <TableCell className="px-4 py-2 text-sm text-muted-foreground">
                        {format(new Date(movement.created_at), "MMM d, h:mm a")}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {till.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{till.notes}</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close Till</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Expected balance: {formatCurrency(closeExpected)}
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useDenominationCount}
                onChange={(e) => setUseDenominationCount(e.target.checked)}
              />
              Count by denomination
            </label>
            {useDenominationCount ? (
              <div className="grid grid-cols-2 gap-2">
                {DENOMINATIONS.map((denomination) => (
                  <div key={denomination} className="flex items-center gap-2">
                    <Label className="w-12 text-xs">{denomination}</Label>
                    <Input
                      type="number"
                      min="0"
                      value={denominationQuantities[denomination] || ""}
                      onChange={(e) => updateDenomination(denomination, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="counted">Counted amount</Label>
                <Input
                  id="counted"
                  type="number"
                  step="0.01"
                  value={countedAmount}
                  onChange={(e) => setCountedAmount(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="variance-notes">Variance notes</Label>
              <Textarea
                id="variance-notes"
                value={varianceReason}
                onChange={(e) => setVarianceReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!countedAmount || closeMutation.isPending}
              onClick={() => closeMutation.mutate()}
            >
              {closeMutation.isPending ? "Closing…" : "Close Till"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={movementDialogOpen} onOpenChange={setMovementDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Cash Movement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={movementType === "pay_in" ? "default" : "outline"}
                size="sm"
                onClick={() => setMovementType("pay_in")}
              >
                Pay In
              </Button>
              <Button
                type="button"
                variant={movementType === "pay_out" ? "default" : "outline"}
                size="sm"
                onClick={() => setMovementType("pay_out")}
              >
                Pay Out
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="movement-amount">Amount</Label>
              <Input
                id="movement-amount"
                type="number"
                step="0.01"
                value={movementAmount}
                onChange={(e) => setMovementAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="movement-reason">Reason</Label>
              <Textarea
                id="movement-reason"
                value={movementReason}
                onChange={(e) => setMovementReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovementDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!movementAmount || movementMutation.isPending}
              onClick={() => movementMutation.mutate()}
            >
              {movementMutation.isPending ? "Saving…" : "Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCard({
  label,
  value,
  mono,
  warning,
}: {
  label: string;
  value: string;
  mono?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-sm font-semibold",
          mono && "font-mono",
          warning && "text-destructive"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function TillStatusBadge({ till }: { till: Till }) {
  if (till.status === "open") {
    return (
      <Badge variant="outline" className="border-success/20 bg-success/10 text-success">
        <CheckCircle className="mr-1 h-3 w-3" />
        Open
      </Badge>
    );
  }
  const variance = Number(till.variance || 0);
  return (
    <Badge
      variant="outline"
      className={variance === 0 ? "" : "border-destructive/20 bg-destructive/10 text-destructive"}
    >
      {variance === 0 ? <CheckCircle className="mr-1 h-3 w-3" /> : <XCircle className="mr-1 h-3 w-3" />}
      Closed
    </Badge>
  );
}
