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
import { diagnosisApi } from "@/lib/api/diagnosis";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  ArrowLeft, 
  AlertCircle, 
  Plus, 
  Trash2, 
  Package,
  Save,
  Loader2,
  FileText,
  Calendar,
  DollarSign,
  User,
  Car
} from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { AxiosError } from "axios";
import { calculateGhanaTax } from "@/lib/utils/tax";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/lib/hooks/useToast";

const estimateUpdateSchema = z.object({
  customer: z.number().min(1, "Customer is required"),
  vehicle: z.number().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  customer_notes: z.string().optional(),
  estimate_date: z.string().min(1, "Estimate date is required"),
  valid_until: z.string().min(1, "Valid until date is required"),
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

type EstimateUpdateFormData = z.infer<typeof estimateUpdateSchema>;

export default function EditEstimatePage() {
  const router = useRouter();
  const params = useParams();
  const estimateId = parseInt(params.id as string);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<LineItemFormData[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(null);

  const { data: estimate, isLoading } = useQuery({
    queryKey: ["estimate", estimateId],
    queryFn: () => billingApi.estimates.get(estimateId),
  });
  
  const workOrderId = estimate?.work_order 
    ? (typeof estimate.work_order === 'object' ? estimate.work_order.id : estimate.work_order)
    : null;
  
  const workOrderNumber = estimate?.work_order_number || null;
  
  const { data: diagnosis } = useQuery({
    queryKey: ["diagnosis", "workorder", workOrderId],
    queryFn: () => {
      if (!workOrderId) return null;
      return diagnosisApi.getByWorkOrder(workOrderId);
    },
    enabled: !!workOrderId && !!estimate,
  });

  const { data: customersData } = useQuery({
    queryKey: ["customers", "list"],
    queryFn: () => customersApi.list({ page: 1 }),
  });

  const { data: vehiclesData } = useQuery({
    queryKey: ["vehicles", "customer", selectedCustomer],
    queryFn: () => vehiclesApi.list({ owner: selectedCustomer || undefined }),
    enabled: !!selectedCustomer || !!estimate,
  });

  const { data: partsData, isLoading: partsLoading } = useQuery({
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
  } = useForm<EstimateUpdateFormData>({
    resolver: zodResolver(estimateUpdateSchema),
  });

  const customer = watch("customer");

  useEffect(() => {
    if (customer && customer !== selectedCustomer) {
      setSelectedCustomer(customer);
      setValue("vehicle", undefined);
    }
  }, [customer, selectedCustomer, setValue]);

  useEffect(() => {
    if (estimate && !isLoading) {
      const customerId = typeof estimate.customer === 'object' ? estimate.customer.id : estimate.customer;
      const vehicleId = typeof estimate.vehicle === 'object' && estimate.vehicle ? estimate.vehicle.id : estimate.vehicle;
      
      if (customerId) {
        setSelectedCustomer(customerId);
      }
      
      reset({
        customer: customerId,
        vehicle: vehicleId || undefined,
        title: estimate.title || "",
        description: estimate.description || "",
        notes: estimate.notes || "",
        customer_notes: estimate.customer_notes || "",
        estimate_date: estimate.estimate_date ? estimate.estimate_date.split("T")[0] : "",
        valid_until: estimate.valid_until ? estimate.valid_until.split("T")[0] : "",
        discount_percentage: estimate.discount_percentage ? parseFloat(estimate.discount_percentage) : undefined,
        discount_reason: estimate.discount_reason || "",
        line_items: (estimate.line_items || []).map((item: any) => ({
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
      
      if (estimate.line_items) {
        setLineItems(
          estimate.line_items.map((item: any) => ({
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
    }
  }, [estimate, isLoading, reset, setValue]);
  
  useEffect(() => {
    if (estimate && vehiclesData && estimate.vehicle) {
      const vehicleId = typeof estimate.vehicle === 'object' && estimate.vehicle ? estimate.vehicle.id : estimate.vehicle;
      const currentVehicle = watch("vehicle");
      
      if (vehicleId && (!currentVehicle || currentVehicle !== vehicleId)) {
        const vehicleExists = vehiclesData.results?.some((v: any) => v.id === vehicleId);
        if (vehicleExists) {
          setValue("vehicle", vehicleId, { shouldValidate: false });
        }
      }
    }
  }, [estimate, vehiclesData, watch, setValue]);

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
        discount_percentage: data.discount_percentage?.toString() || undefined,
        discount_reason: data.discount_reason || undefined,
        line_items: lineItemsForApi,
      };
      
      return billingApi.estimates.update(estimateId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["estimate", estimateId] });
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      toast({
        title: "Success",
        description: "Estimate updated successfully",
      });
      router.push(`/billing/estimates/${estimateId}`);
    },
    onError: (error: AxiosError<any>) => {
      console.error("Estimate update error:", error);
      if (error.response?.data) {
        const errorData = error.response.data;
        
        if (errorData.line_items) {
          errorData.line_items.forEach((itemError: any, index: number) => {
            if (typeof itemError === 'object') {
              Object.keys(itemError).forEach((field) => {
                const fieldError = Array.isArray(itemError[field])
                  ? itemError[field][0]
                  : itemError[field];
                setError(`line_items.${index}.${field}` as any, {
                  type: "server",
                  message: fieldError,
                });
              });
            }
          });
        }
        
        if (typeof errorData === "object") {
          Object.keys(errorData).forEach((key) => {
            if (key !== "line_items" && key in estimateUpdateSchema.shape) {
              setError(key as any, { type: "server", message: errorData[key] });
            }
          });
          setServerError(errorData.detail || errorData.non_field_errors?.[0] || "An error occurred while updating the estimate");
        } else {
          setServerError("An unexpected error occurred");
        }
      }
    },
  });

  const onSubmit = async (data: EstimateUpdateFormData) => {
    setServerError(null);
    await updateMutation.mutateAsync(data);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">Loading estimate...</p>
        </div>
      </div>
    );
  }

  if (!estimate) {
    return (
      <div className="container max-w-4xl mx-auto py-8 space-y-6">
        <Link href="/billing/estimates">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Estimates
          </Button>
        </Link>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Estimate Not Found</h3>
              <p className="text-muted-foreground">The estimate you're looking for doesn't exist or has been deleted.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const taxBreakdown = calculateGhanaTax(calculateTaxableSubtotal(), taxConfig);

  return (
    <div className="w-full px-4 md:px-8 lg:px-12 py-6 space-y-6 mx-auto">
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
                  <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors">
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
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

      {/* Error Alert */}
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

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
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
                    <Select
                      {...register("customer", { valueAsNumber: true })}
                      onChange={(e) => setValue("customer", parseInt(e.target.value), { shouldValidate: true })}
                      value={watch("customer")?.toString() || ""}
                      className={errors.customer ? "border-destructive" : ""}
                    >
                      <option value="">Select customer...</option>
                      {customersData?.results.map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name 
                            ? (c.company_name ? `${c.full_name} (${c.company_name})` : c.full_name)
                            : c.company_name || `Customer #${c.id}`}
                        </option>
                      ))}
                    </Select>
                    {errors.customer && (
                      <p className="text-sm text-destructive">{errors.customer.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Car className="h-4 w-4" />
                      Vehicle
                    </label>
                    <Select
                      {...register("vehicle", { valueAsNumber: true })}
                      disabled={!selectedCustomer}
                      className={!selectedCustomer ? "opacity-50" : ""}
                    >
                      <option value="">Select vehicle...</option>
                      {vehiclesData?.results.map((v: any) => (
                        <option key={v.id} value={v.id}>
                          {v.year} {v.make} {v.model}
                        </option>
                      ))}
                    </Select>
                    {!selectedCustomer && (
                      <p className="text-xs text-muted-foreground">Select a customer first</p>
                    )}
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
                  <Button type="button" onClick={addLineItem} size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Item
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {lineItems.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed rounded-lg">
                    <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-sm font-medium mb-2">No line items</p>
                    <p className="text-xs text-muted-foreground mb-4">Add your first line item to get started</p>
                    <Button type="button" onClick={addLineItem} variant="outline" size="sm">
                      <Plus className="mr-2 h-4 w-4" />
                      Add First Item
                    </Button>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[100px]">Type</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="w-[90px] text-center">Qty</TableHead>
                          <TableHead className="w-[110px]">Rate</TableHead>
                          <TableHead className="w-[70px] text-center">Tax</TableHead>
                          <TableHead className="w-[100px] text-right">Total</TableHead>
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
                                className="text-sm h-9"
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
                                  disabled={partsLoading}
                                  className="text-sm h-9"
                                >
                                  <option value="">
                                    {partsLoading ? "Loading..." : item.description || "Select part..."}
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
                                  placeholder="Item description..."
                                  className="text-sm h-9"
                                />
                              )}
                            </TableCell>

                            <TableCell>
                              {item.item_type === "labor" ? (
                                <Input
                                  type="number"
                                  value={item.labor_hours || ""}
                                  onChange={(e) => {
                                    const hours = parseFloat(e.target.value) || 0;
                                    updateLineItemFields(index, {
                                      labor_hours: hours,
                                      quantity: hours,
                                    });
                                  }}
                                  placeholder="0"
                                  step="0.1"
                                  min="0"
                                  className="text-sm h-9 text-center"
                                />
                              ) : (
                                <Input
                                  type="number"
                                  value={item.quantity || ""}
                                  onChange={(e) => updateLineItem(index, "quantity", parseFloat(e.target.value) || 0)}
                                  placeholder="0"
                                  step="0.01"
                                  min="0"
                                  className="text-sm h-9 text-center"
                                />
                              )}
                            </TableCell>

                            <TableCell>
                              {item.item_type === "labor" ? (
                                <Input
                                  type="number"
                                  value={item.labor_rate || ""}
                                  onChange={(e) => {
                                    const rate = parseFloat(e.target.value) || 0;
                                    updateLineItemFields(index, {
                                      labor_rate: rate,
                                      unit_price: rate,
                                    });
                                  }}
                                  placeholder="0.00"
                                  step="0.01"
                                  min="0"
                                  className="text-sm h-9"
                                />
                              ) : (
                                <Input
                                  type="number"
                                  value={item.unit_price || ""}
                                  onChange={(e) => updateLineItem(index, "unit_price", parseFloat(e.target.value) || 0)}
                                  placeholder="0.00"
                                  step="0.01"
                                  min="0"
                                  className="text-sm h-9"
                                />
                              )}
                            </TableCell>

                            <TableCell className="text-center">
                              <Checkbox
                                checked={item.is_taxable}
                                onCheckedChange={(checked) => updateLineItem(index, "is_taxable", checked)}
                              />
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
                                  className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                >
                                  <Trash2 className="h-4 w-4" />
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

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Summary */}
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium">${calculateSubtotal().toFixed(2)}</span>
                  </div>

                  {calculateDiscount() > 0 && (
                    <>
                      <div className="flex justify-between text-sm text-destructive">
                        <span>Discount ({watch("discount_percentage")}%)</span>
                        <span>-${calculateDiscount().toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-medium pt-2 border-t">
                        <span className="text-muted-foreground">After Discount</span>
                        <span>${calculateSubtotalAfterDiscount().toFixed(2)}</span>
                      </div>
                    </>
                  )}

                  <div className="border-t pt-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tax Breakdown</p>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>NHIL (2.5%)</span>
                      <span>${taxBreakdown.nhil.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>GETFund (2.5%)</span>
                      <span>${taxBreakdown.getfund.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>COVID-19 HRL (1%)</span>
                      <span>${taxBreakdown.hrl.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>VAT (15%)</span>
                      <span>${taxBreakdown.vat.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="border-t pt-3">
                    <div className="flex justify-between text-sm font-semibold mb-1">
                      <span>Total Tax</span>
                      <span>${taxBreakdown.total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="border-t-2 pt-4">
                  <div className="flex justify-between text-xl font-bold">
                    <span>Total</span>
                    <span>${calculateTotal().toFixed(2)}</span>
                  </div>
                </div>

                <div className="pt-4 space-y-2">
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Save Changes
                      </>
                    )}
                  </Button>
                  <Link href={`/billing/estimates/${estimateId}`}>
                    <Button type="button" variant="outline" className="w-full">
                      Cancel
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* Discounts */}
            <Card>
              <CardHeader>
                <CardTitle>Discounts</CardTitle>
                <CardDescription>Apply discounts to this estimate</CardDescription>
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
                    placeholder="0.00"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Discount Reason</label>
                  <Input 
                    {...register("discount_reason")} 
                    placeholder="e.g., Customer loyalty discount" 
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}
