"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useRouter, useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { inventoryApi } from "@/lib/api/inventory";
import { adminApi } from "@/lib/api/admin";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { diagnosisApi } from "@/lib/api/diagnosis";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft,
  AlertCircle,
  Plus,
  Trash2,

  Search,
  FileText,
  Calendar,
  DollarSign,
  User,
  Car
} from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { AxiosError } from "axios";
import { computeGhanaTaxBreakdown } from "@/lib/utils/tax";
import { Badge } from "@/components/ui/badge";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { BillingSubmitActions } from "@/components/billing/BillingSubmitActions";
import { CustomerSelector } from "@/components/customers/CustomerSelector";
import { VehicleSelector } from "@/components/vehicles/VehicleSelector";

const requiredNumber = (message: string) => z.coerce.number({ message }).min(1, message);
const optionalNumber = () => z.coerce.number().min(0).optional();

const lineItemSchema = z.object({
  item_type: z.enum(["labor", "part", "fee", "discount", "sublet", "other"]),
  description: z.string().min(1, "Description is required"),
  quantity: optionalNumber(),
  unit_price: optionalNumber(),
  labor_hours: optionalNumber(),
  labor_rate: optionalNumber(),
  is_taxable: z.boolean(),
  part: optionalNumber(),
  part_number: z.string().optional(),
  notes: z.string().optional(),
});

const estimateUpdateSchema = z.object({
  customer: requiredNumber("Customer is required"),
  vehicle: optionalNumber(),
  title: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  customer_notes: z.string().optional(),
  estimate_date: z.string().min(1, "Estimate date is required"),
  valid_until: z.string().min(1, "Valid until date is required"),
  sales_agent: optionalNumber(),
  discount_percentage: optionalNumber(),
  discount_type: z.enum(["none", "before_tax", "after_tax"]),
  discount_reason: z.string().optional(),
  status: z.string().optional(),
  line_items: z.array(lineItemSchema).min(1, "At least one line item is required"),
});

type EstimateUpdateFormData = z.infer<typeof estimateUpdateSchema>;
type EstimateUpdateFormInput = z.input<typeof estimateUpdateSchema>;
type LineItemFormData = z.infer<typeof lineItemSchema>;

