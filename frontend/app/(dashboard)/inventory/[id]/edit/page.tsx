"use client";

import { useRouter, useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { inventoryApi, Part } from "@/lib/api/inventory";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AxiosError } from "axios";
import { PartForm, PartFormData } from "@/components/inventory/PartForm";
import { Card, CardContent } from "@/components/ui/card";

export default function EditPartPage() {
  const router = useRouter();
  const params = useParams();
  const partId = parseInt(params.id as string);
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const { data: part, isLoading } = useQuery({
    queryKey: ["part", partId],
    queryFn: () => inventoryApi.get(partId),
  });

  const updateMutation = useMutation({
    mutationFn: (data: FormData | Partial<Part>) => {
      return inventoryApi.update(partId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["part", partId] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      router.push(`/inventory/${partId}`);
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
        await updateMutation.mutateAsync(formData);
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
        await updateMutation.mutateAsync(apiData);
      }
    } catch (error) {
      // Handled within mutation
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!part) {
    return (
      <div className="space-y-4">
        <Link href="/inventory">
          <Button variant="secondary">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <Card>
          <CardContent className="pt-6">
            <p className="text-red-600">Part not found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const initialData: Partial<PartFormData> & { image?: string } = {
    part_number: part.part_number,
    name: part.name || "",
    description: part.description || "",
    category: typeof part.category === 'object' && part.category !== null ? part.category.id : (part.category || 0),
    branch: typeof part.branch === 'object' && part.branch !== null ? part.branch.id : (part.branch || undefined),
    manufacturer: part.manufacturer || "",
    manufacturer_part_number: part.manufacturer_part_number || "",
    preferred_supplier: typeof part.preferred_supplier === 'object' && part.preferred_supplier !== null ? part.preferred_supplier.id : (part.preferred_supplier || undefined),
    // quantity_in_stock removed - stock is managed via StockItem per branch
    reorder_point: part.reorder_point || 10,
    reorder_quantity: part.reorder_quantity || 20,
    minimum_stock: part.minimum_stock || 5,
    maximum_stock: part.maximum_stock || undefined,
    unit: (part.unit as any) || "piece",
    cost_price: part.cost_price ? parseFloat(part.cost_price) : undefined,
    selling_price: part.selling_price ? parseFloat(part.selling_price) : undefined,
    markup_percentage: part.markup_percentage ? parseFloat(part.markup_percentage) : 0,
    list_price: part.list_price ? parseFloat(part.list_price) : undefined,
    bin_location: part.bin_location || "",
    shelf: part.shelf || "",
    weight: part.weight ? parseFloat(part.weight) : undefined,
    dimensions: part.dimensions || "",
    compatible_makes: part.compatible_makes || "",
    compatible_models: part.compatible_models || "",
    compatible_years: part.compatible_years || "",
    warranty_months: part.warranty_months || undefined,
    warranty_notes: part.warranty_notes || "",
    is_active: part.is_active ?? true,
    is_taxable: part.is_taxable ?? true,
    is_core: part.is_core ?? false,
    core_charge: part.core_charge ? parseFloat(part.core_charge) : 0,
    image: part.image,
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/inventory/${partId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Edit Part</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Update part information
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
        initialData={initialData}
        onSubmit={onSubmit}
        isSubmitting={updateMutation.isPending}
        mode="edit"
        onCancel={() => router.push(`/inventory/${partId}`)}
      />
    </div>
  );
}
