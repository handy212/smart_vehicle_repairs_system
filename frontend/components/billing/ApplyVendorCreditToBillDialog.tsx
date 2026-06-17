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
import { billingApi } from "@/lib/api/billing";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useToast } from "@/lib/hooks/useToast";
import { Loader2 } from "lucide-react";

export interface ApplyVendorCreditToBillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billId: number;
  vendorId: number;
  amountDue: number;
}

export function ApplyVendorCreditToBillDialog({
  open,
  onOpenChange,
  billId,
  vendorId,
  amountDue,
}: ApplyVendorCreditToBillDialogProps) {
  const { formatCurrency } = useCurrency();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [vendorCreditId, setVendorCreditId] = useState<string>("");
  const [amountStr, setAmountStr] = useState("");

  const { data: creditsData, isLoading: creditsLoading } = useQuery({
    queryKey: ["vendor-credits", "apply-to-bill", vendorId],
    queryFn: () =>
      billingApi.vendorCredits.list({
        vendor: vendorId,
        status: "issued",
        page_size: 100,
        ordering: "-credit_date",
      }),
    enabled: open && vendorId > 0,
  });

  const credits = useMemo(() => {
    return (creditsData?.results ?? []).filter(
      (credit) => parseFloat(credit.unused_amount || "0") > 0.001
    );
  }, [creditsData]);

  const selected = useMemo(
    () => credits.find((c) => String(c.id) === vendorCreditId),
    [credits, vendorCreditId]
  );

  const unusedCredit = selected ? parseFloat(selected.unused_amount || "0") : 0;

  const maxApply = useMemo(() => {
    if (!selected) return 0;
    return Math.min(unusedCredit, amountDue);
  }, [selected, unusedCredit, amountDue]);

  useEffect(() => {
    if (!open) {
      setVendorCreditId("");
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
      const creditId = parseInt(vendorCreditId, 10);
      const amt = parseFloat(amountStr);
      if (!Number.isFinite(amt) || amt <= 0) {
        return Promise.reject(new Error("Invalid amount"));
      }
      return billingApi.vendorCredits.apply(creditId, {
        bill: billId,
        amount: amt.toFixed(2),
      });
    },
    onSuccess: () => {
      toast({ title: "Vendor credit applied", description: "The bill balance has been updated." });
      queryClient.invalidateQueries({ queryKey: ["bill", billId] });
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      queryClient.invalidateQueries({ queryKey: ["vendor-credits"] });
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
    Boolean(vendorCreditId) &&
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
            Apply an issued vendor credit to this bill. Balance due: {formatCurrency(amountDue)}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Vendor credit</Label>
            <Select
              value={vendorCreditId || undefined}
              onValueChange={setVendorCreditId}
              disabled={creditsLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder={creditsLoading ? "Loading…" : "Select credit…"} />
              </SelectTrigger>
              <SelectContent className="max-h-72 z-[200]">
                {credits.map((credit) => (
                  <SelectItem key={credit.id} value={String(credit.id)}>
                    {credit.credit_number} — {formatCurrency(credit.unused_amount)} available
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!creditsLoading && credits.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No issued vendor credits with remaining balance for this vendor.
              </p>
            )}
          </div>

          {selected && (
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
