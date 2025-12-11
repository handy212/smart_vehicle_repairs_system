"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { billingApi, Invoice } from "@/lib/api/billing";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { AxiosError } from "axios";
import { useToast } from "@/lib/hooks/useToast";

const paymentSchema = z.object({
  payment_method: z.enum(["cash", "check", "credit_card", "debit_card", "bank_transfer", "online", "other"]),
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

export default function RecordPaymentDialog({
  invoice,
  open,
  onClose,
  onSuccess,
}: RecordPaymentDialogProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setError,
    watch,
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      payment_method: "cash",
      payment_date: new Date().toISOString().split("T")[0],
      amount: parseFloat(invoice.balance_due || invoice.total || "0"),
    },
  });

  const paymentMethod = watch("payment_method");
  const amount = watch("amount") || 0;
  const balanceDue = parseFloat(invoice.balance_due || invoice.total || "0");
  const isOverPayment = amount > balanceDue;
  const overPaymentAmount = isOverPayment ? (amount - balanceDue) : 0;

  const createPaymentMutation = useMutation({
    mutationFn: (data: PaymentFormData) =>
      billingApi.payments.create({
        ...data,
        amount: data.amount.toString(),
        invoice: typeof invoice.id === 'number' ? invoice.id : parseInt(invoice.id as any),
      } as any),
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
        Object.keys(errorData).forEach((field) => {
          if (field !== "non_field_errors" && field !== "detail") {
            const fieldError = Array.isArray(errorData[field])
              ? errorData[field][0]
              : errorData[field];
            setError(field as keyof PaymentFormData, {
              type: "server",
              message: fieldError,
            });
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
        }
      }
    },
  });

  const onSubmit = async (data: PaymentFormData) => {
    setServerError(null);
    await createPaymentMutation.mutateAsync(data);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record Payment - Invoice #{invoice.invoice_number}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="px-6 pb-6">
          <div className="space-y-4">
          {serverError && (
            <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded text-sm">
              {serverError}
            </div>
          )}

          <div className="bg-gray-50 p-4 rounded">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Invoice Total</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${parseFloat(invoice.total || "0").toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Balance Due</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${balanceDue.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="payment_method" className="block text-sm font-medium text-gray-700 mb-2">
                Payment Method *
              </label>
              <Select
                id="payment_method"
                {...register("payment_method")}
                className={`w-full ${errors.payment_method ? "border-red-500" : ""}`}
              >
                <option value="cash">Cash</option>
                <option value="check">Check</option>
                <option value="credit_card">Credit Card</option>
                <option value="debit_card">Debit Card</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="online">Online Payment</option>
                <option value="other">Other</option>
              </Select>
              {errors.payment_method && (
                <p className="mt-1 text-sm text-red-600">{errors.payment_method.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="payment_date" className="block text-sm font-medium text-gray-700 mb-2">
                Payment Date *
              </label>
              <Input
                id="payment_date"
                type="date"
                {...register("payment_date")}
                className={`w-full ${errors.payment_date ? "border-red-500" : ""}`}
              />
              {errors.payment_date && (
                <p className="mt-1 text-sm text-red-600">{errors.payment_date.message}</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-2">
              Payment Amount *
            </label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              {...register("amount", { valueAsNumber: true })}
              className={`w-full ${errors.amount ? "border-red-500" : ""}`}
              placeholder="0.00"
            />
            {errors.amount && (
              <p className="mt-1 text-sm text-red-600">{errors.amount.message}</p>
            )}
            {isOverPayment && (
              <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
                <p className="text-sm font-medium text-amber-800">
                  Overpayment Detected
                </p>
                <p className="text-sm text-amber-700 mt-1">
                  Payment amount (${amount.toFixed(2)}) exceeds balance due (${balanceDue.toFixed(2)}).
                </p>
                <p className="text-sm text-amber-700 mt-1">
                  Overpayment of <strong>${overPaymentAmount.toFixed(2)}</strong> will be applied as customer credit.
                </p>
              </div>
            )}
          </div>

          {(paymentMethod === "check" || paymentMethod === "bank_transfer" || paymentMethod === "online") && (
            <div>
              <label htmlFor="reference_number" className="block text-sm font-medium text-gray-700 mb-2">
                Reference Number
              </label>
              <Input
                id="reference_number"
                {...register("reference_number")}
                className="w-full"
                placeholder="Check number, transaction ID, etc."
              />
            </div>
          )}

          {(paymentMethod === "credit_card" || paymentMethod === "debit_card") && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="card_last_four" className="block text-sm font-medium text-gray-700 mb-2">
                  Card Last 4 Digits
                </label>
                <Input
                  id="card_last_four"
                  {...register("card_last_four")}
                  className="w-full"
                  placeholder="1234"
                  maxLength={4}
                />
              </div>
              <div>
                <label htmlFor="card_type" className="block text-sm font-medium text-gray-700 mb-2">
                  Card Type
                </label>
                <Select id="card_type" {...register("card_type")} className="w-full">
                  <option value="">Select type</option>
                  <option value="visa">Visa</option>
                  <option value="mastercard">Mastercard</option>
                  <option value="amex">American Express</option>
                  <option value="discover">Discover</option>
                  <option value="other">Other</option>
                </Select>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
              Notes
            </label>
            <Textarea
              id="notes"
              {...register("notes")}
              rows={3}
              className="w-full"
              placeholder="Additional payment notes..."
            />
          </div>
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            type="button" 
            onClick={handleSubmit(onSubmit)} 
            disabled={isSubmitting}
            className={isOverPayment ? "bg-amber-600 hover:bg-amber-700" : ""}
          >
            {isSubmitting ? "Recording..." : isOverPayment ? `Record Payment (Credit: $${overPaymentAmount.toFixed(2)})` : "Record Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

