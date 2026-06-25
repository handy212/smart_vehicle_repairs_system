"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AxiosError } from "axios";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api/inventory";
import { RevenueProductSelect } from "@/components/accounting/RevenueProductSelect";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, AlertCircle } from "lucide-react";

const categorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  parent: z.number().optional().nullable(),
  is_active: z.boolean(),
  revenue_product: z.number().optional().nullable(),
});

type CategoryFormData = z.infer<typeof categorySchema>;

export default function EditCategoryPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const categoryId = Number(params.id);

  const { data: category, isLoading } = useQuery({
    queryKey: ["part-category", categoryId],
    queryFn: () => inventoryApi.getCategory(categoryId),
    enabled: Number.isFinite(categoryId),
  });

  const { data: rootCategories = [] } = useQuery({
    queryKey: ["root-categories"],
    queryFn: () => inventoryApi.rootCategories(),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
    setError,
    setValue,
    watch,
  } = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
    defaultValues: { is_active: true, parent: null },
  });

  useEffect(() => {
    if (!category) return;
    reset({
      name: category.name,
      description: category.description || "",

      parent: (category.parent as any) || null,
      is_active: category.is_active,
      revenue_product: category.revenue_product ?? null,
    });
  }, [category, reset]);

  const updateMutation = useMutation({
    mutationFn: (data: CategoryFormData) => {
      const apiData = { ...data, parent: data.parent || undefined };

      return inventoryApi.updateCategory(categoryId, apiData as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["part-categories"] });
      queryClient.invalidateQueries({ queryKey: ["root-categories"] });
      queryClient.invalidateQueries({ queryKey: ["part-category", categoryId] });
      router.push("/inventory/categories");
    },

    onError: (error: any) => {
      console.error("Error updating category:", error);
      if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data;
        Object.keys(errorData).forEach((field) => {
          const fieldError = Array.isArray(errorData[field])
            ? errorData[field][0]
            : errorData[field];
          setError(field as keyof CategoryFormData, { type: "server", message: fieldError });
        });
        if (errorData.detail || errorData.non_field_errors) {
          setServerError(
            errorData.detail ||
            (Array.isArray(errorData.non_field_errors)
              ? errorData.non_field_errors[0]
              : errorData.non_field_errors) ||
            "Failed to update category"
          );
        }
      } else {
        setServerError("Failed to update category. Please try again.");
      }
    },
  });

  const onSubmit = async (data: CategoryFormData) => {
    setServerError(null);
    try {
      await updateMutation.mutateAsync(data);
    } catch {
      // handled in onError
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (!category) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Category not found</h1>
        <Link href="/inventory/categories">
          <Button variant="secondary">Back</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/inventory/categories">
          <Button variant="secondary">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Edit Category</h1>
          <p className="text-sm text-muted-foreground mt-1">{category.full_path || category.name}</p>
        </div>
      </div>

      {serverError && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded flex items-center text-sm font-medium">
          <AlertCircle className="w-4 h-4 mr-2" />
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Category Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Name *</label>
                <Input {...register("name")} placeholder="Category name" />
                {errors.name && <p className="text-destructive text-xs mt-1">{errors.name.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Description</label>
                <Textarea {...register("description")} placeholder="Category description" rows={3} />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Parent Category</label>
                <select
                  {...register("parent", { valueAsNumber: true })}
                  className="w-full rounded-md border border-border px-3 py-2 text-sm"
                >
                  <option value="">None (Root Category)</option>
                  {rootCategories
                    .filter((cat) => cat.id !== categoryId)
                    .map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.full_path || cat.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Revenue product</label>
                <RevenueProductSelect
                  value={watch("revenue_product") ?? null}
                  onChange={(value) => setValue("revenue_product", value)}
                  revenueClass="part"
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Default QuickBooks income account for parts in this category.
                </p>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  {...register("is_active")}
                  className="rounded border-border text-primary focus:ring-primary"
                />
                <label className="ml-2 text-sm text-foreground">Active</label>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end space-x-4 mt-6">
          <Link href="/inventory/categories">
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}


