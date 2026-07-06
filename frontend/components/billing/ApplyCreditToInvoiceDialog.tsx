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
import { billingApi, type Invoice } from "@/lib/api/billing";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useToast } from "@/lib/hooks/useToast";
import { Loader2 } from "lucide-react";

function invoiceBalanceDue(inv: Invoice): number {
  const total = parseFloat(inv.total || "0");
  const paid = parseFloat(inv.amount_paid || "0");
  if (inv.amount_due != null && inv.amount_due !== "") {
    return Math.max(0, parseFloat(String(inv.amount_due)));
  }
  return Math.max(0, total - paid);
}

export interface ApplyCreditToInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creditNoteId: number;
  customerId: number;
  /** Remaining credit on the note (unused_amount) */
  unusedCredit: number;
}

export function ApplyCreditToInvoiceDialog({
  open,
  onOpenChange,
  creditNoteId,
  customerId,
  unusedCredit,
}: ApplyCreditToInvoiceDialogProps) {
  const { formatCurrency } = useCurrency();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [invoiceId, setInvoiceId] = useState<string>("");
  const [amountStr, setAmountStr] = useState("");

  const { data: listData, isLoading: invoicesLoading } = useQuery({
    queryKey: ["invoices", "apply-credit", customerId],
    queryFn: () =>
      billingApi.invoices.list({
        customer: customerId,
        page_size: 100,
        ordering: "-invoice_date",
      }),
    enabled: open && customerId > 0,
  });

  const invoices = useMemo(() => {
    const raw = listData?.results ?? [];
    return raw.filter((inv) => {
      if (["void", "refunded", "paid", "draft", "proforma"].includes(inv.status)) {
        return false;
      }
      return invoiceBalanceDue(inv) > 0.001;
    });
  }, [listData]);

  const selected = useMemo(
    () => invoices.find((i) => String(i.id) === invoiceId),
    [invoices, invoiceId]
  );

  const maxApply = useMemo(() => {
    if (!selected) return 0;
    return Math.min(unusedCredit, invoiceBalanceDue(selected));
  }, [selected, unusedCredit]);

  useEffect(() => {
    if (!open) {
      setInvoiceId("");
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
      const inv = parseInt(invoiceId, 10);
      const amt = parseFloat(amountStr);
      if (!Number.isFinite(amt) || amt <= 0) {
        return Promise.reject(new Error("Invalid amount"));
      }
      return billingApi.creditNotes.apply(creditNoteId, {
        invoice: inv,
        amount: amt.toFixed(2),
      });
    },
    onSuccess: () => {
      toast({ title: "Credit applied", description: "The invoice balance has been updated." });
      queryClient.invalidateQueries({ queryKey: ["creditNote", creditNoteId] });
      queryClient.invalidateQueries({ queryKey: ["creditNotes"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      let description = "Could not apply credit.";
      if (err && typeof err === "object" && "response" in err) {
        const d = (err as { response?: { data?: { error?: string } } }).response?.data;
        if (d?.error) description = d.error;
      }
      toast({ title: "Error", description, variant: "destructive" });
    },
  });

  const canSubmit =
    Boolean(invoiceId) &&
    maxApply > 0 &&
    Number.isFinite(parseFloat(amountStr)) &&
    parseFloat(amountStr) > 0 &&
    parseFloat(amountStr) <= maxApply + 0.0001;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apply credit to invoice</DialogTitle>
          <DialogDescription>
            Uses this credit note&apos;s unused balance toward an open invoice for the same customer.
            Remaining credit: {formatCurrency(unusedCredit)}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Open invoice</Label>
            <Select value={invoiceId || undefined} onValueChange={setInvoiceId} disabled={invoicesLoading}>
              <SelectTrigger>
                <SelectValue placeholder={invoicesLoading ? "Loading…" : "Select invoice…"} />
              </SelectTrigger>
              <SelectContent className="max-h-72 z-[200]">
                {invoices.map((inv) => {
                  const due = invoiceBalanceDue(inv);
                  return (
                    <SelectItem key={inv.id} value={String(inv.id)}>
                      #{inv.invoice_number} — {formatCurrency(due)} due ({inv.status})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {!invoicesLoading && invoices.length === 0 && (
              <p className="text-xs text-muted-foreground">No open invoices with a balance for this customer.</p>
            )}
          </div>

          {selected && (
            <div className="space-y-2">
              <Label htmlFor="apply-amount">Amount to apply</Label>
              <Input
                id="apply-amount"
                type="number"
                step="0.01"
                min={0.01}
                max={maxApply}
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Maximum this application: {formatCurrency(maxApply)} (lesser of unused credit and invoice balance).
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
