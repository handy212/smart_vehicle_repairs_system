"use client";

/* eslint-disable @typescript-eslint/no-explicit-any, react/no-unescaped-entities */

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { inventoryApi } from "@/lib/api/inventory";
import { billingLineTypeForPart, formatPartPickerMeta } from "@/lib/inventory/part-catalog";
import { adminApi } from "@/lib/api/admin";
import { workordersApi } from "@/lib/api/workorders";
import { workOrderTasksApi } from "@/lib/api/workorder-tasks";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { ArrowLeft, AlertCircle, Plus, Trash2, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AxiosError } from "axios";
import { getUserFacingError } from "@/lib/api/errors";
import { computeGhanaTaxBreakdown } from "@/lib/utils/tax";
import { BillingSubmitActions } from "@/components/billing/BillingSubmitActions";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CustomerSelector } from "@/components/customers/CustomerSelector";
import { VehicleSelector } from "@/components/vehicles/VehicleSelector";

const requiredNumber = (message: string) => z.coerce.number({ message }).min(1, message);
const optionalNumber = () => z.coerce.number().min(0).optional();

const lineItemSchema = z.object({
  item_type: z.enum(["labor", "part", "fee", "discount", "sublet", "other"]),
  description: z.string().min(1, "Description is required"),
  quantity: optionalNumber(),
  unit_price: optionalNumber(),
  discount_percentage: optionalNumber(),
  labor_hours: optionalNumber(),
  labor_rate: optionalNumber(),
  is_taxable: z.boolean(),
  part: optionalNumber(),
  part_number: z.string().optional(),
  part_name: z.string().optional(),
  notes: z.string().optional(),
});

const estimateSchema = z.object({
  customer: requiredNumber("Customer is required"),
  vehicle: optionalNumber(),
  work_order: optionalNumber(),
  reference_number: z.string().optional(),
  sales_agent: optionalNumber(),
  status: z.enum(["draft", "sent", "expired", "declined", "approved"]),
  title: z.string().optional(),
  description: z.string().optional(), // Terms & Conditions
  notes: z.string().optional(), // Internal Notes
  customer_notes: z.string().optional(), // Customer Notes
  estimate_date: z.string().min(1, "Estimate date is required"),
  valid_until: z.string().min(1, "Valid until date is required"),
  discount_percentage: optionalNumber(),
  discount_type: z.enum(["none", "before_tax", "after_tax"]),
  discount_reason: z.string().optional(),
  shop_supplies_fee: optionalNumber(),
  environmental_fee: optionalNumber(),
  line_items: z.array(lineItemSchema).min(1, "At least one line item is required"),
});

type LineItemFormData = z.infer<typeof lineItemSchema>;
type EstimateFormData = z.infer<typeof estimateSchema>;
type EstimateFormInput = z.input<typeof estimateSchema>;
type ExtendedLineItem = Omit<LineItemFormData, 'is_taxable'> & {
  is_taxable: boolean;
  part?: number;
  part_number?: string;
  part_name?: string;
  part_id?: number;// legacy support if needed
};

const fieldLabels: Record<string, string> = {
  customer: "Customer",
  vehicle: "Vehicle",
  work_order: "Work order",
  sales_agent: "Sales agent",
  discount_percentage: "Discount percentage",
  line_items: "Line items",
  quantity: "Quantity",
  unit_price: "Rate",
  labor_hours: "Labor hours",
  labor_rate: "Labor rate",
  part: "Part",
  description: "Description",
  discount_type: "Discount type",
  discount_reason: "Discount reason",
};

const discountTypeOptions = ["none", "before_tax", "after_tax"] as const;
type DiscountType = (typeof discountTypeOptions)[number];

const normalizeDiscountType = (value: unknown): DiscountType => (
  typeof value === "string" && (discountTypeOptions as readonly string[]).includes(value)
    ? (value as DiscountType)
    : "none"
);

