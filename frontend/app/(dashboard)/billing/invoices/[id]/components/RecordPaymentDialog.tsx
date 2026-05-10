"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { billingApi, Invoice } from "@/lib/api/billing";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { AxiosError } from "axios";
import { useToast } from "@/lib/hooks/useToast";

import { useCurrency } from "@/lib/hooks/useCurrency";
const paymentSchema = z.object({
  payment_method: z.enum([
    "cash",
    "check",
    "credit_card",
    "debit_card",
    "ach",
    "wire",
    "paypal",
    "venmo",
    "zelle",
    "mtn_momo",
    "vodafone_cash",
    "airteltigo_money",
    "hubtel_card",
    "paystack",
    "other",
  ]),
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  payment_date: z.string().min(1, "Payment date is required"),
  reference_number: z.string().optional(),
  card_last_four: z.string().optional(),
  card_type: z.string().optional(),
  notes: z.string().optional(),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

interface RecordPaymentDialogProps {
  invoice: Invoice;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const parseAmount = (value?: string | number | null) => {
  if (value === null || value === undefined) {
    return 0;
  }
  const num = typeof value === "number" ? value : parseFloat(value);
  return Number.isNaN(num) ? 0 : num;
};

const hasAmountValue = (value?: string | number | null) =>
  value !== null && value !== undefined && String(value).trim() !== "";

const getInvoiceBalanceDue = (invoice: Invoice) => {
  if (hasAmountValue(invoice.balance_due)) {
    return parseAmount(invoice.balance_due);
  }

  if (hasAmountValue(invoice.amount_due)) {
    return parseAmount(invoice.amount_due);
  }

  return Math.max(parseAmount(invoice.total) - parseAmount(invoice.amount_paid), 0);
};

export default function RecordPaymentDialog({
  invoice,
  open,
  onClose,
  onSuccess,
}: RecordPaymentDialogProps) {
  const { formatCurrency } = useCurrency();
  const [serverError, setServerError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const balanceDue = getInvoiceBalanceDue(invoice);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setError,
    watch,
    setValue,
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      payment_method: "cash",
      payment_date: new Date().toISOString().split("T")[0],
      amount: balanceDue,
    },
  });

  const paymentMethod = watch("payment_method");
  const amount = watch("amount") || 0;
  const isOverPayment = amount > balanceDue;
  const overPaymentAmount = isOverPayment ? (amount - balanceDue) : 0;

  const createPaymentMutation = useMutation({
    mutationFn: (data: PaymentFormData) =>
      billingApi.payments.create({
        ...data,
        amount: data.amount.toString(),
        payment_date: `${data.payment_date}T00:00:00`,
        invoice: Number(invoice.id),
      }),
    onSuccess: () => {
      reset();
      setServerError(null);
      queryClient.invalidateQueries({ queryKey: ["invoice", invoice.id] });
      queryClient.invalidateQueries({ queryKey: ["payments", invoice.id] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({
        title: "Success",
        description: "Payment recorded successfully",
      });
      onSuccess();
    },
    onError: (error) => {
      if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data;
        const formFields = new Set([
          "payment_method",
          "amount",
          "payment_date",
          "reference_number",
          "card_last_four",
          "card_type",
          "notes",
        ]);
        const generalErrors: string[] = [];

        Object.keys(errorData).forEach((field) => {
          const fieldError = Array.isArray(errorData[field])
            ? errorData[field][0]
            : errorData[field];
          if (field !== "non_field_errors" && field !== "detail") {
            if (formFields.has(field)) {
              setError(field as keyof PaymentFormData, {
                type: "server",
                message: String(fieldError),
              });
            } else {
              generalErrors.push(String(fieldError));
            }
          }
        });
        if (errorData.non_field_errors) {
          setServerError(
            Array.isArray(errorData.non_field_errors)
              ? errorData.non_field_errors[0]
              : errorData.non_field_errors
          );
        } else if (errorData.detail) {
          setServerError(errorData.detail);
        } else if (generalErrors.length > 0) {
          setServerError(generalErrors.join(", "));
        }
      }
    },
  });

  const onSubmit = async (data: PaymentFormData) => {
    setServerError(null);
    if (data.amount > balanceDue) {
      setError("amount", {
        type: "manual",
        message: `Amount cannot exceed the balance due (${formatCurrency(balanceDue)})`,
      });
      return;
    }
    await createPaymentMutation.mutateAsync(data);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="pb-3">
          <DialogTitle className="text-lg">Record Payment</DialogTitle>
          <p className="text-sm text-muted-foreground">Invoice #{invoice.invoice_number}</p>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {serverError && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive px-3 py-2 rounded text-sm">
              {serverError}
            </div>
          )}

          {/* Invoice Summary - Compact */}
          <div className="bg-muted/50 p-3 rounded-lg grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Invoice Total</p>
              <p className="text-lg font-bold">
                {formatCurrency(parseFloat(invoice.total || "0"))}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Balance Due</p>
              <p className="text-lg font-bold text-primary">
                {formatCurrency(balanceDue)}
              </p>
            </div>
          </div>

          {/* Form Fields - Compact Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="payment_method" className="block text-sm font-medium">
                Payment Method *
              </label>
              <Select
                value={watch("payment_method")}

                onValueChange={(val) => setValue("payment_method", val as PaymentFormData["payment_method"], { shouldValidate: true })}
              >
                <SelectTrigger id="payment_method" className={`h-9 ${errors.payment_method ? "border-destructive" : ""}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="credit_card">Credit Card</SelectItem>
                  <SelectItem value="debit_card">Debit Card</SelectItem>
                  <SelectItem value="ach">ACH/Bank Transfer</SelectItem>
                  <SelectItem value="wire">Wire Transfer</SelectItem>
                  <SelectItem value="paypal">PayPal</SelectItem>
                  <SelectItem value="venmo">Venmo</SelectItem>
                  <SelectItem value="zelle">Zelle</SelectItem>
                  <SelectItem value="mtn_momo">MTN Mobile Money</SelectItem>
                  <SelectItem value="vodafone_cash">Vodafone Cash</SelectItem>
                  <SelectItem value="airteltigo_money">AirtelTigo Money</SelectItem>
                  <SelectItem value="hubtel_card">Hubtel Card</SelectItem>
                  <SelectItem value="paystack">Paystack</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              {errors.payment_method && (
                <p className="text-xs text-destructive">{errors.payment_method.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="payment_date" className="block text-sm font-medium">
                Date *
              </label>
              <Input
                id="payment_date"
                type="date"
                {...register("payment_date")}
                className={`h-9 ${errors.payment_date ? "border-destructive" : ""}`}
              />
              {errors.payment_date && (
                <p className="text-xs text-destructive">{errors.payment_date.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="amount" className="block text-sm font-medium">
              Amount *
            </label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              {...register("amount", { valueAsNumber: true })}
              className={`h-9 ${errors.amount ? "border-destructive" : ""}`}
              placeholder="0.00"
            />
            {errors.amount && (
              <p className="text-xs text-destructive">{errors.amount.message}</p>
            )}
            {isOverPayment && (
              <div className="mt-2 p-2.5 bg-warning/10 border border-warning/20 rounded-md">
                <p className="text-xs font-medium text-warning">
                  Overpayment: {formatCurrency(overPaymentAmount)}. Reduce the amount to the balance due.
                </p>
              </div>
            )}
          </div>

          {/* Conditional Fields */}
          {(["check", "ach", "wire", "paypal", "venmo", "zelle", "mtn_momo", "vodafone_cash", "airteltigo_money", "hubtel_card", "paystack"] as string[]).includes(paymentMethod) && (
            <div className="space-y-1.5">
              <label htmlFor="reference_number" className="block text-sm font-medium">
                Reference Number
              </label>
              <Input
                id="reference_number"
                {...register("reference_number")}
                className="h-9"
                placeholder="Check #, Transaction ID, etc."
              />
            </div>
          )}

          {(paymentMethod === "credit_card" || paymentMethod === "debit_card") && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="card_last_four" className="block text-sm font-medium">
                  Last 4 Digits
                </label>
                <Input
                  id="card_last_four"
                  {...register("card_last_four")}
                  className="h-9"
                  placeholder="1234"
                  maxLength={4}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="card_type" className="block text-sm font-medium">
                  Card Type
                </label>
                <Select
                  value={watch("card_type") || ""}
                  onValueChange={(val) => setValue("card_type", val)}
                >
                  <SelectTrigger id="card_type" className="h-9">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="visa">Visa</SelectItem>
                    <SelectItem value="mastercard">Mastercard</SelectItem>
                    <SelectItem value="amex">Amex</SelectItem>
                    <SelectItem value="discover">Discover</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="notes" className="block text-sm font-medium">
              Notes (Optional)
            </label>
            <Textarea
              id="notes"
              {...register("notes")}
              rows={2}
              className="resize-none text-sm"
              placeholder="Additional payment notes..."
            />
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="h-9">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className={`h-9 ${isOverPayment ? "bg-amber-600 hover:bg-amber-700" : ""}`}
            >
              {isSubmitting ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
