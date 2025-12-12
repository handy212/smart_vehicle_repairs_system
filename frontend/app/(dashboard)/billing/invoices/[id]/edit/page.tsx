"use client";

import { useRouter, useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { inventoryApi } from "@/lib/api/inventory";
import { customersApi } from "@/lib/api/customers";
import { vehiclesApi } from "@/lib/api/vehicles";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, AlertCircle, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { AxiosError } from "axios";
import { calculateGhanaTax } from "@/lib/utils/tax";

const invoiceUpdateSchema = z.object({
  customer: z.number().min(1, "Customer is required"),
  vehicle: z.number().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  customer_notes: z.string().optional(),
  terms: z.string().optional(),
  invoice_date: z.string().min(1, "Invoice date is required"),
  due_date: z.string().min(1, "Due date is required"),
  discount_percentage: z.number().min(0).max(100).optional(),
  discount_reason: z.string().optional(),
  line_items: z.array(z.object({
    item_type: z.enum(["labor", "part", "fee", "discount", "sublet", "other"]),
    description: z.string().min(1, "Description is required"),
    quantity: z.number().min(0).optional(),
    unit_price: z.number().min(0).optional(),
    labor_hours: z.number().min(0).optional(),
    labor_rate: z.number().min(0).optional(),
    is_taxable: z.boolean(),
    part: z.number().optional(),
    part_number: z.string().optional(),
    notes: z.string().optional(),
  })).min(1, "At least one line item is required"),
});

type LineItemFormData = {
  item_type: "labor" | "part" | "fee" | "discount" | "sublet" | "other";
  description: string;
  notes?: string;
  quantity?: number;
  unit_price?: number;
  total?: number;
  labor_hours?: number;
  labor_rate?: number;
  part?: number;
  part_number?: string;
  part_name?: string;
  is_taxable?: boolean;
  order?: number;
};

type InvoiceUpdateFormData = z.infer<typeof invoiceUpdateSchema>;

const PAYMENT_TERMS = [
  { value: "due_on_receipt", label: "Due on Receipt", days: 0 },
  { value: "net_15", label: "Net 15", days: 15 },
  { value: "net_30", label: "Net 30", days: 30 },
  { value: "net_60", label: "Net 60", days: 60 },
  { value: "custom", label: "Custom", days: null },
];

export default function EditInvoicePage() {
  const router = useRouter();
  const params = useParams();
  const invoiceId = parseInt(params.id as string);
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<LineItemFormData[]>([]);
  const [dueDateManual, setDueDateManual] = useState(true); // Start as manual since we're editing
  const [selectedPaymentTerm, setSelectedPaymentTerm] = useState<string>("custom");
  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(null);

  const { data: invoice, isLoading } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => billingApi.invoices.get(invoiceId),
  });

  const { data: customersData } = useQuery({
    queryKey: ["customers", "list"],
    queryFn: () => customersApi.list({ page: 1 }),
  });

  const { data: vehiclesData } = useQuery({
    queryKey: ["vehicles", "customer", selectedCustomer],
    queryFn: () => vehiclesApi.list({ owner: selectedCustomer || undefined }),
    enabled: !!selectedCustomer,
  });

  const { data: partsData, isLoading: partsLoading, isError: partsError } = useQuery({
    queryKey: ["parts", "list"],
    queryFn: () => inventoryApi.list({ page: 1, is_active: true }),
  });

  const { data: taxConfig } = useQuery({
    queryKey: ["tax", "config"],
    queryFn: () => billingApi.taxes.config(),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    reset,
    watch,
    setValue,
  } = useForm<InvoiceUpdateFormData>({
    resolver: zodResolver(invoiceUpdateSchema),
  });

  const invoiceDate = watch("invoice_date");
  const customer = watch("customer");

  // Update selected customer when form value changes
  useEffect(() => {
    if (customer && customer !== selectedCustomer) {
      setSelectedCustomer(customer);
      setValue("vehicle", undefined);
    }
  }, [customer, selectedCustomer, setValue]);

  // Auto-calculate due date when payment term changes (unless manual override)
  useEffect(() => {
    if (!dueDateManual && invoiceDate && selectedPaymentTerm !== "custom") {
      const term = PAYMENT_TERMS.find(t => t.value === selectedPaymentTerm);
      if (term && term.days !== null) {
        const date = new Date(invoiceDate);
        date.setDate(date.getDate() + term.days);
        setValue("due_date", date.toISOString().split("T")[0]);
      }
    }
  }, [invoiceDate, selectedPaymentTerm, dueDateManual, setValue]);

  // Populate form when invoice data loads
  useEffect(() => {
    if (invoice && !isLoading) {
      const customerId = typeof invoice.customer === 'object' ? invoice.customer.id : invoice.customer;
      const vehicleId = typeof invoice.vehicle === 'object' && invoice.vehicle ? invoice.vehicle.id : invoice.vehicle;
      
      setSelectedCustomer(customerId);
      
      reset({
        customer: customerId,
        vehicle: vehicleId,
        description: (invoice as any).description || "",
        notes: invoice.notes || "",
        customer_notes: (invoice as any).customer_notes || "",
        terms: (invoice as any).terms || "",
        invoice_date: invoice.invoice_date ? invoice.invoice_date.split("T")[0] : "",
        due_date: invoice.due_date ? invoice.due_date.split("T")[0] : "",
        discount_percentage: invoice.discount_percentage ? parseFloat(invoice.discount_percentage) : undefined,
        discount_reason: (invoice as any).discount_reason || "",
        line_items: (invoice.line_items || []).map((item: any) => ({
          item_type: item.item_type || "other",
          description: item.description || "",
          notes: item.notes || "",
          quantity: item.quantity ? parseFloat(item.quantity) : 1,
          unit_price: item.unit_price ? parseFloat(item.unit_price) : 0,
          labor_hours: item.labor_hours ? parseFloat(item.labor_hours) : undefined,
          labor_rate: item.labor_rate ? parseFloat(item.labor_rate) : undefined,
          part: item.part || undefined,
          part_number: item.part_number || undefined,
          is_taxable: item.is_taxable ?? true,
        })),
      });
      
      if (invoice.line_items) {
        setLineItems(
          invoice.line_items.map((item: any) => ({
            item_type: item.item_type || "other",
            description: item.description || "",
            notes: item.notes || "",
            quantity: item.quantity ? parseFloat(item.quantity) : 1,
            unit_price: item.unit_price ? parseFloat(item.unit_price) : 0,
            total: item.total ? parseFloat(item.total) : 0,
            labor_hours: item.labor_hours ? parseFloat(item.labor_hours) : undefined,
            labor_rate: item.labor_rate ? parseFloat(item.labor_rate) : undefined,
            part: item.part || undefined,
            part_number: item.part_number || undefined,
            part_name: item.part_name || undefined,
            is_taxable: item.is_taxable ?? true,
          }))
        );
      }

      // Detect payment term from invoice
      const terms = (invoice as any).terms;
      if (terms) {
        const detected = PAYMENT_TERMS.find(t => 
          terms.toLowerCase().includes(t.label.toLowerCase())
        );
        if (detected) {
          setSelectedPaymentTerm(detected.value);
          setValue("terms", detected.label);
        }
      }
    }
  }, [invoice, isLoading, reset, setValue]);

  const addLineItem = () => {
    const newItem = { item_type: "labor" as const, description: "", quantity: 1, unit_price: 0, is_taxable: true };
    setLineItems([...lineItems, newItem]);
    setValue("line_items", [...lineItems, newItem] as any);
  };

  const removeLineItem = (index: number) => {
    const updated = lineItems.filter((_, i) => i !== index);
    setLineItems(updated);
    setValue("line_items", updated as any);
  };

  const updateLineItem = (index: number, field: string, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value } as any;
    setLineItems(updated);
    setValue("line_items", updated as any, { shouldValidate: false });
  };

  const updateLineItemFields = (index: number, updates: Record<string, any>) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], ...updates } as any;
    setLineItems(updated);
    setValue("line_items", updated as any, { shouldValidate: false });
  };

  const calculateLineItemTotal = (item: LineItemFormData): number => {
    if (item.item_type === "labor" && item.labor_hours && item.labor_rate) {
      return item.labor_hours * item.labor_rate;
    }
    return (item.quantity || 0) * (item.unit_price || 0);
  };

  const calculateSubtotal = (): number => {
    return lineItems.reduce((sum, item) => sum + calculateLineItemTotal(item), 0);
  };

  const calculateDiscount = (): number => {
    const discountPercentage = watch("discount_percentage") || 0;
    return (calculateSubtotal() * discountPercentage) / 100;
  };

  const calculateSubtotalAfterDiscount = (): number => {
    return calculateSubtotal() - calculateDiscount();
  };

  const calculateTaxableSubtotal = (): number => {
    const subtotal = lineItems
      .filter(item => item.is_taxable)
      .reduce((sum, item) => sum + calculateLineItemTotal(item), 0);
    
    // Apply discount proportionally to taxable items
    const discountPercentage = watch("discount_percentage") || 0;
    const taxableAfterDiscount = subtotal * (1 - discountPercentage / 100);
    return taxableAfterDiscount;
  };

  const calculateTax = (): number => {
    const taxableAmount = calculateTaxableSubtotal();
    const breakdown = calculateGhanaTax(taxableAmount, taxConfig);
    return breakdown.total;
  };

  const calculateTotal = (): number => {
    return calculateSubtotalAfterDiscount() + calculateTax();
  };

  const updateMutation = useMutation({
    mutationFn: async (data: InvoiceUpdateFormData) => {
      const payload = {
        customer: data.customer,
        vehicle: data.vehicle,
        description: data.description,
        notes: data.notes,
        customer_notes: data.customer_notes,
        terms: data.terms,
        invoice_date: data.invoice_date,
        due_date: data.due_date,
        discount_percentage: data.discount_percentage?.toString(),
        discount_reason: data.discount_reason,
        line_items: lineItems.map((item, idx) => ({
          item_type: item.item_type,
          description: item.description,
          quantity: item.quantity || 0,
          unit_price: (item.unit_price || 0).toString(),
          labor_hours: item.labor_hours,
          labor_rate: item.labor_rate?.toString(),
          is_taxable: item.is_taxable ?? true,
          part: item.part,
          part_number: item.part_number,
          notes: item.notes,
          order: idx,
        })),
      };
      return billingApi.invoices.update(invoiceId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      router.push(`/billing/invoices/${invoiceId}`);
    },
    onError: (error: AxiosError<any>) => {
      if (error.response?.data) {
        const errorData = error.response.data;
        if (typeof errorData === "object") {
          Object.keys(errorData).forEach((key) => {
            if (key in invoiceUpdateSchema.shape) {
              setError(key as any, { type: "server", message: errorData[key] });
            }
          });
          setServerError(errorData.detail || "An error occurred while updating the invoice");
        } else {
          setServerError("An unexpected error occurred");
        }
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
          <Button variant="secondary">
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

  const taxBreakdown = calculateGhanaTax(calculateTaxableSubtotal(), taxConfig);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/billing/invoices/${invoiceId}`}>
          <Button variant="secondary" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Edit Invoice</h1>
          <p className="text-muted-foreground">Invoice #{invoice.invoice_number}</p>
        </div>
      </div>

      {serverError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">Error updating invoice</p>
                <p className="text-sm text-red-700 mt-1">{serverError}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Invoice Information</CardTitle>
                <CardDescription>Update invoice details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">Invoice Number</p>
                  <p className="text-sm font-mono font-medium">{invoice.invoice_number}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Customer *</label>
                    <Select
                      {...register("customer", { valueAsNumber: true })}
                      onChange={(e) => setValue("customer", parseInt(e.target.value), { shouldValidate: true })}
                      value={watch("customer")?.toString() || ""}
                    >
                      <option value="">Select customer...</option>
                      {customersData?.results.map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.user?.first_name && c.user?.last_name
                            ? `${c.user.first_name} ${c.user.last_name}`
                            : c.company_name || c.user?.username || `Customer #${c.id}`}
                        </option>
                      ))}
                    </Select>
                    {errors.customer && <p className="text-sm text-red-600">{errors.customer.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Vehicle</label>
                    <Select
                      {...register("vehicle", { valueAsNumber: true })}
                      disabled={!selectedCustomer}
                    >
                      <option value="">Select vehicle...</option>
                      {vehiclesData?.results.map((v: any) => (
                        <option key={v.id} value={v.id}>
                          {v.year} {v.make} {v.model}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Invoice Date *</label>
                    <Input type="date" {...register("invoice_date")} />
                    {errors.invoice_date && <p className="text-sm text-red-600">{errors.invoice_date.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Payment Terms *</label>
                    <Select
                      value={selectedPaymentTerm}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSelectedPaymentTerm(value);
                        const term = PAYMENT_TERMS.find(t => t.value === value);
                        if (term) {
                          setValue("terms", term.label);
                          setDueDateManual(false); // Enable auto-calculation
                        }
                      }}
                    >
                      {PAYMENT_TERMS.map(term => (
                        <option key={term.value} value={term.value}>{term.label}</option>
                      ))}
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Due Date *</label>
                  <Input
                    type="date"
                    {...register("due_date")}
                    onChange={(e) => {
                      setValue("due_date", e.target.value);
                      setDueDateManual(true);
                    }}
                  />
                  {errors.due_date && <p className="text-sm text-red-600">{errors.due_date.message}</p>}
                  {!dueDateManual && (
                    <p className="text-xs text-muted-foreground">Auto-calculated from payment terms</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Description</label>
                  <Textarea {...register("description")} placeholder="Invoice description..." rows={3} />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Internal Notes</label>
                  <Textarea {...register("notes")} placeholder="Internal notes..." rows={2} />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Customer Notes</label>
                  <Textarea {...register("customer_notes")} placeholder="Notes visible to customer..." rows={2} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Line Items</CardTitle>
                    <CardDescription>Edit services, parts, and fees</CardDescription>
                  </div>
                  <Button type="button" onClick={addLineItem} size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Item
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {lineItems.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No line items found</p>
                    <Button type="button" onClick={addLineItem}variant="secondary" size="sm" className="mt-2">
                      Add First Item
                    </Button>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[120px]">Type</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="w-[100px]">Qty</TableHead>
                          <TableHead className="w-[120px]">Rate</TableHead>
                          <TableHead className="w-[80px]">Tax</TableHead>
                          <TableHead className="w-[120px] text-right">Total</TableHead>
                          <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lineItems.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              <Select
                                value={item.item_type}
                                onChange={(e) => updateLineItem(index, "item_type", e.target.value)}
                                className="text-sm"
                              >
                                <option value="labor">Labor</option>
                                <option value="part">Part</option>
                                <option value="sublet">Sublet</option>
                                <option value="fee">Fee</option>
                                <option value="other">Other</option>
                              </Select>
                            </TableCell>

                            <TableCell>
                              {item.item_type === "part" ? (
                                <Select
                                  value={item.part?.toString() || ""}
                                  onChange={(e) => {
                                    const partId = parseInt(e.target.value);
                                    const selectedPart = partsData?.results.find((p: any) => p.id === partId);
                                    if (selectedPart) {
                                      updateLineItemFields(index, {
                                        part: partId,
                                        part_number: selectedPart.part_number,
                                        description: selectedPart.name,
                                        unit_price: parseFloat(selectedPart.cost_price || '0'),
                                        quantity: 1,
                                      });
                                    }
                                  }}
                                  disabled={partsLoading || partsError}
                                  className="text-sm"
                                >
                                  <option value="">
                                    {partsLoading ? "Loading parts..." : partsError ? "Unable to load parts" : item.description || "Select part..."}
                                  </option>
                                  {partsData?.results.map((part: any) => (
                                    <option key={part.id} value={part.id}>
                                      {part.name} ({part.part_number})
                                    </option>
                                  ))}
                                </Select>
                              ) : (
                                <Input
                                  value={item.description}
                                  onChange={(e) => updateLineItem(index, "description", e.target.value)}
                                  placeholder="Description..."
                                  className="text-sm"
                                />
                              )}
                            </TableCell>

                            <TableCell>
                              <Input
                                type="number"
                                value={item.quantity || ""}
                                onChange={(e) => updateLineItem(index, "quantity", parseFloat(e.target.value) || 0)}
                                placeholder="0"
                                step="0.01"
                                min="0"
                                className="text-sm"
                              />
                            </TableCell>

                            <TableCell>
                              <Input
                                type="number"
                                value={item.unit_price || ""}
                                onChange={(e) => updateLineItem(index, "unit_price", parseFloat(e.target.value) || 0)}
                                placeholder="0.00"
                                step="0.01"
                                min="0"
                                className="text-sm"
                              />
                            </TableCell>

                            <TableCell>
                              <div className="flex items-center justify-center">
                                <Checkbox
                                  checked={item.is_taxable}
                                  onCheckedChange={(checked) => updateLineItem(index, "is_taxable", checked)}
                                />
                              </div>
                            </TableCell>

                            <TableCell className="text-right font-medium">
                              ${calculateLineItemTotal(item).toFixed(2)}
                            </TableCell>

                            <TableCell>
                              {lineItems.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeLineItem(index)}
                                >
                                  <Trash2 className="h-4 w-4 text-red-600" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            
          </div>

          <div className="lg:col-span-1 space-y-6">
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle>Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">${calculateSubtotal().toFixed(2)}</span>
                </div>

                {calculateDiscount() > 0 && (
                  <div className="flex justify-between text-sm text-red-600">
                    <span>Discount ({watch("discount_percentage")}%)</span>
                    <span>-${calculateDiscount().toFixed(2)}</span>
                  </div>
                )}

                {calculateDiscount() > 0 && (
                  <div className="flex justify-between text-sm font-medium border-t pt-2">
                    <span className="text-muted-foreground">Subtotal after Discount</span>
                    <span>${calculateSubtotalAfterDiscount().toFixed(2)}</span>
                  </div>
                )}

                <div className="border-t pt-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Tax Breakdown</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">NHIL (2.5%)</span>
                    <span>${taxBreakdown.nhil.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">GETFund (2.5%)</span>
                    <span>${taxBreakdown.getfund.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">COVID-19 HRL (1%)</span>
                    <span>${taxBreakdown.hrl.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">VAT (15%)</span>
                    <span>${taxBreakdown.vat.toFixed(2)}</span>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <div className="flex justify-between text-sm font-medium">
                    <span className="text-muted-foreground">Total Tax</span>
                    <span>${taxBreakdown.total.toFixed(2)}</span>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span>${calculateTotal().toFixed(2)}</span>
                  </div>
                </div>

                <div className="pt-4 space-y-2">
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : "Save Changes"}
                  </Button>
                  <Link href={`/billing/invoices/${invoiceId}`}>
                    <Button type="button"variant="secondary" className="w-full">
                      Cancel
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Discounts</CardTitle>
                <CardDescription>Apply discounts to this invoice</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Discount Percentage (%)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    {...register("discount_percentage", { valueAsNumber: true })}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Discount Reason</label>
                  <Input {...register("discount_reason")} placeholder="e.g., Customer loyalty discount" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}
