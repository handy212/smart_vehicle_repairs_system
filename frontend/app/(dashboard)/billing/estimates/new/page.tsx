"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { customersApi } from "@/lib/api/customers";
import { vehiclesApi } from "@/lib/api/vehicles";
import { inventoryApi } from "@/lib/api/inventory";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, AlertCircle, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AxiosError } from "axios";
import { computeGhanaTaxBreakdown } from "@/lib/utils/tax";

const lineItemSchema = z.object({
  item_type: z.enum(["labor", "part", "fee", "discount", "sublet", "other"]),
  description: z.string().min(1, "Description is required"),
  quantity: z.number().min(0).optional(),
  unit_price: z.number().min(0).optional(),
  labor_hours: z.number().min(0).optional(),
  labor_rate: z.number().min(0).optional(),
  is_taxable: z.boolean(),
  part: z.number().optional(), // Link to inventory Part
  part_number: z.string().optional(),
  notes: z.string().optional(),
});

const estimateSchema = z.object({
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
  shop_supplies_fee: z.number().min(0).optional(),
  environmental_fee: z.number().min(0).optional(),
  line_items: z.array(lineItemSchema).min(1, "At least one line item is required"),
});

type LineItemFormData = z.infer<typeof lineItemSchema>;
type EstimateFormData = z.infer<typeof estimateSchema>;

