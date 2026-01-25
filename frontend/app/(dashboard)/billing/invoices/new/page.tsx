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
import { inventoryApi } from "@/lib/api/inventory";
import { adminApi } from "@/lib/api/admin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, AlertCircle, Plus, Trash2, Search } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { AxiosError } from "axios";
import { computeGhanaTaxBreakdown } from "@/lib/utils/tax";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { BillingSubmitActions } from "@/components/billing/BillingSubmitActions";
import { Badge } from "@/components/ui/badge";

const lineItemSchema = z.object({
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
});

const invoiceSchema = z.object({
  customer: z.number().min(1, "Customer is required"),
  vehicle: z.number().optional(),
  work_order: z.number().optional(),
  invoice_date: z.string().min(1, "Invoice date is required"),
  due_date: z.string().min(1, "Due date is required"),
  payment_terms: z.enum(["due_on_receipt", "net_15", "net_30", "net_60", "custom"]),
  notes: z.string().optional(),
  sales_agent: z.number().optional(),
  discount_percentage: z.number().min(0).max(100).optional(),
  discount_type: z.enum(["none", "before_tax", "after_tax"]),
  discount_reason: z.string().optional(),
  line_items: z.array(lineItemSchema).min(1, "At least one line item is required"),
  status: z.string().optional(),
});

type InvoiceFormData = z.infer<typeof invoiceSchema>;
type LineItemFormData = z.infer<typeof lineItemSchema>;

const PAYMENT_TERMS = [
  { value: "due_on_receipt", label: "Due on Receipt", days: 0 },
  { value: "net_15", label: "Net 15", days: 15 },
  { value: "net_30", label: "Net 30", days: 30 },
  { value: "net_60", label: "Net 60", days: 60 },
  { value: "custom", label: "Custom", days: null },
];

