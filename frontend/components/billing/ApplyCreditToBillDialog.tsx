"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { billingApi, type Bill } from "@/lib/api/billing";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useToast } from "@/lib/hooks/useToast";
import { Loader2 } from "lucide-react";

function billBalanceDue(bill: Bill): number {
  if (bill.amount_due != null && bill.amount_due !== "") {
    return Math.max(0, parseFloat(String(bill.amount_due)));
  }
  const total = parseFloat(bill.total || "0");
  const paid = parseFloat(bill.amount_paid || "0");
  return Math.max(0, total - paid);
}

export interface ApplyCreditToBillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorCreditId: number;
  vendorId: number;
  unusedCredit: number;
}

export function ApplyCreditToBillDialog({
  open,
  onOpenChange,
  vendorCreditId,
  vendorId,
  unusedCredit,
}: ApplyCreditToBillDialogProps) {
  const { formatCurrency } = useCurrency();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [billId, setBillId] = useState<string>("");
  const [amountStr, setAmountStr] = useState("");

  const { data: listData, isLoading: billsLoading } = useQuery({
    queryKey: ["bills", "apply-vendor-credit", vendorId],
    queryFn: () =>
      billingApi.bills.list({
        vendor: vendorId,
        page_size: 100,
        ordering: "-bill_date",
      }),
    enabled: open && vendorId > 0,
  });

  const bills = useMemo(() => {
    const raw = listData?.results ?? [];
    return raw.filter((bill) => {
      if (["void", "paid", "draft", "pending_approval", "rejected"].includes(bill.status)) {
        return false;
      }
      return billBalanceDue(bill) > 0.001;
    });
  }, [listData]);

  const selected = useMemo(
    () => bills.find((b) => String(b.id) === billId),
    [bills, billId]
  );

  const maxApply = useMemo(() => {
    if (!selected) return 0;
    return Math.min(unusedCredit, billBalanceDue(selected));
  }, [selected, unusedCredit]);

  useEffect(() => {
    if (!open) {
      setBillId("");
      setAmountStr("");
    }
  }, [open]);

  useEffect(() => {
    if (selected && maxApply > 0) {
      setAmountStr(maxApply.toFixed(2));
    }
  }, [selected, maxApply]);

  const applyMutation = useMutation({
    mutationFn: () => {
      const bill = parseInt(billId, 10);
      const amt = parseFloat(amountStr);
      if (!Number.isFinite(amt) || amt <= 0) {
        return Promise.reject(new Error("Invalid amount"));
      }
      return billingApi.vendorCredits.apply(vendorCreditId, {
        bill,
        amount: amt.toFixed(2),
      });
    },
    onSuccess: () => {
      toast({ title: "Credit applied", description: "The bill balance has been updated." });
      queryClient.invalidateQueries({ queryKey: ["vendorCredit", vendorCreditId] });
      queryClient.invalidateQueries({ queryKey: ["vendor-credits"] });
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      queryClient.invalidateQueries({ queryKey: ["bill"] });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      let description = "Could not apply vendor credit.";
      if (err && typeof err === "object" && "response" in err) {
        const d = (err as { response?: { data?: { error?: string } } }).response?.data;
        if (d?.error) description = d.error;
      }
      toast({ title: "Error", description, variant: "destructive" });
    },
  });

  const canSubmit =
    Boolean(billId) &&
    maxApply > 0 &&
    Number.isFinite(parseFloat(amountStr)) &&
    parseFloat(amountStr) > 0 &&
    parseFloat(amountStr) <= maxApply + 0.0001;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apply credit to bill</DialogTitle>
          <DialogDescription>
            Apply this vendor credit toward an open bill for the same vendor. Remaining credit:{" "}
            {formatCurrency(unusedCredit)}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Open bill</Label>
            <Select value={billId || undefined} onValueChange={setBillId} disabled={billsLoading}>
              <SelectTrigger>
                <SelectValue placeholder={billsLoading ? "Loading…" : "Select bill…"} />
              </SelectTrigger>
              <SelectContent className="max-h-72 z-[200]">
                {bills.map((bill) => {
                  const due = billBalanceDue(bill);
                  return (
                    <SelectItem key={bill.id} value={String(bill.id)}>
                      #{bill.bill_number} — {formatCurrency(due)} due ({bill.status})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {!billsLoading && bills.length === 0 && (
              <p className="text-xs text-muted-foreground">No open bills with a balance for this vendor.</p>
            )}
          </div>

          {selected && (
            <div className="space-y-2">
              <Label htmlFor="apply-bill-amount">Amount to apply</Label>
              <Input
                id="apply-bill-amount"
                type="number"
                step="0.01"
                min={0.01}
                max={maxApply}
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Maximum this application: {formatCurrency(maxApply)}.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!canSubmit || applyMutation.isPending} onClick={() => applyMutation.mutate()}>
            {applyMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Applying…
              </>
            ) : (
              "Apply credit"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
