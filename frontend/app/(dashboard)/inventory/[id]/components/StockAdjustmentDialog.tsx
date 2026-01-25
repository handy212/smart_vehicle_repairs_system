"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { inventoryApi, Part } from "@/lib/api/inventory";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { AxiosError } from "axios";

const adjustmentSchema = z.object({
  quantity: z.number().int("Quantity must be a whole number"),
  reason: z.string().min(1, "Reason is required"),
  notes: z.string().optional(),
});

type AdjustmentFormData = z.infer<typeof adjustmentSchema>;

interface StockAdjustmentDialogProps {
  part: Part;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function StockAdjustmentDialog({
  part,
  open,
  onClose,
  onSuccess,
}: StockAdjustmentDialogProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<"increase" | "decrease">("increase");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setError,
    watch,
    setValue,
  } = useForm<AdjustmentFormData>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      reason: "manual_adjustment",
    },
  });

  const quantity = watch("quantity");

  const adjustmentMutation = useMutation({
    mutationFn: (data: AdjustmentFormData) => {
      // Calculate the actual quantity change based on type
      const actualQuantity = adjustmentType === "increase" ? data.quantity : -data.quantity;
      return inventoryApi.adjustStock(part.id, {
        quantity: actualQuantity,
        reason: data.reason,
        notes: data.notes,
      });
    },
    onSuccess: () => {
      reset();
      setServerError(null);
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
            setError(field as keyof AdjustmentFormData, {
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

  const onSubmit = async (data: AdjustmentFormData) => {
    setServerError(null);
    await adjustmentMutation.mutateAsync(data);
  };

  const newStockLevel =
    adjustmentType === "increase"
      ? (part.quantity_in_stock || 0) + (quantity || 0)
      : (part.quantity_in_stock || 0) - (quantity || 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Adjust Stock - {part.name}</DialogTitle>
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
                  <p className="text-sm font-medium text-gray-500">Current Stock</p>
                  <p className="text-2xl font-bold text-gray-900">{part.quantity_in_stock || 0}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Available</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {part.available_quantity || part.quantity_in_stock || 0}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="adjustment_type" className="block text-sm font-medium text-gray-700 mb-2">
                Adjustment Type *
              </label>
              <Select
                value={adjustmentType}
                onValueChange={(val) => setAdjustmentType(val as "increase" | "decrease")}
              >
                <SelectTrigger id="adjustment_type" className="w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="increase">Increase Stock</SelectItem>
                  <SelectItem value="decrease">Decrease Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 mb-2">
                Quantity *
              </label>
              <Input
                id="quantity"
                type="number"
                {...register("quantity", { valueAsNumber: true })}
                className={`w-full ${errors.quantity ? "border-red-500" : ""}`}
                min={1}
              />
              {errors.quantity && (
                <p className="mt-1 text-sm text-red-600">{errors.quantity.message}</p>
              )}
              {quantity && (
                <p className="mt-1 text-sm text-gray-500">
                  New stock level will be: <strong>{newStockLevel}</strong>
                  {newStockLevel < 0 && (
                    <span className="text-red-600 ml-2">(Warning: Negative stock!)</span>
                  )}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-2">
                Reason *
              </label>
              <Select value={watch("reason")} onValueChange={(val) => {
              setValue("reason", val, { shouldValidate: true });
            }}>
              <SelectTrigger id="reason" className={`w-full ${errors.reason ? "border-red-500" : ""}`}>
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual_adjustment">Manual Adjustment</SelectItem>
                <SelectItem value="physical_count">Physical Count</SelectItem>
                <SelectItem value="damage">Damage</SelectItem>
                <SelectItem value="theft">Theft</SelectItem>
                <SelectItem value="correction">Correction</SelectItem>
                <SelectItem value="return">Return</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
              {errors.reason && (
                <p className="mt-1 text-sm text-red-600">{errors.reason.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
                Notes
              </label>
              <Textarea id="notes" {...register("notes")} rows={3} className="w-full" placeholder="Additional notes..." />
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit(onSubmit)} disabled={isSubmitting || !!(quantity && newStockLevel < 0)}>
            {isSubmitting ? "Adjusting..." : "Adjust Stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