const describeFieldPath = (path: string) => {
  const parts = path.split(".").filter(Boolean);
  const lineItemIndex = parts.findIndex((part) => part === "line_items");
  if (lineItemIndex >= 0) {
    const index = Number(parts[lineItemIndex + 1]);
    const field = parts[lineItemIndex + 2];
    return `Line item ${Number.isFinite(index) ? index + 1 : ""}${field ? ` ${fieldLabels[field] || field}` : ""}`.trim();
  }
  const field = parts[parts.length - 1];
  return fieldLabels[field] || field || "Form";
};

const getFirstFormError = (errors: Record<string, any>, path = ""): string => {
  for (const [key, value] of Object.entries(errors)) {
    if (!value) continue;
    const nextPath = path ? `${path}.${key}` : key;
    if (typeof value.message === "string") return `${describeFieldPath(nextPath)}: ${value.message}`;
    if (Array.isArray(value)) {
      const nestedIndex = value.findIndex(Boolean);
      if (nestedIndex >= 0) return getFirstFormError(value[nestedIndex], `${nextPath}.${nestedIndex}`);
    }
    if (typeof value === "object") {
      const nested = getFirstFormError(value, nextPath);
      if (nested) return nested;
    }
  }
  return "Please complete the required fields before saving.";
};

export default function NewEstimatePage() {
  const { formatCurrency } = useCurrency();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [partSearchTerm, setPartSearchTerm] = useState("");
  const [lineItems, setLineItems] = useState<ExtendedLineItem[]>([
    { item_type: "labor", description: "Labor Service", quantity: 1, unit_price: 0, discount_percentage: 0, labor_hours: 1, labor_rate: 0, is_taxable: true },
  ]);

  // Fetch Next Estimate Number
  const { data: nextNumberData } = useQuery({
    queryKey: ["estimates", "nextNumber"],
    queryFn: () => billingApi.estimates.nextNumber(),
  });

  // Fetch Sales Agents (Staff)
  const { data: salesAgents } = useQuery({
    queryKey: ["users", "staff"],
    queryFn: () => adminApi.users.staffList(),
  });

  // Fetch parts for search
  const { data: partsData } = useQuery({
    queryKey: ["parts", "search", partSearchTerm],
    queryFn: () => inventoryApi.list({ search: partSearchTerm, page: 1, is_active: true }),
    enabled: partSearchTerm.length > 1,
  });

  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(null);

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
  } = useForm<EstimateFormInput, any, EstimateFormData>({
    resolver: zodResolver(estimateSchema),
    defaultValues: {
      estimate_date: new Date().toISOString().split("T")[0],
      valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      status: "draft",
      discount_type: "none" as const,
      discount_percentage: 0,
      line_items: lineItems,
    },
  });

  // Fetch Work Orders for selected customer
  const { data: workOrdersData } = useQuery({
    queryKey: ["workorders", "customer", selectedCustomer],
    queryFn: () => workordersApi.list({ customer: selectedCustomer || undefined }),
    enabled: !!selectedCustomer,
  });

  const handleWorkOrderChange = async (workOrderIdStr: string) => {
    const wId = parseInt(workOrderIdStr);
    setValue("work_order", wId, { shouldValidate: true });

    // Fetch WO details to get line items
    try {
      const [tasks, parts] = await Promise.all([
        workOrderTasksApi.list({ work_order: wId }),
        workordersApi.parts.list({ work_order: wId })
      ]);

      const newLineItems: ExtendedLineItem[] = [];

      // Labor from Tasks
      if (Array.isArray(tasks)) {

        tasks.forEach((t: any) => {
          newLineItems.push({
            item_type: 'labor',
            description: t.description || "Labor Service",
            quantity: 1,
            labor_hours: parseFloat(t.estimated_hours || "1"),
            labor_rate: 0,
            unit_price: 0,
            discount_percentage: 0,
            is_taxable: true,
            notes: t.detailed_notes
          });
        });
      }

      // Parts
      if (Array.isArray(parts)) {

        parts.forEach((p: any) => {
          newLineItems.push({
            item_type: 'part',
            description: p.part_name || "Part",
            quantity: p.quantity || 1,
            unit_price: parseFloat(p.selling_price || "0"),
            discount_percentage: 0,
            part: p.part,
            part_number: p.part_number,
            part_name: p.part_name,
            is_taxable: true
          });
        });
      }

      if (newLineItems.length > 0) {
        setLineItems(newLineItems);
        setValue("line_items", newLineItems, { shouldValidate: true });

        // Auto-select vehicle if available in WO
        // use query cache or finding in list

        const wo = workOrdersData?.results?.find((w: any) => w.id === wId);
        if (wo && wo.vehicle) {
          setValue("vehicle", typeof wo.vehicle === 'object' ? wo.vehicle.id : wo.vehicle, { shouldValidate: true });
        }
      }

    } catch (e) {
      console.error("Failed to fetch WO details", e);
    }
  };

  const watchedCustomer = watch("customer");
  const customer = watchedCustomer ? Number(watchedCustomer) : undefined;
  const watchedVehicle = watch("vehicle");
  const vehicle = watchedVehicle ? Number(watchedVehicle) : undefined;
  const discountPercentage = Number(watch("discount_percentage") || 0);
  const discountType = normalizeDiscountType(watch("discount_type"));

  useEffect(() => {
    const currentDiscountType = watch("discount_type");
    if (currentDiscountType !== discountType) {
      setValue("discount_type", discountType, { shouldValidate: false });
    }
    if (discountType === "none") {
      setValue("discount_percentage", 0, { shouldValidate: false });
      setValue("discount_reason", "", { shouldValidate: false });
    }
  }, [discountType, setValue, watch]);

  // Update selected customer when form value changes
  if (customer && customer !== selectedCustomer) {
    setSelectedCustomer(customer || null);
    setValue("vehicle", undefined, { shouldValidate: true });
  }


  const addLineItem = (type: "labor" | "part" = "labor", partData?: any) => {
    let updatedLineItems: ExtendedLineItem[];
    if (type === "part" && partData) {
      updatedLineItems = [
        ...lineItems,
        {
          item_type: billingLineTypeForPart(partData),
          description: partData.name,
          quantity: 1,
          unit_price: parseFloat(partData.selling_price || "0"),
          discount_percentage: 0,
          part: partData.id,
          part_number: partData.part_number,
          part_name: partData.name,
          is_taxable: true,
        },
      ];
    } else {
      updatedLineItems = [
        ...lineItems,
        { item_type: "labor", description: "New Labor Item", quantity: 1, unit_price: 0, discount_percentage: 0, labor_hours: 1, labor_rate: 0, is_taxable: true },
      ];
    }
    setLineItems(updatedLineItems);
    setValue("line_items", updatedLineItems, { shouldValidate: true });
  };

  const removeLineItem = (index: number) => {
    const updatedLineItems = lineItems.filter((_, i) => i !== index);
    setLineItems(updatedLineItems);
    setValue("line_items", updatedLineItems, { shouldValidate: true });
  };


  const updateLineItem = (index: number, field: keyof ExtendedLineItem, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value } as ExtendedLineItem;
    setLineItems(updated);
    setValue("line_items", updated, { shouldValidate: true });
  };

  const calculateLineItemGrossTotal = (item: Partial<ExtendedLineItem>): number => {
    if (item.item_type === "labor") {
      return (item.labor_hours || 0) * (item.labor_rate || 0);
    }
    return (item.quantity || 0) * (item.unit_price || 0);
  };

  const calculateLineItemDiscount = (item: Partial<ExtendedLineItem>): number => {
    const itemDiscountPercentage = Math.min(Math.max(item.discount_percentage || 0, 0), 100);
    return (calculateLineItemGrossTotal(item) * itemDiscountPercentage) / 100;
  };

  const calculateLineItemTotal = (item: Partial<ExtendedLineItem>): number => {
    return Math.max(calculateLineItemGrossTotal(item) - calculateLineItemDiscount(item), 0);
  };

  const subtotal = lineItems.reduce((sum, item) => sum + calculateLineItemTotal(item), 0);

  // Tax Calculation
  const taxableSubtotalBeforeDiscount = lineItems.reduce(
    (sum, item) => sum + (item.is_taxable !== false ? calculateLineItemTotal(item) : 0),
    0
  );

  let discountAmount = 0;
  if (discountPercentage && discountPercentage > 0) {
    if (discountType === 'before_tax') {
      discountAmount = (subtotal * discountPercentage) / 100;
    } else if (discountType === 'after_tax') {
      discountAmount = (subtotal * discountPercentage) / 100;
    }
  } else {
    if (discountType === 'none') {
      discountAmount = 0;
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

    mutationFn: (apiData: any) => {
      return billingApi.estimates.create(apiData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      router.push("/billing/estimates");
    },
    onError: (error) => {
      console.error("Estimate creation error:", error);
      setServerError(getUserFacingError(error, "We couldn't save the estimate. Please review the form and try again."));
    },
  });

  const onSubmit = async (data: EstimateFormData, statusAction: string = "draft") => {
    setServerError(null);
    const lineItemsForApi = lineItems.map((item) => {

      const lineItem: any = {
        item_type: item.item_type,
        description: item.description,
        is_taxable: item.is_taxable,
      };

      if (item.item_type === 'labor') {
        lineItem.labor_hours = item.labor_hours || 1;
        lineItem.labor_rate = (item.labor_rate || 0).toString();
        lineItem.quantity = item.labor_hours || 1;
        lineItem.unit_price = (item.labor_rate || 0).toString();
      } else {
        lineItem.quantity = item.quantity || 1;
        lineItem.unit_price = (item.unit_price || 0).toString();
      }
      lineItem.discount_percentage = (item.discount_percentage || 0).toString();

      if (item.part) lineItem.part = item.part;
      if (item.part_number) lineItem.part_number = item.part_number;

      return lineItem;
    });


    const apiData: any = {
      ...data,
      line_items: lineItemsForApi,
      status: statusAction,
      discount_type: discountType,
      discount_percentage: discountType !== 'none' ? data.discount_percentage?.toString() : '0',
      discount_reason: discountType === "none" ? undefined : data.discount_reason || undefined,
    };

    await createMutation.mutateAsync(apiData);
  };

  const onInvalidSubmit = (formErrors: typeof errors) => {
    setServerError(getFirstFormError(formErrors as Record<string, any>));
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Header - No Breadcrumbs */}
      <div>
        <h1 className="text-xl font-bold text-foreground tracking-tight">New Estimate</h1>
      </div>

      {serverError && (
        <Card className="bg-destructive/10 border-destructive/20">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2 text-destructive">
              <AlertCircle className="w-5 h-5" />
              <p className="text-sm font-medium">{serverError}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <form onSubmit={(e) => e.preventDefault()} className="space-y-6">

        {/* Basic Information / Estimate Details - Full Width */}
        <Card>
          <CardHeader>
            <CardTitle>Estimate Details</CardTitle>
            <CardDescription>Enter estimate information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Column 1: Customer & Vehicle */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Customer</label>
                  <CustomerSelector
                    selectedCustomerId={typeof customer === "number" ? customer : undefined}
                    onSelect={(selected) => {
                      setValue("customer", selected.id, { shouldValidate: true });
                      setValue("vehicle", undefined, { shouldValidate: true });
                      setSelectedCustomer(selected.id);
                    }}
                    placeholder="Search and select a customer..."
                  />
                  {errors.customer && <p className="text-xs text-destructive">{errors.customer.message}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Vehicle</label>
                  <VehicleSelector
                    selectedVehicleId={vehicle}
                    ownerId={selectedCustomer}
                    disabled={!selectedCustomer}
                    onSelect={(selected) => setValue("vehicle", selected.id, { shouldValidate: true })}
                    placeholder={!selectedCustomer ? "Select a customer first" : "Search and select a vehicle..."}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Link Work Order (Optional)</label>
                  <Select
                    value={watch("work_order")?.toString() || ""}
                    onValueChange={handleWorkOrderChange}
                    disabled={!selectedCustomer}
                  >
                    <SelectTrigger disabled={!selectedCustomer}>
                      <SelectValue placeholder={!selectedCustomer ? "Select a customer first" : "Select Work Order"} />
                    </SelectTrigger>
                    <SelectContent>

                      {workOrdersData?.results?.map((wo: any) => (
                        <SelectItem key={wo.id} value={wo.id.toString()}>
                          #{wo.work_order_number} - {wo.vehicle_display || "Unknown Vehicle"} ({wo.status.replace('_', ' ')})
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

              {/* Column 2: Estimate Specifics */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Estimate #</label>
                  <div className="h-10 px-3 flex items-center bg-muted border border-border rounded-md">
                    <span className="text-foreground font-medium">
                      {nextNumberData?.next_number || "Draft"}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Reference #</label>
                  <Input {...register("reference_number")} placeholder="e.g. PO-123" />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Date</label>
                    <Input type="date" {...register("estimate_date")} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Valid Until</label>
                    <Input type="date" {...register("valid_until")} />
                  </div>
                </div>
              </div>

              {/* Column 3: Status & Notes */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <Select
                    value={watch("status")}

                    onValueChange={(val: any) => setValue("status", val)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                      <SelectItem value="approved">Accepted</SelectItem>
                      <SelectItem value="declined">Declined</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Internal Notes</label>
                  <Textarea {...register("notes")} rows={2} placeholder="Internal use only" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Customer Notes</label>
                  <Textarea {...register("customer_notes")} rows={2} placeholder="Visible to customer" />
                </div>
              </div>
            </div>

            {/* Discount Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t pt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Discount Type</label>
                  <Select
                  value={discountType}

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
                    {...register("discount_percentage", { valueAsNumber: true })}
                    min="0" max="100" step="0.01"
                  />
                </div>
              )}
              {discountType !== 'none' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Reason</label>
                  <Input {...register("discount_reason")} placeholder="Discount reason..." />
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
              <div className="flex flex-col gap-2 mb-4 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search to add item..."
                    className="pl-9"
                    value={partSearchTerm}
                    onChange={(e) => setPartSearchTerm(e.target.value)}
                  />
                  {partSearchTerm.length > 1 && partsData?.results && partsData.results.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                      {partsData.results.map((part) => (
                        <div
                          key={part.id}
                          className="px-4 py-2 hover:bg-muted cursor-pointer text-sm"
                          onClick={() => {
                            addLineItem("part", part);
                            setPartSearchTerm("");
                          }}
                        >
                          <div className="font-medium">{part.part_number} - {part.name}</div>
                          <div className="text-xs text-muted-foreground">{formatPartPickerMeta(part, formatCurrency)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <Link href="/inventory/new" target="_blank" className="sm:self-start">
                  <Button type="button" variant="outline" size="icon" title="Add new part to inventory">
                    <Plus className="w-4 h-4" />
                  </Button>
                </Link>
                <Button
                  type="button"
                  onClick={() => addLineItem("labor")}
                  variant="default"
                  className="sm:self-start"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Item
                </Button>
              </div>

              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted">
                    <TableRow className="h-8">
                      <TableHead className="w-[120px] py-1 px-2 h-8">Type</TableHead>
                      <TableHead className="min-w-[200px] py-1 px-2 h-8">Description</TableHead>
                      <TableHead className="w-[100px] py-1 px-2 h-8">Qty</TableHead>
                      <TableHead className="w-[120px] py-1 px-2 h-8">Rate</TableHead>
                      <TableHead className="w-[100px] py-1 px-2 h-8">Disc %</TableHead>
                      <TableHead className="w-[80px] text-center py-1 px-2 h-8">Tax</TableHead>
                      <TableHead className="w-[120px] text-right py-1 px-2 h-8">Amount</TableHead>
                      <TableHead className="w-[50px] py-1 px-2 h-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineItems.map((item, index) => (
                      <TableRow key={index} className="h-fit">
                        <TableCell className="py-1 px-2">
                          {item.item_type === 'part' ? (
                            <div className="flex flex-col">
                              <span className="font-medium text-xs">{item.part_number}</span>
                              <Badge variant="outline" className="w-fit text-[10px] px-1 py-0 h-3">Part</Badge>
                            </div>
                          ) : (
                            <Select
                              value={item.item_type}

                              onValueChange={(val: any) => updateLineItem(index, 'item_type', val)}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="labor">Labor</SelectItem>
                                <SelectItem value="fee">Fee</SelectItem>
                                <SelectItem value="sublet">Sublet</SelectItem>
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
                            min="0"
                            step="0.5"
                            value={item.item_type === 'labor' ? item.labor_hours : item.quantity}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              if (item.item_type === 'labor') updateLineItem(index, "labor_hours", val);
                              else updateLineItem(index, "quantity", val);
                            }}
                            className="h-8 text-sm"
                          />
                        </TableCell>
                        <TableCell className="py-1 px-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.item_type === 'labor' ? item.labor_rate : item.unit_price}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              if (item.item_type === 'labor') updateLineItem(index, "labor_rate", val);
                              else updateLineItem(index, "unit_price", val);
                            }}
                            className="h-8 text-sm"
                          />
                        </TableCell>
                        <TableCell className="py-1 px-2">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={item.discount_percentage || ""}
                            onChange={(e) => updateLineItem(index, "discount_percentage", parseFloat(e.target.value) || 0)}
                            className="h-8 text-sm"
                            placeholder="0"
                          />
                        </TableCell>
                        <TableCell className="text-center py-1 px-2">
                          <Checkbox
                            checked={item.is_taxable}
                            onCheckedChange={(checked) => updateLineItem(index, "is_taxable", !!checked)}
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium text-sm py-1 px-2">
                          <div>{formatCurrency(calculateLineItemTotal(item))}</div>
                          {(item.discount_percentage || 0) > 0 && (
                            <div className="text-[11px] font-normal text-destructive">
                              -{formatCurrency(calculateLineItemDiscount(item))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="py-1 px-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => removeLineItem(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {!lineItems.length && (
                  <div className="p-8 text-center text-muted-foreground text-sm bg-muted">
                    No items added. Search or click "Add Item" to start.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bottom Right Summary Section */}
        <div className="flex justify-end">
          <div className="w-full space-y-2 sm:max-w-sm">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Sub Total :</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>

            {watch("discount_type") !== 'none' && (
              <div className="flex justify-between text-sm text-destructive">
                <span>Discount ({discountPercentage || 0}%)</span>
                <span>- {formatCurrency(discountAmount)}</span>
              </div>
            )}

            {/* Tax Lines */}
            {taxSummary.vatAmount > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>VAT (15.00%)</span>
                <span>{formatCurrency(taxSummary.vatAmount)}</span>
              </div>
            )}
            {taxSummary.getfundAmount > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>GETFund (2.50%)</span>
                <span>{formatCurrency(taxSummary.getfundAmount)}</span>
              </div>
            )}
            {taxSummary.nhilAmount > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>NHIL (2.50%)</span>
                <span>{formatCurrency(taxSummary.nhilAmount)}</span>
              </div>
            )}
            {taxSummary.hrlAmount > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>COVID-19 HRL (1.00%)</span>
                <span>{formatCurrency(taxSummary.hrlAmount)}</span>
              </div>
            )}

            <div className="flex justify-between text-lg font-bold border-t border-border pt-2 mt-2">
              <span>Total :</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>
        </div>

      </form>

      {/* Sticky Footer */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-card border-t border-border z-10 flex justify-end items-center gap-3 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] lg:pl-64">
        <Link href="/billing/estimates">
          <Button variant="outline">Cancel</Button>
        </Link>
        <div className="w-auto">
          <BillingSubmitActions
            isSubmitting={isSubmitting || createMutation.isPending}
            resourceType="estimate"
            onSend={handleSubmit((data) => onSubmit(data, "sent"), onInvalidSubmit)}
            onSave={handleSubmit((data) => onSubmit(data, "draft"), onInvalidSubmit)}
          />
        </div>
      </div >
    </div>
  );
}
