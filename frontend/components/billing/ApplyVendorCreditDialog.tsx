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

/** Apply vendor credit ↔ bill — anchor on either the credit or the bill. */
export type ApplyVendorCreditDialogProps =
  | {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      vendorId: number;
      vendorCreditId: number;
      unusedCredit: number;
      billId?: never;
      amountDue?: never;
    }
  | {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      vendorId: number;
      billId: number;
      amountDue: number;
      vendorCreditId?: never;
      unusedCredit?: never;
    };

export function ApplyVendorCreditDialog(props: ApplyVendorCreditDialogProps) {
  const { open, onOpenChange, vendorId } = props;
  const anchoredOnCredit = "vendorCreditId" in props && props.vendorCreditId != null;
  const vendorCreditId = anchoredOnCredit ? props.vendorCreditId : undefined;
  const unusedCredit = anchoredOnCredit ? props.unusedCredit : 0;
  const billId = !anchoredOnCredit ? props.billId : undefined;
  const amountDue = !anchoredOnCredit ? props.amountDue : 0;

  const { formatCurrency } = useCurrency();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedBillId, setSelectedBillId] = useState("");
  const [selectedCreditId, setSelectedCreditId] = useState("");
  const [amountStr, setAmountStr] = useState("");

  const { data: listData, isLoading: billsLoading } = useQuery({
    queryKey: ["bills", "apply-vendor-credit", vendorId],
    queryFn: () =>
      billingApi.bills.list({
        vendor: vendorId,
        page_size: 100,
        ordering: "-bill_date",
      }),
    enabled: open && vendorId > 0 && anchoredOnCredit,
  });

  const { data: creditsData, isLoading: creditsLoading } = useQuery({
    queryKey: ["vendor-credits", "apply-to-bill", vendorId, billId],
    queryFn: () =>
      billingApi.vendorCredits.list({
        vendor: vendorId,
        bill: billId,
        page_size: 100,
        ordering: "-credit_date",
      }),
    enabled: open && vendorId > 0 && !anchoredOnCredit,
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

  const credits = useMemo(() => {
    return (creditsData?.results ?? []).filter(
      (credit) =>
        ["issued", "applied"].includes(credit.status) &&
        parseFloat(credit.unused_amount || "0") > 0.001
    );
  }, [creditsData]);

  const resolvedBillId = anchoredOnCredit ? selectedBillId : String(billId);
  const resolvedCreditId = anchoredOnCredit ? String(vendorCreditId) : selectedCreditId;

  const selectedBill = useMemo(() => {
    if (anchoredOnCredit) {
      return bills.find((b) => String(b.id) === selectedBillId);
    }
    return undefined;
  }, [anchoredOnCredit, bills, selectedBillId]);

  const selectedCredit = useMemo(() => {
    if (!anchoredOnCredit) {
      return credits.find((c) => String(c.id) === selectedCreditId);
    }
    return undefined;
  }, [anchoredOnCredit, credits, selectedCreditId]);

  const creditAvailable = anchoredOnCredit
    ? unusedCredit
    : selectedCredit
      ? parseFloat(selectedCredit.unused_amount || "0")
      : 0;

  const billDue = anchoredOnCredit
    ? selectedBill
      ? billBalanceDue(selectedBill)
      : 0
    : amountDue;

  const maxApply = useMemo(() => {
    if (creditAvailable <= 0 || billDue <= 0) return 0;
    return Math.min(creditAvailable, billDue);
  }, [creditAvailable, billDue]);

  useEffect(() => {
    if (!open) {
      setSelectedBillId("");
      setSelectedCreditId("");
      setAmountStr("");
    }
  }, [open]);

  useEffect(() => {
    if (maxApply > 0) {
      setAmountStr(maxApply.toFixed(2));
    }
  }, [maxApply]);

  const applyMutation = useMutation({
    mutationFn: () => {
      const credit = parseInt(resolvedCreditId, 10);
      const bill = parseInt(resolvedBillId, 10);
      const amt = parseFloat(amountStr);
      if (!Number.isFinite(amt) || amt <= 0) {
        return Promise.reject(new Error("Invalid amount"));
      }
      return billingApi.vendorCredits.apply(credit, {
        bill,
        amount: amt.toFixed(2),
      });
    },
    onSuccess: () => {
      toast({ title: "Credit applied", description: "The bill balance has been updated." });
      if (vendorCreditId) {
        queryClient.invalidateQueries({ queryKey: ["vendorCredit", vendorCreditId] });
      }
      if (billId) {
        queryClient.invalidateQueries({ queryKey: ["bill", billId] });
      }
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
    Boolean(resolvedBillId) &&
    Boolean(resolvedCreditId) &&
    maxApply > 0 &&
    Number.isFinite(parseFloat(amountStr)) &&
    parseFloat(amountStr) > 0 &&
    parseFloat(amountStr) <= maxApply + 0.0001;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apply vendor credit</DialogTitle>
          <DialogDescription>
            {anchoredOnCredit ? (
              <>
                Apply this vendor credit toward an open bill. Remaining credit:{" "}
                {formatCurrency(unusedCredit)}.
              </>
            ) : (
              <>Apply an issued vendor credit to this bill. Balance due: {formatCurrency(amountDue)}.</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {anchoredOnCredit ? (
            <div className="space-y-2">
              <Label>Open bill</Label>
              <Select value={selectedBillId || undefined} onValueChange={setSelectedBillId} disabled={billsLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={billsLoading ? "Loading…" : "Select bill…"} />
                </SelectTrigger>
                <SelectContent className="max-h-72 z-[250]">
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
          ) : (
            <div className="space-y-2">
              <Label>Vendor credit</Label>
              <Select
                value={selectedCreditId || undefined}
                onValueChange={setSelectedCreditId}
                disabled={creditsLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={creditsLoading ? "Loading…" : "Select credit…"} />
                </SelectTrigger>
                <SelectContent className="max-h-72 z-[250]">
                  {credits.map((credit) => (
                    <SelectItem key={credit.id} value={String(credit.id)}>
                      {credit.credit_number} — {formatCurrency(credit.unused_amount)} available
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!creditsLoading && credits.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No issued vendor credits with remaining balance for this vendor and branch. Issue a
                  credit from Vendor Credits first.
                </p>
              )}
            </div>
          )}

          {maxApply > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="apply-vc-amount">Amount to apply</Label>
              <Input
                id="apply-vc-amount"
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
          ) : null}
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
