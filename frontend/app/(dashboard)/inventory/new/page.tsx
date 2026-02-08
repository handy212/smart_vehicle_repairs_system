"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryApi, Part } from "@/lib/api/inventory";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AxiosError } from "axios";
import { PartForm, PartFormData } from "@/components/inventory/PartForm";

export default function NewPartPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: FormData | Partial<Part>) => {
      return inventoryApi.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      router.push("/inventory");
    },
    onError: (error) => {
      if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data;
        if (errorData.non_field_errors) {
          setServerError(
            Array.isArray(errorData.non_field_errors)
              ? errorData.non_field_errors[0]
              : errorData.non_field_errors
          );
        } else if (errorData.detail) {
          setServerError(errorData.detail);
        } else {
          setServerError("An error occurred. Check the form for details.");
        }
      } else {
        setServerError("An unexpected error occurred. Please try again.");
      }
    },
  });

  const onSubmit = async (data: PartFormData, imageFile: File | null) => {
    setServerError(null);
    try {
      // Exclude quantity_in_stock - stock is managed via StockItem per branch
      const { quantity_in_stock, ...dataWithoutStock } = data as any;

      if (imageFile) {
        const formData = new FormData();
        Object.keys(dataWithoutStock).forEach((key) => {
          const value = dataWithoutStock[key as keyof typeof dataWithoutStock];
          if (value !== undefined && value !== null) {
            formData.append(key, value.toString());
          }
        });
        formData.append('image', imageFile);
        await createMutation.mutateAsync(formData);
      } else {
        const apiData: Partial<Part> = {
          ...dataWithoutStock,
          cost_price: data.cost_price?.toString(),
          selling_price: data.selling_price?.toString(),
          list_price: data.list_price?.toString(),
          weight: data.weight?.toString(),
          markup_percentage: data.markup_percentage?.toString(),
          core_charge: data.core_charge?.toString(),
        };
        await createMutation.mutateAsync(apiData);
      }
    } catch (error) {
      // Handled in mutation
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/inventory">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">New Part</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Add a new part to inventory
            </p>
          </div>
        </div>
      </div>

      {serverError && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800 dark:text-red-300">{serverError}</p>
        </div>
      )}

      <PartForm
        onSubmit={onSubmit}
        isSubmitting={createMutation.isPending}
        mode="create"
        onCancel={() => router.push("/inventory")}
      />
    </div>
  );
}