export default function NewInvoicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workOrderId = searchParams.get("work_order");
  const invoiceType = searchParams.get("type"); // 'proforma' or null
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [dueDateManual, setDueDateManual] = useState(false);
  const { formatCurrency } = useCurrency();
  const [lineItems, setLineItems] = useState<Array<Omit<LineItemFormData, 'is_taxable'> & { is_taxable: boolean; part?: number; part_number?: string; notes?: string }>>([
    { item_type: "labor", description: "", quantity: 1, unit_price: 0, is_taxable: true },
  ]);
  const [partSearchTerm, setPartSearchTerm] = useState("");

  const { data: partsData } = useQuery({
    queryKey: ["parts", "search", partSearchTerm],
    queryFn: () => inventoryApi.list({ search: partSearchTerm, page: 1, is_active: true }),
    enabled: partSearchTerm.length > 0,
  });

  const { data: customersData } = useQuery({
    queryKey: ["customers", "list"],
    queryFn: () => customersApi.list({ page: 1 }),
  });

  const { data: salesAgents } = useQuery({
    queryKey: ["users", "staff"],
    queryFn: () => adminApi.users.staffList(),
  });

  const { data: workOrder } = useQuery({
    queryKey: ["workorder", workOrderId],
    queryFn: () => workordersApi.get(parseInt(workOrderId!)),
    enabled: !!workOrderId,
  });

  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(
    workOrder ? (typeof workOrder.customer === 'object' ? workOrder.customer.id : workOrder.customer) : null
  );

  const { data: vehiclesData } = useQuery({
    queryKey: ["vehicles", "customer", selectedCustomer],
    queryFn: () => vehiclesApi.list({ owner: selectedCustomer || undefined }),
    enabled: !!selectedCustomer,
  });

  const { data: taxConfig } = useQuery({
    queryKey: ["tax", "config"],
    queryFn: () => billingApi.taxes.config(),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
    setError,
  } = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      invoice_date: new Date().toISOString().split("T")[0],
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      payment_terms: "net_30",
      customer: workOrder ? (typeof workOrder.customer === 'object' ? workOrder.customer.id : workOrder.customer) : undefined,
      vehicle: workOrder ? (typeof workOrder.vehicle === 'object' ? workOrder.vehicle.id : workOrder.vehicle) : undefined,
      work_order: workOrderId ? parseInt(workOrderId) : undefined,
      discount_percentage: 0,
      discount_reason: "",
      discount_type: "before_tax",
      line_items: lineItems.map(item => ({ ...item, is_taxable: item.is_taxable ?? true })),
      status: invoiceType === 'proforma' ? 'proforma' : 'draft',
    },
  });

  const customer = watch("customer");
  const invoiceDate = watch("invoice_date");
  const paymentTerms = watch("payment_terms");
  const discountType = watch("discount_type");
  const discountPercentage = watch("discount_percentage");

  // Auto-calculate due date based on payment terms
  useEffect(() => {
    if (!dueDateManual && invoiceDate && paymentTerms) {
      const term = PAYMENT_TERMS.find(t => t.value === paymentTerms);
      if (term && term.days !== null) {
        const date = new Date(invoiceDate);
        date.setDate(date.getDate() + term.days);
        setValue("due_date", date.toISOString().split("T")[0]);
      }
    }
  }, [invoiceDate, paymentTerms, dueDateManual, setValue]);

  // Update selected customer when form value changes
  if (customer && customer !== selectedCustomer) {
    setSelectedCustomer(customer);
    setValue("vehicle", undefined);
  }

  const addLineItem = (type: "labor" | "part" = "labor", partData?: any) => {
    if (type === "part" && partData) {
      setLineItems([
        ...lineItems,
        {
          item_type: "part",
          description: partData.name,
          quantity: 1,
          unit_price: parseFloat(partData.selling_price || partData.cost_price || "0"),
          part: partData.id,
          part_number: partData.part_number,
          is_taxable: true,
        },
      ]);
    } else {
      setLineItems([...lineItems, { item_type: "labor", description: "", quantity: 1, unit_price: 0, is_taxable: true }]);
    }
  };

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const updateLineItem = (index: number, field: string, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value } as any;
    setLineItems(updated);
    setValue("line_items", updated as any, { shouldValidate: false });
  };

  const calculateLineItemTotal = (item: LineItemFormData): number => {
    if (item.item_type === "labor" && item.labor_hours && item.labor_rate) {
      return item.labor_hours * item.labor_rate;
    }
    return (item.quantity || 0) * (item.unit_price || 0);
  };

  const subtotal = lineItems.reduce((sum, item) => sum + calculateLineItemTotal(item), 0);

  // Tax and Discount Calculation using shared utility
  const taxableSubtotalBeforeDiscount = lineItems.reduce(
    (sum, item) => sum + (item.is_taxable !== false ? calculateLineItemTotal(item) : 0),
    0
  );

  let discountAmount = 0;
  if (discountPercentage && discountPercentage > 0) {
    if (discountType === 'before_tax' || discountType === 'after_tax') {
      discountAmount = (subtotal * discountPercentage) / 100;
    }
  }

  const taxSummary = computeGhanaTaxBreakdown({
    taxableTotal: taxableSubtotalBeforeDiscount,
    subtotal,
    discountAmount: discountType === 'before_tax' ? discountAmount : 0,
    config: taxConfig,
  });

  let total = subtotal + taxSummary.totalTax;
  if (discountType === 'before_tax') {
    total = (subtotal - discountAmount) + taxSummary.totalTax;
  } else if (discountType === 'after_tax') {
    total = (subtotal + taxSummary.totalTax) - discountAmount;
  }

  const createMutation = useMutation({
    mutationFn: async (data: InvoiceFormData) => {
      const payload = {
        customer: data.customer,
        vehicle: data.vehicle,
        work_order: data.work_order,
        invoice_date: data.invoice_date,
        due_date: data.due_date,
        terms: PAYMENT_TERMS.find(t => t.value === data.payment_terms)?.label || data.payment_terms,
        notes: data.notes,
        status: data.status,
        sales_agent: data.sales_agent,
        discount_percentage: data.discount_type !== 'none' ? data.discount_percentage?.toString() : '0',
        discount_reason: data.discount_reason,
        line_items: data.line_items.map((item, idx) => ({
          item_type: item.item_type,
          description: item.description,
          quantity: item.quantity || 0,
          unit_price: (item.unit_price || 0).toString(),
          labor_hours: item.labor_hours,
          labor_rate: item.labor_rate?.toString(),
          is_taxable: item.is_taxable,
          part: item.part,
          part_number: item.part_number,
          notes: item.notes,
          order: idx,
        })),
      };
      return billingApi.invoices.create(payload);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (error: AxiosError<any>) => {
      const message = error.response?.data?.detail || error.response?.data?.message || "Failed to create invoice";
      setServerError(message);
      if (error.response?.data) {
        Object.entries(error.response.data).forEach(([field, errors]) => {
          if (Array.isArray(errors) && field !== 'detail' && field !== 'message') {
            setError(field as any, { message: errors[0] });
          }
        });
      }
    },
  });

  const onSubmit = (data: InvoiceFormData, status?: string, redirectMode: 'list' | 'payment' = 'list') => {
    setServerError(null);
    createMutation.mutateAsync({ ...data, status })
      .then((res) => {
        if (redirectMode === 'payment') {
          router.push(`/billing/invoices/${res.id}?action=record_payment`);
        } else {
          router.push("/billing");
        }
      })
      .catch((err) => {
        // Error already handled by onError
      });
  };

  const isProforma = invoiceType === 'proforma';
  const pageTitle = isProforma ? 'Create Proforma Invoice' : 'Create Invoice';

  return (
    <div className="space-y-6 pb-24">
      {/* Header - No Breadcrumbs */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">{pageTitle}</h1>
      </div>

      {serverError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">Error creating invoice</p>
                <p className="text-sm text-red-700 mt-1">{serverError}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <form onSubmit={(e) => e.preventDefault()} className="space-y-6">

        {/* Basic Information - Full Width */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>Enter invoice details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Customer *</label>
                <Select
                  value={watch("customer")?.toString() || ""}
                  onValueChange={(val) => setValue("customer", parseInt(val), { shouldValidate: true })}
                >
                  <SelectTrigger className={errors.customer ? "border-red-600" : ""}>
                    <SelectValue placeholder="Select customer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {customersData?.results.map((c: any) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.full_name || c.company_name || c.email || `Customer #${c.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.customer && <p className="text-sm text-red-600">{errors.customer.message}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Vehicle</label>
                <Select
                  value={watch("vehicle")?.toString() || ""}
                  onValueChange={(val) => setValue("vehicle", parseInt(val), { shouldValidate: true })}
                  disabled={!selectedCustomer}
                >
                  <SelectTrigger disabled={!selectedCustomer}>
                    <SelectValue placeholder="Select vehicle..." />
                  </SelectTrigger>
                  <SelectContent>
                    {vehiclesData?.results.map((v: any) => (
                      <SelectItem key={v.id} value={v.id.toString()}>
                        {v.year} {v.make} {v.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Sales Agent</label>
                <Select
                  value={watch("sales_agent")?.toString() || ""}
                  onValueChange={(val) => setValue("sales_agent", parseInt(val), { shouldValidate: true })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {salesAgents?.map((agent: any) => (
                      <SelectItem key={agent.id} value={agent.id.toString()}>
                        {agent.first_name} {agent.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Invoice Date *</label>
                <Input type="date" {...register("invoice_date")} />
                {errors.invoice_date && <p className="text-sm text-red-600">{errors.invoice_date.message}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Payment Terms *</label>
                <Select
                  value={watch("payment_terms") || ""}
                  onValueChange={(val) => setValue("payment_terms", val as any, { shouldValidate: true })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select terms" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TERMS.map(term => (
                      <SelectItem key={term.value} value={term.value}>{term.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                {!dueDateManual && (
                  <p className="text-xs text-muted-foreground">Auto-calculated</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Notes</label>
              <Textarea {...register("notes")} placeholder="Additional notes..." rows={2} />
            </div>

            {/* Discount Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t pt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Discount Type</label>
                <Select
                  value={watch("discount_type") || ""}
                  onValueChange={(val: any) => setValue("discount_type", val, { shouldValidate: true })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Discount Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Discount</SelectItem>
                    <SelectItem value="before_tax">Before Tax</SelectItem>
                    <SelectItem value="after_tax">After Tax</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {discountType !== 'none' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Discount (%)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    {...register("discount_percentage", { valueAsNumber: true })}
                  />
                </div>
              )}
              {discountType !== 'none' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Reason</label>
                  <Input
                    {...register("discount_reason")}
                    placeholder="Discount reason..."
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Line Items - Full Width */}
        <div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Line Items</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Search Bar & Add */}
              <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Search to add item..."
                    className="pl-9"
                    value={partSearchTerm}
                    onChange={(e) => setPartSearchTerm(e.target.value)}
                  />
                  {partSearchTerm.length > 1 && partsData?.results && partsData.results.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                      {partsData.results.map((part: any) => (
                        <div
                          key={part.id}
                          className="px-4 py-2 hover:bg-gray-50 cursor-pointer text-sm"
                          onClick={() => {
                            addLineItem("part", part);
                            setPartSearchTerm("");
                          }}
                        >
                          <div className="font-medium">{part.part_number} - {part.name}</div>
                          <div className="text-xs text-gray-500">Stock: {part.quantity_on_hand || part.quantity_in_stock} | {formatCurrency(part.selling_price || part.cost_price || "0")}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <Link href="/inventory/new" target="_blank">
                  <Button type="button" variant="outline" size="icon" title="Add new part to inventory">
                    <Plus className="w-4 h-4" />
                  </Button>
                </Link>
                <Button
                  type="button"
                  onClick={() => addLineItem("labor")}
                  variant="default"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Item
                </Button>
              </div>

              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow className="h-8">
                      <TableHead className="w-[120px] py-1 px-2 h-8">Type</TableHead>
                      <TableHead className="min-w-[200px] py-1 px-2 h-8">Description</TableHead>
                      <TableHead className="w-[100px] py-1 px-2 h-8">Qty</TableHead>
                      <TableHead className="w-[120px] py-1 px-2 h-8">Rate</TableHead>
                      <TableHead className="w-[80px] text-center py-1 px-2 h-8">Tax</TableHead>
                      <TableHead className="w-[120px] text-right py-1 px-2 h-8">Total</TableHead>
                      <TableHead className="w-[50px] py-1 px-2 h-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineItems.map((item, index) => (
                      <TableRow key={index} className="h-fit">
                        <TableCell className="py-1 px-2">
                          {item.item_type === 'part' && item.part_number ? (
                            <div className="flex flex-col">
                              <span className="font-medium text-xs">{item.part_number}</span>
                              <Badge variant="outline" className="w-fit text-[10px] px-1 py-0 h-3">Part</Badge>
                            </div>
                          ) : (
                            <Select
                              value={item.item_type}
                              onValueChange={(val) => updateLineItem(index, "item_type", val)}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="labor">Labor</SelectItem>
                                <SelectItem value="part">Part</SelectItem>
                                <SelectItem value="sublet">Sublet</SelectItem>
                                <SelectItem value="fee">Fee</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>

                        <TableCell className="py-1 px-2">
                          <Input
                            value={item.description}
                            onChange={(e) => updateLineItem(index, "description", e.target.value)}
                            className="h-8 text-sm"
                          />
                        </TableCell>

                        <TableCell className="py-1 px-2">
                          <Input
                            type="number"
                            value={item.quantity || ""}
                            onChange={(e) => updateLineItem(index, "quantity", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            step="0.01"
                            min="0"
                            className="h-8 text-sm"
                          />
                        </TableCell>

                        <TableCell className="py-1 px-2">
                          <Input
                            type="number"
                            value={item.unit_price || ""}
                            onChange={(e) => updateLineItem(index, "unit_price", parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                            className="h-8 text-sm"
                          />
                        </TableCell>

                        <TableCell className="text-center py-1 px-2">
                          <Checkbox
                            checked={item.is_taxable}
                            onCheckedChange={(checked) => updateLineItem(index, "is_taxable", !!checked)}
                          />
                        </TableCell>

                        <TableCell className="text-right font-medium text-sm py-1 px-2">
                          {formatCurrency(calculateLineItemTotal(item))}
                        </TableCell>

                        <TableCell className="py-1 px-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-500 hover:bg-red-50"
                            onClick={() => removeLineItem(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {!lineItems.length && (
                  <div className="p-8 text-center text-gray-500 text-sm bg-gray-50">
                    No items added. Search or click "Add Item" to start.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bottom Right Summary Section */}
        <div className="flex justify-end">
          <div className="w-1/3 min-w-[300px] space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Sub Total :</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>

            {discountType !== 'none' && (
              <div className="flex justify-between text-sm text-red-600">
                <span>Discount ({discountPercentage}%)</span>
                <span>- {formatCurrency(discountAmount)}</span>
              </div>
            )}

            {/* Tax Lines */}
            {taxSummary.vatAmount > 0 && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>VAT (15.00%)</span>
                <span>{formatCurrency(taxSummary.vatAmount)}</span>
              </div>
            )}
            {taxSummary.getfundAmount > 0 && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>GETFund (2.50%)</span>
                <span>{formatCurrency(taxSummary.getfundAmount)}</span>
              </div>
            )}
            {taxSummary.nhilAmount > 0 && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>NHIL (2.50%)</span>
                <span>{formatCurrency(taxSummary.nhilAmount)}</span>
              </div>
            )}
            {taxSummary.hrlAmount > 0 && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>COVID-19 HRL (1.00%)</span>
                <span>{formatCurrency(taxSummary.hrlAmount)}</span>
              </div>
            )}

            <div className="flex justify-between text-lg font-bold border-t border-gray-300 pt-2 mt-2">
              <span>Total :</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>
        </div>

      </form>

      {/* Sticky Footer */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 z-10 flex justify-end items-center gap-3 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] lg:pl-64">
        <Link href="/billing">
          <Button variant="outline">Cancel</Button>
        </Link>
        <div className="w-auto">
          <BillingSubmitActions
            isSubmitting={isSubmitting}
            resourceType="invoice"
            mode={isProforma ? "create" : "create"}
            onSend={handleSubmit((data) => onSubmit(data, "sent"))}
            onSave={handleSubmit((data) => onSubmit(data, "draft"))}
            onRecordPayment={handleSubmit((data) => onSubmit(data, "sent", "payment"))}
          />
        </div>
      </div >
    </div>
  );
}
