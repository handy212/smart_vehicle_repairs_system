"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { workOrderPartsApi } from "@/lib/api/workorder-parts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { AxiosError } from "axios";
import InventoryPartSearch from "./InventoryPartSearch";
import { Part } from "@/lib/api/inventory";

import { useCurrency } from "@/lib/hooks/useCurrency";
const partSchema = z.object({
  inventory_part: z.number().optional(), // Phase 4 Integration
  part_number: z.string().min(1, "Part number is required"),
  part_name: z.string().min(1, "Part name is required"),
  description: z.string().optional(),
  quantity: z.number().min(0.01, "Quantity must be greater than 0"),
  unit_cost: z.number().min(0, "Unit cost must be 0 or greater"),
  markup_percentage: z.number().min(0).optional(),
});

type PartFormData = z.infer<typeof partSchema>;

interface AddPartDialogProps {
  workOrderId: number;
  workOrderStatus?: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddPartDialog({
    workOrderId, workOrderStatus, open, onClose, onSuccess }: AddPartDialogProps) {
    const { formatCurrency } = useCurrency();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setError,
    watch,
    setValue,
  } = useForm<PartFormData>({
    resolver: zodResolver(partSchema),
    defaultValues: {
      quantity: 1,
      unit_cost: 0,
      markup_percentage: 0,
    },
  });

  const quantity = watch("quantity");
  const unitCost = watch("unit_cost");
  const markup = watch("markup_percentage") || 0;
  const totalCost = quantity * unitCost * (1 + markup / 100);

  const createMutation = useMutation({
    mutationFn: (data: PartFormData) =>
      workOrderPartsApi.create({
        ...data,
        work_order: workOrderId,
        unit_cost: data.unit_cost.toString(),
        total_cost: totalCost.toFixed(2),
        status: "pending",
      }),
    onSuccess: () => {
      reset();
      setServerError(null);
      onSuccess();
    },
    onError: (error) => {
      if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data;
        Object.keys(errorData).forEach((field) => {
          if (field !== 'non_field_errors' && field !== 'detail') {
            const fieldError = Array.isArray(errorData[field])
              ? errorData[field][0]
              : errorData[field];
            setError(field as keyof PartFormData, {
              type: "server",
              message: fieldError,
            });
          }
        });
        if (errorData.non_field_errors) {
          setServerError(Array.isArray(errorData.non_field_errors) ? errorData.non_field_errors[0] : errorData.non_field_errors);
        } else if (errorData.detail) {
          setServerError(errorData.detail);
        }
      }
    },
  });

  const onSubmit = async (data: PartFormData) => {
    setServerError(null);
    await createMutation.mutateAsync(data);
  };

  const handleInventorySelect = (part: Part) => {
    setValue("inventory_part", part.id);
    setValue("part_number", part.part_number);
    setValue("part_name", part.name);
    setValue("description", part.description || "");

    // Cost logic:
    // If we have cost_price, use it.
    // If we have selling_price, try to deduce markup?
    // Or simpler: Use cost_price for 'unit_cost', and calculate markup to hit 'selling_price'.

    const costPrice = parseFloat(part.cost_price || "0");
    const sellingPrice = parseFloat(part.selling_price || "0");

    setValue("unit_cost", costPrice);

    if (costPrice > 0 && sellingPrice > costPrice) {
      const calculatedMarkup = ((sellingPrice - costPrice) / costPrice) * 100;
      // Round to 1 decimal
      setValue("markup_percentage", Math.round(calculatedMarkup * 10) / 10);
    } else {
      setValue("markup_percentage", 0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Part</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-2">
          <div className="mb-4 rounded-md border border-primary/15 bg-primary/5 p-4">
            <label className="mb-2 block text-sm font-medium text-primary">Search Inventory</label>
            <InventoryPartSearch onSelect={handleInventorySelect} />
            <p className="text-xs text-primary mt-2">
              Searching inventory will auto-fill the part details below. You can still edit them manually.
            </p>
          </div>

          {["approved", "in_progress", "paused"].includes(workOrderStatus || "") && (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-900">
              <p className="text-sm font-medium">This will be treated as additional work.</p>
              <p className="mt-1 text-xs">
                Because the customer has already approved the job, adding a new part will move the work order to additional work found and require approval before repairs continue.
              </p>
            </div>
          )}

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-border"></div>
            <span className="flex-shrink-0 mx-4 text-muted-foreground text-xs">OR ENTER MANUALLY</span>
            <div className="flex-grow border-t border-border"></div>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-6 pb-6">
          <input type="hidden" {...register("inventory_part", { valueAsNumber: true })} />

          <div className="space-y-4">
            {serverError && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive p-3 rounded text-sm">
                {serverError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="part_number" className="block text-sm font-medium text-foreground mb-2">
                  Part Number *
                </label>
                <Input
                  id="part_number"
                  {...register("part_number")}
                  className={`w-full ${errors.part_number ? "border-destructive" : ""}`}
                />
                {errors.part_number && (
                  <p className="mt-1 text-sm text-destructive">{errors.part_number.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="part_name" className="block text-sm font-medium text-foreground mb-2">
                  Part Name *
                </label>
                <Input
                  id="part_name"
                  {...register("part_name")}
                  className={`w-full ${errors.part_name ? "border-destructive" : ""}`}
                />
                {errors.part_name && (
                  <p className="mt-1 text-sm text-destructive">{errors.part_name.message}</p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-foreground mb-2">
                Description
              </label>
              <Textarea
                id="description"
                {...register("description")}
                rows={3}
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="quantity" className="block text-sm font-medium text-foreground mb-2">
                  Quantity *
                </label>
                <Input
                  id="quantity"
                  type="number"
                  {...register("quantity", { valueAsNumber: true })}
                  className={`w-full ${errors.quantity ? "border-destructive" : ""}`}
                />
                {errors.quantity && (
                  <p className="mt-1 text-sm text-destructive">{errors.quantity.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="unit_cost" className="block text-sm font-medium text-foreground mb-2">
                  Unit Cost (Buy Price) *
                </label>
                <Input
                  id="unit_cost"
                  type="number"
                  step="0.01"
                  {...register("unit_cost", { valueAsNumber: true })}
                  className={`w-full ${errors.unit_cost ? "border-destructive" : ""}`}
                />
                {errors.unit_cost && (
                  <p className="mt-1 text-sm text-destructive">{errors.unit_cost.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="markup_percentage" className="block text-sm font-medium text-foreground mb-2">
                  Markup %
                </label>
                <Input
                  id="markup_percentage"
                  type="number"
                  step="0.1"
                  {...register("markup_percentage", { valueAsNumber: true })}
                  className="w-full"
                />
              </div>
            </div>

            <div className="bg-muted p-3 rounded">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-foreground">Total Price (To Customer):</span>
                <span className="text-lg font-bold text-foreground">{formatCurrency(totalCost)}</span>
              </div>
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>
            {isSubmitting ? "Adding..." : "Add Part"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
