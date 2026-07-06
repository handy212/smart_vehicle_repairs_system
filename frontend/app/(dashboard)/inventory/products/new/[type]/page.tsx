"use client";

import { use, useMemo, useState } from "react";
import { useRouter, notFound } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { inventoryApi, Part } from "@/lib/api/inventory";
import { Button } from "@/components/ui/button";
import { PartForm, PartFormData } from "@/components/inventory/PartForm";
import { BundleForm, BundleFormData } from "@/components/inventory/BundleForm";
import { ProductServiceCreateLayout } from "@/components/inventory/ProductServiceCreateLayout";
import { getProductServiceTypeBySlug } from "@/components/inventory/product-service-types";
import { useToast } from "@/lib/hooks/useToast";
import { useQuickBooksConnection } from "@/hooks/useQuickBooksConnection";

export default function NewProductServiceTypePage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type: urlSlug } = use(params);
  const typeOption = getProductServiceTypeBySlug(urlSlug);
  const productType = typeOption?.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isLinked: isQboConnected, isOperational: isQboCanSync, connectionIssue: qboConnectionIssue } = useQuickBooksConnection();
  const [serverError, setServerError] = useState<string | null>(null);
  const formId = "product-service-create-form";

  const createPartMutation = useMutation({
    mutationFn: (data: FormData | Partial<Part>) => inventoryApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast({
        title: "Product saved",
        description: isQboConnected
          ? "Syncing to QuickBooks automatically…"
          : "Saved locally. Connect QuickBooks in Integrations to sync items.",
      });
      router.push("/inventory");
    },
    onError: (error: AxiosError) => {
      setServerError(formatApiError(error));
    },
  });

  const createBundleMutation = useMutation({
    mutationFn: (data: BundleFormData) =>
      inventoryApi.createBundle({
        ...data,
        items: data.items.map((item) => ({
          part_id: item.part_id,
          quantity: item.quantity,
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-bundles"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast({ title: "Bundle created", description: "Your bundle is ready to use." });
      router.push("/inventory/bundles");
    },
    onError: (error: AxiosError) => {
      setServerError(formatApiError(error));
    },
  });

  const apiItemType = typeOption?.apiItemType;

  const defaultPartValues = useMemo((): Partial<PartFormData> | undefined => {
    if (!apiItemType) return undefined;
    return { item_type: apiItemType };
  }, [apiItemType]);

  if (!typeOption || !productType) {
    notFound();
  }

  const submitPart = async (data: PartFormData, imageFile: File | null) => {
    setServerError(null);
    const { quantity_in_stock: _ignored, ...rest } = data as PartFormData & { quantity_in_stock?: number };

    const payload: Partial<Part> = {
      ...rest,
      item_type: apiItemType,
      cost_price: (rest.cost_price ?? rest.selling_price ?? 0.01).toString(),
      selling_price: (rest.selling_price ?? rest.cost_price ?? 0.01).toString(),
      list_price: rest.list_price?.toString(),
      weight: rest.weight?.toString(),
      markup_percentage: rest.markup_percentage?.toString(),
      core_charge: rest.core_charge?.toString(),
    };

    if (imageFile) {
      const formData = new FormData();
      Object.entries(payload).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, String(value));
        }
      });
      formData.append("image", imageFile);
      await createPartMutation.mutateAsync(formData);
      return;
    }

    await createPartMutation.mutateAsync(payload);
  };

  const submitBundle = async (data: BundleFormData) => {
    setServerError(null);
    await createBundleMutation.mutateAsync(data);
  };

  const isSaving = createPartMutation.isPending || createBundleMutation.isPending;

  return (
    <ProductServiceCreateLayout
      productType={productType}
      error={serverError}
      actions={
        productType !== "bundle" ? (
          <Button type="submit" form={formId} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save product/service"}
          </Button>
        ) : undefined
      }
    >
      {productType === "bundle" ? (
        <BundleForm
          mode="create"
          isSubmitting={isSaving}
          onSubmit={submitBundle}
          onCancel={() => router.push("/inventory")}
          showHeader={false}
        />
      ) : (
        <PartForm
          formId={formId}
          mode="create"
          productType={apiItemType}
          initialData={defaultPartValues}
          onSubmit={submitPart}
        />
      )}
    </ProductServiceCreateLayout>
  );
}

function formatApiError(error: AxiosError): string {
  const data = error.response?.data as Record<string, unknown> | string | undefined;
  if (!data) return "An unexpected error occurred.";
  if (typeof data === "string") return data;
  if (typeof data.detail === "string") return data.detail;
  if (Array.isArray(data.non_field_errors) && data.non_field_errors[0]) {
    return String(data.non_field_errors[0]);
  }
  const fieldErrors = Object.entries(data)
    .map(([field, msgs]) => {
      const label = field.replace(/_/g, " ");
      return `${label}: ${Array.isArray(msgs) ? msgs[0] : msgs}`;
    })
    .join(". ");
  return fieldErrors || "Please check the form and try again.";
}
