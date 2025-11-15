"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { customersApi } from "@/lib/api/customers";
import { vehiclesApi } from "@/lib/api/vehicles";
import { workordersApi } from "@/lib/api/workorders";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, AlertCircle, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AxiosError } from "axios";

const lineItemSchema = z.object({
  item_type: z.enum(["labor", "part", "fee", "discount"]),
  description: z.string().min(1, "Description is required"),
  quantity: z.number().min(0).optional(),
  unit_price: z.number().min(0).optional(),
  labor_hours: z.number().min(0).optional(),
  labor_rate: z.number().min(0).optional(),
  is_taxable: z.boolean(),
});

const invoiceSchema = z.object({
  customer: z.number().min(1, "Customer is required"),
  vehicle: z.number().optional(),
  work_order: z.number().optional(),
  invoice_date: z.string().min(1, "Invoice date is required"),
  due_date: z.string().min(1, "Due date is required"),
  payment_terms: z.enum(["due_on_receipt", "net_15", "net_30", "net_60"]),
  notes: z.string().optional(),
  line_items: z.array(lineItemSchema).min(1, "At least one line item is required"),
});

type InvoiceFormData = z.infer<typeof invoiceSchema>;
type LineItemFormData = z.infer<typeof lineItemSchema>;

export default function NewInvoicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workOrderId = searchParams.get("work_order");
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<Array<Omit<LineItemFormData, 'is_taxable'> & { is_taxable: boolean }>>([
    { item_type: "labor", description: "", quantity: 1, unit_price: 0, is_taxable: true },
  ]);

  // Fetch customers
  const { data: customersData } = useQuery({
    queryKey: ["customers", "list"],
    queryFn: () => customersApi.list({ page: 1 }),
  });

  // Fetch work order if provided
  const { data: workOrder } = useQuery({
    queryKey: ["workorder", workOrderId],
    queryFn: () => workordersApi.get(parseInt(workOrderId!)),
    enabled: !!workOrderId,
  });

  // Fetch vehicles for selected customer
  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(
    workOrder ? (typeof workOrder.customer === 'object' ? workOrder.customer.id : workOrder.customer) : null
  );

  const { data: vehiclesData } = useQuery({
    queryKey: ["vehicles", "customer", selectedCustomer],
    queryFn: () => vehiclesApi.list({ owner: selectedCustomer || undefined }),
    enabled: !!selectedCustomer,
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    setError,
    watch,
  } = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      invoice_date: new Date().toISOString().split("T")[0],
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      payment_terms: "net_30",
      customer: workOrder ? (typeof workOrder.customer === 'object' ? workOrder.customer.id : workOrder.customer) : undefined,
      vehicle: workOrder ? (typeof workOrder.vehicle === 'object' ? workOrder.vehicle.id : workOrder.vehicle) : undefined,
      work_order: workOrderId ? parseInt(workOrderId) : undefined,
      line_items: lineItems.map(item => ({ ...item, is_taxable: item.is_taxable ?? true })),
    },
  });

  const customer = watch("customer");

  // Update selected customer when form value changes
  if (customer && customer !== selectedCustomer) {
    setSelectedCustomer(customer);
    setValue("vehicle", undefined);
  }

  const addLineItem = () => {
    setLineItems([...lineItems, { item_type: "labor", description: "", quantity: 1, unit_price: 0, is_taxable: true }]);
  };

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const updateLineItem = (index: number, field: keyof LineItemFormData, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
    setValue("line_items", updated);
  };

  const calculateLineItemTotal = (item: LineItemFormData): number => {
    if (item.item_type === "labor" && item.labor_hours && item.labor_rate) {
      return item.labor_hours * item.labor_rate;
    }
    if (item.quantity && item.unit_price) {
      return item.quantity * item.unit_price;
    }
    return item.unit_price || 0;
  };

  const subtotal = lineItems.reduce((sum, item) => sum + calculateLineItemTotal(item), 0);
  const taxAmount = subtotal * 0.1; // 10% tax (should come from tax rate)
  const total = subtotal + taxAmount;

  const createMutation = useMutation({
    mutationFn: (data: InvoiceFormData) => {
      // Transform data to match API expectations (convert numbers to strings for financial fields)
      const apiData: any = {
        ...data,
        line_items: data.line_items.map((item) => ({
          ...item,
          unit_price: item.unit_price?.toString(),
          labor_rate: item.labor_rate?.toString(),
        })),
      };
      return billingApi.invoices.create(apiData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      router.push("/billing");
    },
    onError: (error) => {
      if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data;
        Object.keys(errorData).forEach((field) => {
          if (field !== "non_field_errors" && field !== "detail") {
            const fieldError = Array.isArray(errorData[field])
              ? errorData[field][0]
              : errorData[field];
            setError(field as keyof InvoiceFormData, {
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
          setServerError("An error occurred while creating the invoice. Please check the form and try again.");
        }
      } else {
        setServerError("An unexpected error occurred. Please try again.");
      }
    },
  });

  const onSubmit = async (data: InvoiceFormData) => {
    setServerError(null);
    // Calculate totals for line items
    const lineItemsWithTotals = lineItems.map((item) => ({
      ...item,
      total: calculateLineItemTotal(item).toFixed(2),
    }));
    await createMutation.mutateAsync({
      ...data,
      line_items: lineItemsWithTotals,
      subtotal: subtotal.toFixed(2),
      tax_amount: taxAmount.toFixed(2),
      total: total.toFixed(2),
    } as any);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/billing">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">New Invoice</h1>
          <p className="text-sm text-gray-500 mt-1">Create a new invoice</p>
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
            {/* Customer & Vehicle */}
            <Card>
              <CardHeader>
                <CardTitle>Customer & Vehicle</CardTitle>
                <CardDescription>Select customer and vehicle</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label htmlFor="customer" className="block text-sm font-medium text-gray-700 mb-1">
                    Customer *
                  </label>
                  <Select
                    id="customer"
                    {...register("customer", { valueAsNumber: true })}
                    className={errors.customer ? "border-red-500" : ""}
                    onChange={(e) => {
                      setValue("customer", parseInt(e.target.value));
                      setSelectedCustomer(parseInt(e.target.value));
                    }}
                  >
                    <option value="">Select a customer</option>
                    {customersData?.results?.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.user?.first_name} {customer.user?.last_name} - {customer.customer_number}
                      </option>
                    ))}
                  </Select>
                  {errors.customer && (
                    <p className="mt-1 text-sm text-red-600">{errors.customer.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="vehicle" className="block text-sm font-medium text-gray-700 mb-1">
                    Vehicle
                  </label>
                  <Select
                    id="vehicle"
                    {...register("vehicle", { valueAsNumber: true })}
                    disabled={!selectedCustomer || !vehiclesData?.results?.length}
                  >
                    <option value="">
                      {!selectedCustomer
                        ? "Select a customer first"
                        : !vehiclesData?.results?.length
                        ? "No vehicles found"
                        : "Select a vehicle"}
                    </option>
                    {vehiclesData?.results?.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.year} {vehicle.make} {vehicle.model} - {vehicle.vin}
                      </option>
                    ))}
                  </Select>
                </div>

                {workOrder && (
                  <div className="bg-blue-50 p-3 rounded">
                    <p className="text-sm text-blue-800">
                      Creating invoice from work order: <strong>{workOrder.work_order_number}</strong>
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Invoice Details */}
            <Card>
              <CardHeader>
                <CardTitle>Invoice Details</CardTitle>
                <CardDescription>Dates and payment terms</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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
                  <label htmlFor="payment_terms" className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Terms
                  </label>
                  <Select id="payment_terms" {...register("payment_terms")}>
                    <option value="due_on_receipt">Due on Receipt</option>
                    <option value="net_15">Net 15</option>
                    <option value="net_30">Net 30</option>
                    <option value="net_60">Net 60</option>
                  </Select>
                </div>

                <div>
                  <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                    Notes
                  </label>
                  <Textarea
                    id="notes"
                    {...register("notes")}
                    rows={3}
                    placeholder="Additional notes for the invoice..."
                  />
                </div>
              </CardContent>
            </Card>

            {/* Line Items */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Line Items</CardTitle>
                  <CardDescription>Add items to the invoice</CardDescription>
                </div>
                <Button type="button" onClick={addLineItem} variant="outline" size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Item
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {lineItems.map((item, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-sm">Item {index + 1}</h4>
                      {lineItems.length > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeLineItem(index)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Type *
                        </label>
                        <Select
                          value={item.item_type}
                          onChange={(e) =>
                            updateLineItem(index, "item_type", e.target.value as any)
                          }
                        >
                          <option value="labor">Labor</option>
                          <option value="part">Part</option>
                          <option value="fee">Fee</option>
                          <option value="discount">Discount</option>
                        </Select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Description *
                        </label>
                        <Input
                          value={item.description}
                          onChange={(e) =>
                            updateLineItem(index, "description", e.target.value)
                          }
                          placeholder="Item description"
                        />
                      </div>
                    </div>

                    {item.item_type === "labor" ? (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Hours
                          </label>
                          <Input
                            type="number"
                            step="0.5"
                            value={item.labor_hours || ""}
                            onChange={(e) =>
                              updateLineItem(index, "labor_hours", parseFloat(e.target.value) || 0)
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Rate ($/hr)
                          </label>
                          <Input
                            type="number"
                            step="0.01"
                            value={item.labor_rate || ""}
                            onChange={(e) =>
                              updateLineItem(index, "labor_rate", parseFloat(e.target.value) || 0)
                            }
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Quantity
                          </label>
                          <Input
                            type="number"
                            value={item.quantity || ""}
                            onChange={(e) =>
                              updateLineItem(index, "quantity", parseFloat(e.target.value) || 0)
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Unit Price
                          </label>
                          <Input
                            type="number"
                            step="0.01"
                            value={item.unit_price || ""}
                            onChange={(e) =>
                              updateLineItem(index, "unit_price", parseFloat(e.target.value) || 0)
                            }
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={item.is_taxable}
                          onChange={(e) =>
                            updateLineItem(index, "is_taxable", e.target.checked)
                          }
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700">Taxable</span>
                      </label>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Total</p>
                        <p className="text-lg font-bold">
                          ${calculateLineItemTotal(item).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}

                {errors.line_items && (
                  <p className="text-sm text-red-600">{errors.line_items.message}</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Invoice Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Subtotal</span>
                  <span className="text-gray-900">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Tax (10%)</span>
                  <span className="text-gray-900">${taxAmount.toFixed(2)}</span>
                </div>
                <div className="border-t pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Total</span>
                    <span className="text-2xl font-bold text-gray-900">${total.toFixed(2)}</span>
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
                  {isSubmitting ? "Creating..." : "Create Invoice"}
                </Button>
                <Link href="/billing">
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