export default function NewEstimatePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<Array<Omit<LineItemFormData, 'is_taxable'> & { is_taxable: boolean; part?: number; part_number?: string }>>([
    { item_type: "labor", description: "", quantity: 1, unit_price: 0, is_taxable: true },
  ]);

  // Fetch parts for part selection
  const { data: partsData } = useQuery({
    queryKey: ["parts", "list"],
    queryFn: () => inventoryApi.list({ page: 1, is_active: true }),
  });

  // Fetch customers
  const { data: customersData } = useQuery({
    queryKey: ["customers", "list"],
    queryFn: () => customersApi.list({ page: 1 }),
  });

  // Fetch vehicles for selected customer
  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(null);

  const { data: vehiclesData } = useQuery({
    queryKey: ["vehicles", "customer", selectedCustomer],
    queryFn: () => vehiclesApi.list({ owner: selectedCustomer || undefined }),
    enabled: !!selectedCustomer,
  });

  const { data: taxConfig, isLoading: taxConfigLoading } = useQuery({
    queryKey: ["tax", "config"],
    queryFn: () => billingApi.taxes.config(),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    setError,
    watch,
  } = useForm<EstimateFormData>({
    resolver: zodResolver(estimateSchema),
    defaultValues: {
      estimate_date: new Date().toISOString().split("T")[0],
      valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      line_items: lineItems,
    },
  });

  const customer = watch("customer");
  const discountPercentage = watch("discount_percentage") || 0;
  const shopSuppliesFee = watch("shop_supplies_fee") || 0;
  const environmentalFee = watch("environmental_fee") || 0;

  // Update selected customer when form value changes
  if (customer && customer !== selectedCustomer) {
    setSelectedCustomer(customer);
    setValue("vehicle", undefined);
  }

  const addLineItem = () => {
    setLineItems([...lineItems, { item_type: "labor", description: "", quantity: 1, unit_price: 0, is_taxable: true } as any]);
  };

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const updateLineItem = (index: number, field: string, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value } as any;
    setLineItems(updated);
    // Sync with form state
    setValue("line_items", updated as any, { shouldValidate: false });
  };

  const updateLineItemFields = (index: number, updates: Record<string, any>) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], ...updates } as any;
    setLineItems(updated);
    // Sync with form state
    setValue("line_items", updated as any, { shouldValidate: false });
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
  const taxableSubtotalBeforeDiscount = lineItems.reduce(
    (sum, item) => sum + (item.is_taxable !== false ? calculateLineItemTotal(item) : 0),
    0
  );
  const discountAmount = subtotal * (discountPercentage / 100);
  const subtotalAfterDiscount = subtotal - discountAmount;
  const taxSummary = computeGhanaTaxBreakdown({
    taxableTotal: taxableSubtotalBeforeDiscount,
    subtotal,
    discountAmount,
    config: taxConfig,
  });
  const total = Math.max(subtotalAfterDiscount, 0) + taxSummary.totalTax + shopSuppliesFee + environmentalFee;

  const createMutation = useMutation({
    mutationFn: (apiData: any) => {
      // Data is already prepared in onSubmit, just send it
      return billingApi.estimates.create(apiData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      router.push("/billing/estimates");
    },
    onError: (error) => {
      console.error("Estimate creation error:", error);
      if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data;
        console.error("Error data:", errorData);
        
        // Handle nested line_items errors
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
        
        Object.keys(errorData).forEach((field) => {
          if (field !== "non_field_errors" && field !== "detail" && field !== "line_items") {
            const fieldError = Array.isArray(errorData[field])
              ? errorData[field][0]
              : errorData[field];
            setError(field as keyof EstimateFormData, {
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
          setServerError("An error occurred while creating the estimate. Please check the form and try again.");
        }
      } else {
        setServerError("An unexpected error occurred. Please try again.");
      }
    },
  });

  const onSubmit = async (data: EstimateFormData) => {
    setServerError(null);
    // Prepare line items - don't send total (it's calculated on backend)
    // Use current lineItems state which has the latest part selections
    const lineItemsForApi = lineItems.map((item: any) => {
      const lineItem: any = {
        item_type: item.item_type,
        description: item.description,
        is_taxable: item.is_taxable ?? true,
      };
      
      // Handle labor items differently
      if (item.item_type === 'labor') {
        // For labor, use labor_hours and labor_rate, quantity defaults to labor_hours
        lineItem.labor_hours = item.labor_hours || 1;
        lineItem.labor_rate = (item.labor_rate || 0).toString();
        lineItem.quantity = item.labor_hours || 1; // Quantity for labor is typically the hours
        lineItem.unit_price = (item.labor_rate || 0).toString();
      } else {
        // For non-labor items, use quantity and unit_price
        lineItem.quantity = item.quantity && item.quantity > 0 ? item.quantity : 1;
        lineItem.unit_price = (item.unit_price || 0).toString();
      }
      
      // Add part fields if present
      if (item.part) {
        lineItem.part = item.part;
      }
      if (item.part_number) {
        lineItem.part_number = item.part_number;
      }
      
      // Add notes if present
      if (item.notes) {
        lineItem.notes = item.notes;
      }
      
      return lineItem;
    });
    
    // Prepare API payload with proper formatting
    const apiData: any = {
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
      shop_supplies_fee: data.shop_supplies_fee?.toString() || undefined,
      environmental_fee: data.environmental_fee?.toString() || undefined,
      line_items: lineItemsForApi,
    };
    
    await createMutation.mutateAsync(apiData);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/billing/estimates">
          <Buttonvariant="secondary">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">New Estimate</h1>
          <p className="text-sm text-gray-500 mt-1">Create a new estimate</p>
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
              </CardContent>
            </Card>

            {/* Estimate Details */}
            <Card>
              <CardHeader>
                <CardTitle>Estimate Details</CardTitle>
                <CardDescription>Dates and description</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                    Title
                  </label>
                  <Input
                    id="title"
                    {...register("title")}
                    placeholder="e.g., Brake Service Estimate"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="estimate_date" className="block text-sm font-medium text-gray-700 mb-1">
                      Estimate Date *
                    </label>
                    <Input
                      id="estimate_date"
                      type="date"
                      {...register("estimate_date")}
                      className={errors.estimate_date ? "border-red-500" : ""}
                    />
                    {errors.estimate_date && (
                      <p className="mt-1 text-sm text-red-600">{errors.estimate_date.message}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="valid_until" className="block text-sm font-medium text-gray-700 mb-1">
                      Valid Until *
                    </label>
                    <Input
                      id="valid_until"
                      type="date"
                      {...register("valid_until")}
                      className={errors.valid_until ? "border-red-500" : ""}
                    />
                    {errors.valid_until && (
                      <p className="mt-1 text-sm text-red-600">{errors.valid_until.message}</p>
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
                    placeholder="Estimate description..."
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
              </CardContent>
            </Card>

            {/* Line Items */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Line Items</CardTitle>
                  <CardDescription>Add items to the estimate</CardDescription>
                </div>
                <Button type="button" onClick={addLineItem}variant="secondary" size="sm">
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
                         variant="secondary"
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
                          onChange={(e) => {
                            const newType = e.target.value as any;
                            // Update item_type and clear part fields if needed, all in one update
                            const updates: any = { item_type: newType };
                            if (newType !== "part") {
                              updates.part = undefined;
                              updates.part_number = undefined;
                            }
                            updateLineItemFields(index, updates);
                          }}
                        >
                          <option value="labor">Labor</option>
                          <option value="part">Part</option>
                          <option value="fee">Fee</option>
                          <option value="discount">Discount</option>
                        </Select>
                      </div>
                      {item.item_type === "part" ? (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Select Part *
                          </label>
                          <Select
                            value={item.part?.toString() || ""}
                            onChange={(e) => {
                              const partId = e.target.value ? parseInt(e.target.value) : null;
                              if (partId && partsData?.results) {
                                const selectedPart = partsData.results.find((p) => p.id === partId);
                                if (selectedPart) {
                                  // Update all fields at once to avoid multiple state updates
                                  updateLineItemFields(index, {
                                    part: partId,
                                    part_number: selectedPart.part_number,
                                    description: selectedPart.name,
                                    unit_price: parseFloat(selectedPart.selling_price || "0"),
                                    quantity: 1,
                                  });
                                }
                              } else {
                                // Clear part selection
                                updateLineItemFields(index, {
                                  part: undefined,
                                  part_number: undefined,
                                });
                              }
                            }}
                          >
                            <option value="">Select a part...</option>
                            {partsData?.results && partsData.results.length > 0 ? (
                              partsData.results.map((part) => (
                                <option key={part.id} value={part.id.toString()}>
                                  {part.part_number} - {part.name} (${parseFloat(part.selling_price || "0").toFixed(2)})
                                </option>
                              ))
                            ) : (
                              <option value="" disabled>Loading parts...</option>
                            )}
                          </Select>
                        </div>
                      ) : (
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
                      )}
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

            {/* Discounts & Fees */}
            <Card>
              <CardHeader>
                <CardTitle>Discounts & Fees</CardTitle>
                <CardDescription>Optional discounts and additional fees</CardDescription>
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

                <div className="grid grid-cols-2 gap-4">
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
            {/* Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Estimate Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Subtotal</span>
                  <span className="text-gray-900">${subtotal.toFixed(2)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex items-center justify-between text-red-600">
                    <span className="text-sm">Discount ({discountPercentage}%)</span>
                    <span className="text-sm font-medium">-${discountAmount.toFixed(2)}</span>
                  </div>
                )}
                {taxConfigLoading ? (
                  <div className="text-sm text-gray-500">Loading tax configuration…</div>
                ) : taxConfig?.enabled ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">NHIL ({taxConfig.nhil_rate}%)</span>
                      <span className="text-gray-900">${taxSummary.nhilAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">GETFund ({taxConfig.getfund_rate}%)</span>
                      <span className="text-gray-900">${taxSummary.getfundAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">COVID-19 ({taxConfig.covid_rate}%)</span>
                      <span className="text-gray-900">${taxSummary.hrlAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">VAT ({taxConfig.vat_rate}%)</span>
                      <span className="text-gray-900">${taxSummary.vatAmount.toFixed(2)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Tax</span>
                    <span className="text-gray-900">$0.00</span>
                  </div>
                )}
                {shopSuppliesFee > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Shop Supplies</span>
                    <span className="text-gray-900">${shopSuppliesFee.toFixed(2)}</span>
                  </div>
                )}
                {environmentalFee > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Environmental Fee</span>
                    <span className="text-gray-900">${environmentalFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Total</span>
                    <span className="text-2xl font-bold text-gray-900">${total.toFixed(2)}</span>
                  </div>
                  {taxConfig && (
                    <p className="text-xs text-gray-500 mt-2">
                      Taxes are calculated automatically using {taxConfig.regime?.replace(/_/g, " ")} rates.
                    </p>
                  )}
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
                  {isSubmitting ? "Creating..." : "Create Estimate"}
                </Button>
                <Link href="/billing/estimates">
                  <Button type="button"variant="secondary" className="w-full">
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

