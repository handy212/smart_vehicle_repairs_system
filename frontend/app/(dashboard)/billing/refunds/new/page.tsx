"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { refundApi } from "@/lib/api/till-refund";
import { billingApi, type Payment } from "@/lib/api/billing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, DollarSign } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/lib/hooks/useToast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { CustomerSelector } from "@/components/customers/CustomerSelector";

export default function CreateRefundPage() {
  const { formatCurrency } = useCurrency();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [paymentId, setPaymentId] = useState<string>("");
  const [customerOverride, setCustomerOverride] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState("cash");
  const [referenceNumber, setReferenceNumber] = useState("");

  const { data: payments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ["payments", "refund-new"],
    queryFn: () =>
      billingApi.payments.list({
        status: "completed",
        ordering: "-payment_date",
      }),
  });

  const selectedPayment = useMemo(
    () => payments.find((p) => String(p.id) === paymentId),
    [payments, paymentId]
  );

  const customerIdFromPayment =
    selectedPayment?.customer != null && Number(selectedPayment.customer) > 0
      ? String(selectedPayment.customer)
      : "";

  const effectiveCustomerId = customerIdFromPayment || customerOverride;

  const hasValidInvoice =
    selectedPayment != null &&
    selectedPayment.invoice != null &&
    Number(selectedPayment.invoice) > 0;

  const canSubmit =
    Boolean(paymentId) &&
    Boolean(effectiveCustomerId) &&
    hasValidInvoice &&
    Boolean(amount) &&
    reason.trim().length > 0;

  const createMutation = useMutation({
    mutationFn: (data: {
      original_payment: number;
      invoice: number;
      customer: number;
      amount: string;
      reason: string;
      refund_method: string;
      reference_number?: string;
    }) => refundApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["refunds"] });
      toast({ title: "Success", description: "Refund created successfully" });
      router.push("/billing/refunds");
    },
    onError: (error: unknown) => {
      let description = "Failed to create refund";
      if (error && typeof error === "object" && "response" in error) {
        const data = (error as { response?: { data?: { error?: string } } }).response?.data;
        if (data?.error) description = data.error;
      }
      toast({
        title: "Error",
        description,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !selectedPayment?.invoice) {
      toast({
        title: "Error",
        description: "Select a completed payment and complete all required fields.",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate({
      original_payment: parseInt(paymentId, 10),
      invoice: selectedPayment.invoice,
      customer: parseInt(effectiveCustomerId, 10),
      amount,
      reason: reason.trim(),
      refund_method: refundMethod,
      reference_number: referenceNumber.trim() || undefined,
    });
  };

  return (
    <div className="w-full space-y-6">
      <Button variant="ghost" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Refunds
      </Button>

      <div>
        <h1 className="text-xl font-bold tracking-tight">Create Refund</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Choose the original payment; invoice and customer are taken from that payment when
          available.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Refund details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="payment">Original payment *</Label>
              <Select
                value={paymentId || undefined}
                onValueChange={(val) => {
                  setPaymentId(val);
                  setCustomerOverride("");
                }}
                disabled={paymentsLoading}
              >
                <SelectTrigger id="payment">
                  <SelectValue
                    placeholder={paymentsLoading ? "Loading payments…" : "Select payment…"}
                  />
                </SelectTrigger>
                <SelectContent className="max-h-72 z-[200]">
                  {payments.map((p: Payment) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.payment_number ?? `#${p.id}`} — {p.customer_name ?? "Customer"} —{" "}
                      {p.invoice_number ? `#${p.invoice_number}` : `Inv ${p.invoice}`} —{" "}
                      {formatCurrency(parseFloat(String(p.amount)))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!paymentsLoading && payments.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No completed payments in scope. Record a payment first, or check branch filters.
                </p>
              )}
            </div>

            {selectedPayment && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                <p>
                  <span className="text-muted-foreground">Invoice: </span>
                  <span className="font-medium">
                    {selectedPayment.invoice_number ?? `#${selectedPayment.invoice}`}
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground">Customer: </span>
                  <span className="font-medium">
                    {selectedPayment.customer_name ?? "—"}
                  </span>
                </p>
              </div>
            )}

            {selectedPayment && !customerIdFromPayment && (
              <div className="space-y-2">
                <Label>Customer *</Label>
                <CustomerSelector
                  selectedCustomerId={customerOverride ? parseInt(customerOverride, 10) : undefined}
                  onSelect={(selected) => setCustomerOverride(String(selected.id))}
                  placeholder="Search and select a customer..."
                />
                <p className="text-xs text-muted-foreground">
                  This payment had no linked customer id; pick the customer manually.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Refund amount *</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="pl-9"
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Refund method *</Label>
                <Select value={refundMethod} onValueChange={setRefundMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[200]">
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                    <SelectItem value="pos">POS / card</SelectItem>
                    <SelectItem value="mobile_money">Mobile money</SelectItem>
                    <SelectItem value="original_method">Original payment method</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reference">Reference (optional)</Label>
              <Input
                id="reference"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="Transaction ID, cheque no., etc."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason *</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this refund being issued?"
                rows={4}
                required
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={createMutation.isPending || !canSubmit} className="flex-1">
                {createMutation.isPending ? "Creating…" : "Create refund"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()} className="flex-1">
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
