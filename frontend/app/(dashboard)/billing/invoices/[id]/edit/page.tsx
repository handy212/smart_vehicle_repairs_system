"use client";

import { useRouter, useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { AxiosError } from "axios";

const invoiceUpdateSchema = z.object({
  description: z.string().optional(),
  notes: z.string().optional(),
  customer_notes: z.string().optional(),
  terms: z.string().optional(),
  invoice_date: z.string().min(1, "Invoice date is required"),
  due_date: z.string().min(1, "Due date is required"),
  discount_percentage: z.number().min(0).max(100).optional(),
  discount_reason: z.string().optional(),
  tax_amount: z.number().min(0).optional(),
  shop_supplies_fee: z.number().min(0).optional(),
  environmental_fee: z.number().min(0).optional(),
});

type InvoiceUpdateFormData = z.infer<typeof invoiceUpdateSchema>;

export default function EditInvoicePage() {
  const router = useRouter();
  const params = useParams();
  const invoiceId = parseInt(params.id as string);
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const { data: invoice, isLoading } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => billingApi.invoices.get(invoiceId),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    reset,
    watch,
  } = useForm<InvoiceUpdateFormData>({
    resolver: zodResolver(invoiceUpdateSchema),
  });

  // Populate form when invoice data loads
  useEffect(() => {
    if (invoice && !isLoading) {
      reset({
        description: (invoice as any).description || "",
        notes: invoice.notes || "",
        customer_notes: (invoice as any).customer_notes || "",
        terms: (invoice as any).terms || "",
        invoice_date: invoice.invoice_date ? invoice.invoice_date.split("T")[0] : "",
        due_date: invoice.due_date ? invoice.due_date.split("T")[0] : "",
        discount_percentage: invoice.discount_percentage ? parseFloat(invoice.discount_percentage) : undefined,
        discount_reason: (invoice as any).discount_reason || "",
        tax_amount: invoice.tax_amount ? parseFloat(invoice.tax_amount) : undefined,
        shop_supplies_fee: (invoice as any).shop_supplies_fee ? parseFloat((invoice as any).shop_supplies_fee) : undefined,
        environmental_fee: (invoice as any).environmental_fee ? parseFloat((invoice as any).environmental_fee) : undefined,
      });
    }
  }, [invoice, isLoading, reset]);

  const updateMutation = useMutation({
    mutationFn: (data: InvoiceUpdateFormData) => {
      // Transform data to match API expectations (convert numbers to strings for financial fields)
      const apiData: any = {
        ...data,
        discount_percentage: data.discount_percentage?.toString(),
        tax_amount: data.tax_amount?.toString(),
        shop_supplies_fee: data.shop_supplies_fee?.toString(),
        environmental_fee: data.environmental_fee?.toString(),
      };
      return billingApi.invoices.update(invoiceId, apiData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      router.push(`/billing/invoices/${invoiceId}`);
    },
    onError: (error) => {
      if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data;
        Object.keys(errorData).forEach((field) => {
          if (field !== "non_field_errors" && field !== "detail") {
            const fieldError = Array.isArray(errorData[field])
              ? errorData[field][0]
              : errorData[field];
            setError(field as keyof InvoiceUpdateFormData, {
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
        } else {
          setServerError("An error occurred while updating the invoice. Please check the form and try again.");
        }
      } else {
        setServerError("An unexpected error occurred. Please try again.");
      }
    },
  });

  const onSubmit = async (data: InvoiceUpdateFormData) => {
    setServerError(null);
    await updateMutation.mutateAsync(data);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="space-y-4">
        <Link href="/billing">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <Card>
          <CardContent className="pt-6">
            <p className="text-red-600">Invoice not found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link href={`/billing/invoices/${invoiceId}`}>
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Edit Invoice</h1>
          <p className="text-sm text-gray-500 mt-1">
            Invoice #{invoice.invoice_number}
          </p>
        </div>
      </div>

      {serverError && (
        <Card className="bg-red-50 border-red-200">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2 text-red-800">
              <AlertCircle className="w-5 h-5" />
              <p className="text-sm font-medium">{serverError}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Invoice Information */}
            <Card>
              <CardHeader>
                <CardTitle>Invoice Information</CardTitle>
                <CardDescription>Update invoice details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-gray-50 p-3 rounded">
                  <p className="text-xs text-gray-500">Invoice Number</p>
                  <p className="text-sm font-mono font-medium">{invoice.invoice_number}</p>
                  <p className="text-xs text-gray-500 mt-1">Invoice number cannot be changed</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="invoice_date" className="block text-sm font-medium text-gray-700 mb-1">
                      Invoice Date *
                    </label>
                    <Input
                      id="invoice_date"
                      type="date"
                      {...register("invoice_date")}
                      className={errors.invoice_date ? "border-red-500" : ""}
                    />
                    {errors.invoice_date && (
                      <p className="mt-1 text-sm text-red-600">{errors.invoice_date.message}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="due_date" className="block text-sm font-medium text-gray-700 mb-1">
                      Due Date *
                    </label>
                    <Input
                      id="due_date"
                      type="date"
                      {...register("due_date")}
                      className={errors.due_date ? "border-red-500" : ""}
                    />
                    {errors.due_date && (
                      <p className="mt-1 text-sm text-red-600">{errors.due_date.message}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <Textarea
                    id="description"
                    {...register("description")}
                    rows={3}
                    placeholder="Invoice description..."
                  />
                </div>

                <div>
                  <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                    Internal Notes
                  </label>
                  <Textarea
                    id="notes"
                    {...register("notes")}
                    rows={2}
                    placeholder="Internal notes (not visible to customer)..."
                  />
                </div>

                <div>
                  <label htmlFor="customer_notes" className="block text-sm font-medium text-gray-700 mb-1">
                    Customer Notes
                  </label>
                  <Textarea
                    id="customer_notes"
                    {...register("customer_notes")}
                    rows={2}
                    placeholder="Notes visible to customer..."
                  />
                </div>

                <div>
                  <label htmlFor="terms" className="block text-sm font-medium text-gray-700 mb-1">
                    Terms & Conditions
                  </label>
                  <Textarea
                    id="terms"
                    {...register("terms")}
                    rows={3}
                    placeholder="Payment terms and conditions..."
                  />
                </div>
              </CardContent>
            </Card>

            {/* Discounts & Fees */}
            <Card>
              <CardHeader>
                <CardTitle>Discounts & Fees</CardTitle>
                <CardDescription>Update discounts and additional fees</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="discount_percentage" className="block text-sm font-medium text-gray-700 mb-1">
                      Discount Percentage (%)
                    </label>
                    <Input
                      id="discount_percentage"
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      {...register("discount_percentage", { valueAsNumber: true })}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label htmlFor="discount_reason" className="block text-sm font-medium text-gray-700 mb-1">
                      Discount Reason
                    </label>
                    <Input
                      id="discount_reason"
                      {...register("discount_reason")}
                      placeholder="e.g., Customer loyalty discount"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="tax_amount" className="block text-sm font-medium text-gray-700 mb-1">
                      Tax Amount
                    </label>
                    <Input
                      id="tax_amount"
                      type="number"
                      step="0.01"
                      min="0"
                      {...register("tax_amount", { valueAsNumber: true })}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label htmlFor="shop_supplies_fee" className="block text-sm font-medium text-gray-700 mb-1">
                      Shop Supplies Fee
                    </label>
                    <Input
                      id="shop_supplies_fee"
                      type="number"
                      step="0.01"
                      min="0"
                      {...register("shop_supplies_fee", { valueAsNumber: true })}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label htmlFor="environmental_fee" className="block text-sm font-medium text-gray-700 mb-1">
                      Environmental Fee
                    </label>
                    <Input
                      id="environmental_fee"
                      type="number"
                      step="0.01"
                      min="0"
                      {...register("environmental_fee", { valueAsNumber: true })}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Invoice Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Invoice Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Subtotal</span>
                  <span className="text-gray-900">
                    ${parseFloat(invoice.subtotal || "0").toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Tax</span>
                  <span className="text-gray-900">
                    ${parseFloat(invoice.tax_amount || "0").toFixed(2)}
                  </span>
                </div>
                <div className="border-t pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Total</span>
                    <span className="text-lg font-bold text-gray-900">
                      ${parseFloat(invoice.total || "0").toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="border-t pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Amount Paid</span>
                    <span className="text-gray-900">
                      ${parseFloat(invoice.amount_paid || "0").toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm font-medium text-gray-700">Balance Due</span>
                    <span className="text-lg font-bold text-red-600">
                      ${parseFloat(invoice.balance_due || "0").toFixed(2)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
                <Link href={`/billing/invoices/${invoiceId}`}>
                  <Button type="button" variant="outline" className="w-full">
                    Cancel
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}