const fieldLabels: Record<string, string> = {
  customer: "Customer",
  vehicle: "Vehicle",
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

const getFriendlyEstimateError = (error: AxiosError<any>) => {
  const data = error.response?.data;
  if (!data) return "We couldn't update the estimate. Please try again.";
  if (typeof data.detail === "string" && data.detail.trim()) return data.detail;
  if (typeof data.message === "string" && data.message.trim()) return data.message;
  if (typeof data.error === "string" && data.error.trim()) return data.error;

  const discountTypeError = Array.isArray(data.discount_type)
    ? data.discount_type[0]
    : data.discount_type;
  if (typeof discountTypeError === "string" && discountTypeError.trim()) {
    return "Please choose a valid discount type. Use `No Discount` if you don't want to apply one.";
  }

  for (const [key, value] of Object.entries(data)) {
    const message = Array.isArray(value) ? value[0] : value;
    if (typeof message === "string" && message.trim()) {
      return `${describeFieldPath(key)}: ${message}`;
    }
  }

  return "We couldn't update the estimate. Please review the form and try again.";
};

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

export default function EditEstimatePage() {
  const { formatCurrency } = useCurrency();
  const router = useRouter();
  const params = useParams();
  const estimateId = parseInt(params.id as string);
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<Array<Omit<LineItemFormData, 'is_taxable'> & { is_taxable: boolean; part?: number; part_number?: string; notes?: string }>>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(null);
  const [partSearchTerm, setPartSearchTerm] = useState("");

  // Validate estimateId to prevent NaN API calls
  const isValidId = !isNaN(estimateId) && estimateId > 0;

  const { data: estimate, isLoading } = useQuery({
    queryKey: ["estimate", estimateId],
    queryFn: () => billingApi.estimates.get(estimateId),
    enabled: isValidId,
  });

  const workOrderId = estimate?.work_order
    ? (typeof estimate.work_order === 'object' ? estimate.work_order.id : estimate.work_order)
    : null;

  const workOrderNumber = estimate?.work_order_number || null;

  const { data: salesAgents } = useQuery({
    queryKey: ["users", "staff"],
    queryFn: () => adminApi.users.staffList(),
  });

  const { data: partsData } = useQuery({
    queryKey: ["parts", "search", partSearchTerm],
    queryFn: () => inventoryApi.list({ search: partSearchTerm, page: 1, is_active: true }),
    enabled: partSearchTerm.length > 0,
  });

  const { data: taxConfig } = useQuery({
    queryKey: ["tax", "config"],
    queryFn: () => billingApi.taxes.config(),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },

    reset,
    watch,
    setValue,
  } = useForm<EstimateUpdateFormInput, any, EstimateUpdateFormData>({
    resolver: zodResolver(estimateUpdateSchema),
  });

  const watchedCustomer = watch("customer");
  const customer = watchedCustomer ? Number(watchedCustomer) : undefined;
  const discountType = normalizeDiscountType(watch("discount_type"));
  const discountPercentage = Number(watch("discount_percentage") || 0);

  useEffect(() => {
    if (customer && customer !== selectedCustomer) {
      setSelectedCustomer(customer);
    }
  }, [customer, selectedCustomer, setValue]);

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

  useEffect(() => {
    if (estimate && !isLoading) {
      // Extract IDs from objects, handling both nested objects and direct IDs
      const customerId = typeof estimate.customer === 'object' && estimate.customer

        ? (estimate.customer as any).id
        : estimate.customer;

      const vehicleId = typeof estimate.vehicle === 'object' && estimate.vehicle

        ? (estimate.vehicle as any).id
        : estimate.vehicle;

      const salesAgentId = typeof estimate.sales_agent === 'object' && estimate.sales_agent

        ? (estimate.sales_agent as any).id
        : estimate.sales_agent;

      // Only set selected customer if we have a valid ID
      if (customerId) {
        setSelectedCustomer(customerId);
      }


      const loadedLineItems = (estimate.line_items || []).map((item: any) => ({
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
      }));

      setLineItems(loadedLineItems);

      const dPercent = estimate.discount_percentage ? parseFloat(estimate.discount_percentage) : 0;
      const dType = dPercent > 0 ? "before_tax" : "none";

      reset({
        customer: customerId || 0,
        vehicle: vehicleId || undefined,
        title: estimate.title || "",
        description: estimate.description || "",
        notes: estimate.notes || "",
        customer_notes: estimate.customer_notes || "",
        estimate_date: estimate.estimate_date ? estimate.estimate_date.split("T")[0] : "",
        valid_until: estimate.valid_until ? estimate.valid_until.split("T")[0] : "",
        sales_agent: salesAgentId || undefined,
        discount_percentage: dPercent,

        discount_type: normalizeDiscountType((estimate as any).discount_type || dType),
        discount_reason: estimate.discount_reason || "",
        line_items: loadedLineItems,
        status: estimate.status,
      });
    }
  }, [estimate, isLoading, reset, setValue]);


  const addLineItem = (type: "labor" | "part" = "labor", partData?: any) => {
    if (type === "part" && partData) {

      const newLineItem: any = {
        item_type: "part",
        description: partData.name,
        quantity: 1,
        unit_price: parseFloat(partData.selling_price || partData.cost_price || "0"),
        part: partData.id,
        part_number: partData.part_number,
        is_taxable: true,
      };
      setLineItems([...lineItems, newLineItem]);
      setValue("line_items", [...lineItems, newLineItem], { shouldValidate: true });
    } else {

      const newItem: any = { item_type: "labor", description: "", quantity: 1, unit_price: 0, is_taxable: true };
      setLineItems([...lineItems, newItem]);
      setValue("line_items", [...lineItems, newItem], { shouldValidate: true });
    }
  };

  const removeLineItem = (index: number) => {
    const updated = lineItems.filter((_, i) => i !== index);
    setLineItems(updated);
    setValue("line_items", updated, { shouldValidate: true });
  };


  const updateLineItem = (index: number, field: string, value: any) => {
    const updated = [...lineItems];

    updated[index] = { ...updated[index], [field]: value } as any;
    setLineItems(updated);
    setValue("line_items", updated, { shouldValidate: true });
  };

  const calculateLineItemTotal = (item: LineItemFormData): number => {
    if (item.item_type === "labor" && item.labor_hours && item.labor_rate) {
      return item.labor_hours * item.labor_rate;
    }
    return (item.quantity || 0) * (item.unit_price || 0);
  };

  const subtotal = lineItems.reduce((sum, item) => sum + calculateLineItemTotal(item), 0);

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

  const updateMutation = useMutation({
    mutationFn: async (data: EstimateUpdateFormData) => {
      const lineItemsForApi = lineItems.map((item) => {

        const lineItem: any = {
          item_type: item.item_type,
          description: item.description,
          is_taxable: item.is_taxable ?? true,
        };

        if (item.item_type === 'labor') {
          lineItem.labor_hours = item.labor_hours || 1;
          lineItem.labor_rate = (item.labor_rate || 0).toString();
          lineItem.quantity = item.labor_hours || 1;
          lineItem.unit_price = (item.labor_rate || 0).toString();
        } else {
          lineItem.quantity = item.quantity && item.quantity > 0 ? item.quantity : 1;
          lineItem.unit_price = (item.unit_price || 0).toString();
        }

        if (item.part) lineItem.part = item.part;
        if (item.part_number) lineItem.part_number = item.part_number;
        if (item.notes) lineItem.notes = item.notes;

        return lineItem;
      });


      const payload: any = {
        customer: data.customer,
        vehicle: data.vehicle || undefined,
        title: data.title || undefined,
        description: data.description || undefined,
        notes: data.notes || undefined,
        customer_notes: data.customer_notes || undefined,
        estimate_date: data.estimate_date,
        valid_until: data.valid_until,
        discount_type: discountType,
        discount_percentage: discountType !== 'none' ? data.discount_percentage?.toString() : '0',
        discount_reason: discountType === "none" ? undefined : data.discount_reason || undefined,
        status: data.status,
        sales_agent: data.sales_agent,
        line_items: lineItemsForApi,
      };

      return billingApi.estimates.update(estimateId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["estimate", estimateId] });
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
    },

    onError: (error: AxiosError<any>) => {
      // Error handling is done in onSubmit via promise catch or here
      setServerError(getFriendlyEstimateError(error));
    },
  });

  const onSubmit = async (data: EstimateUpdateFormData, status?: string) => {
    setServerError(null);
    const nextStatus = status || estimate?.status || data.status || "draft";
    updateMutation.mutateAsync({ ...data, status: nextStatus })
      .then(() => {
        // Always redirect to detail page after edit, regardless of action?
        // Or if 'sent', maybe go to list? keeping same pattern as Invoice:
        router.push(`/billing/estimates/${estimateId}`);
      })
      .catch(() => {
        // handled in onError
      });
  };

  const onInvalidSubmit = (formErrors: typeof errors) => {
    setServerError(getFirstFormError(formErrors as Record<string, any>));
  };

  // Handle invalid estimate ID
  if (!isValidId) {
    return (
      <div className="p-8">
        <Card className="border-destructive/20 bg-destructive/10">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-destructive">Invalid Estimate ID</p>
                <p className="text-sm text-destructive mt-1">The estimate ID in the URL is invalid.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return <div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  }

  if (!estimate) return <div>Estimate not found</div>;

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <Link href={`/billing/estimates/${estimateId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Edit Estimate</h1>
            <div className="flex items-center gap-2 text-muted-foreground">
              <p>
                Estimate <span className="font-mono font-medium">{estimate.estimate_number}</span>
              </p>
              {workOrderId && workOrderNumber && (
                <Link href={`/workorders/${workOrderId}`}>
                  <span className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary hover:bg-orange-100 transition-colors">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    Work Order #{workOrderNumber}
                  </span>
                </Link>
              )}
            </div>
          </div>
        </div>
        {estimate.status && (
          <Badge variant={estimate.status === 'draft' ? 'secondary' : 'default'}>
            {estimate.status.replace('_', ' ').toUpperCase()}
          </Badge>
        )}
      </div>

      {serverError && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-destructive">Error updating estimate</p>
                <p className="text-sm text-destructive/80 mt-1">{serverError}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <form onSubmit={(e) => e.preventDefault()} className="space-y-6">

        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Estimate Information
            </CardTitle>
            <CardDescription>Update customer, vehicle, and estimate details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Customer & Vehicle */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Customer *
                </label>
                <CustomerSelector
                  selectedCustomerId={typeof watch("customer") === "number" ? watch("customer") : undefined}
                  onSelect={(selected) => {
                    setValue("customer", selected.id, { shouldValidate: true });
                    setValue("vehicle", undefined, { shouldValidate: true });
                    setSelectedCustomer(selected.id);
                  }}
                  placeholder="Search and select a customer..."
                />
                {errors.customer && (
                  <p className="text-sm text-destructive">{errors.customer.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Car className="h-4 w-4" />
                  Vehicle
                </label>
                <VehicleSelector
                  selectedVehicleId={typeof watch("vehicle") === "number" ? watch("vehicle") : undefined}
                  ownerId={selectedCustomer}
                  disabled={!selectedCustomer}
                  onSelect={(selected) => setValue("vehicle", selected.id, { shouldValidate: true })}
                  placeholder={!selectedCustomer ? "Select a customer first" : "Search and select a vehicle..."}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Sales Agent</label>
                <Select
                  value={watch("sales_agent")?.toString() || ""}
                  onValueChange={(val) => {
                    const parsed = parseInt(val);
                    if (!isNaN(parsed)) {
                      setValue("sales_agent", parsed, { shouldValidate: true });
                    }
                  }}
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

            {/* Dates */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Estimate Date *
                </label>
                <Input
                  type="date"
                  {...register("estimate_date")}
                  className={errors.estimate_date ? "border-destructive" : ""}
                />
                {errors.estimate_date && (
                  <p className="text-sm text-destructive">{errors.estimate_date.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Valid Until *
                </label>
                <Input
                  type="date"
                  {...register("valid_until")}
                  className={errors.valid_until ? "border-destructive" : ""}
                />
                {errors.valid_until && (
                  <p className="text-sm text-destructive">{errors.valid_until.message}</p>
                )}
              </div>
            </div>

            {/* Title & Description */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                {...register("title")}
                placeholder="e.g., Vehicle Repair Estimate"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                {...register("description")}
                placeholder="Describe the work to be performed..."
                rows={3}
                className="resize-none"
              />
            </div>

            {/* Notes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Internal Notes</label>
                <Textarea
                  {...register("notes")}
                  placeholder="Internal notes (not visible to customer)"
                  rows={3}
                  className="resize-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Customer Notes</label>
                <Textarea
                  {...register("customer_notes")}
                  placeholder="Notes visible to customer"
                  rows={3}
                  className="resize-none"
                />
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
                    <SelectValue placeholder="Select discount type" />
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

        {/* Line Items */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Line Items
                </CardTitle>
                <CardDescription>Add services, parts, and fees</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2 mb-4 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search to add item..."
                  className="pl-9"
                  value={partSearchTerm}
                  onChange={(e) => setPartSearchTerm(e.target.value)}
                />
                {partSearchTerm.length > 1 && partsData?.results && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">

                    {partsData.results.map((part: any) => (
                      <div
                        key={part.id}
                        className="px-4 py-2 hover:bg-muted cursor-pointer text-sm"
                        onClick={() => {
                          addLineItem("part", part);
                          setPartSearchTerm("");
                        }}
                      >
                        <div className="font-medium">{part.part_number} - {part.name}</div>
                        <div className="text-xs text-muted-foreground">Stock: {part.quantity_on_hand || part.quantity_in_stock} | {formatCurrency(part.selling_price || part.cost_price || "0")}</div>
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
                    <TableHead className="w-[80px] text-center py-1 px-2 h-8">Tax</TableHead>
                    <TableHead className="w-[120px] text-right py-1 px-2 h-8">Total</TableHead>
                    <TableHead className="w-[50px] py-1 px-2 h-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map((item, index) => (
                    <TableRow key={index}>
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
                          min="0"
                          step="0.5"
                          value={item.item_type === 'labor' ? item.labor_hours || "" : item.quantity || ""}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            if (item.item_type === 'labor') {
                              updateLineItem(index, "labor_hours", val);
                            } else {
                              updateLineItem(index, "quantity", val);
                            }
                          }}
                          className="h-8 text-sm"
                        />
                      </TableCell>
                      <TableCell className="py-1 px-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.item_type === 'labor' ? item.labor_rate || "" : item.unit_price || ""}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            if (item.item_type === 'labor') {
                              updateLineItem(index, "labor_rate", val);
                            } else {
                              updateLineItem(index, "unit_price", val);
                            }
                          }}
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
                          className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                          onClick={() => removeLineItem(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        <div className="flex justify-end">
          <div className="w-full space-y-2 sm:max-w-sm">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Sub Total :</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {discountType !== 'none' && (
              <div className="flex justify-between text-sm text-destructive">
                <span>Discount ({discountPercentage}%)</span>
                <span>- {formatCurrency(discountAmount)}</span>
              </div>
            )}
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

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-card border-t border-border z-10 flex justify-end items-center gap-3 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] lg:pl-64">
        <Link href={`/billing/estimates/${estimateId}`}>
          <Button variant="outline">Cancel</Button>
        </Link>
        <div className="w-auto">
          <BillingSubmitActions
            isSubmitting={isSubmitting || updateMutation.isPending}
            resourceType="estimate"
            mode="edit"
            onSend={handleSubmit((data) => onSubmit(data, "sent"), onInvalidSubmit)}
            onSave={handleSubmit((data) => onSubmit(data), onInvalidSubmit)}
          />
        </div>
      </div>
    </div>
  );
}
