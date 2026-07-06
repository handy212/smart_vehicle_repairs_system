"use client";

import { useRouter, useParams } from "next/navigation";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api/inventory";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AxiosError } from "axios";
import { BundleForm, BundleFormData } from "@/components/inventory/BundleForm";
import { useToast } from "@/lib/hooks/useToast";

export default function EditBundlePage() {
    const router = useRouter();
    const { id } = useParams();
    const bundleId = Number(id);
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const [serverError, setServerError] = useState<string | null>(null);

    const { data: bundle, isLoading: isLoadingBundle } = useQuery({
        queryKey: ["service-bundle", bundleId],
        queryFn: () => inventoryApi.getBundle(bundleId),
        enabled: !!bundleId,
    });

    const updateMutation = useMutation({

        mutationFn: (data: any) => {
            const payload = {
                ...data,

                items: data.items.map((item: any) => ({
                    part_id: item.part_id,
                    quantity: item.quantity
                }))
            };
            return inventoryApi.updateBundle(bundleId, payload);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["service-bundles"] });
            queryClient.invalidateQueries({ queryKey: ["service-bundle", bundleId] });
            toast({
                title: "Success",
                description: "Service bundle updated successfully",
            });
            router.push("/inventory/bundles");
        },
        onError: (error) => {
            if (error instanceof AxiosError && error.response?.data) {
                const data = error.response.data;
                if (typeof data === 'string') {
                    setServerError(data);
                } else if (data.detail) {
                    setServerError(data.detail);
                } else {
                    // Format field-level errors
                    const fieldErrors = Object.entries(data)
                        .map(([field, msgs]) => {
                            const label = field.charAt(0).toUpperCase() + field.slice(1).replace('_', ' ');
                            return `${label}: ${Array.isArray(msgs) ? msgs[0] : msgs}`;
                        })
                        .join('. ');
                    setServerError(fieldErrors || "Failed to update bundle. Please check the data.");
                }
            } else {
                setServerError("An unexpected error occurred.");
            }
        },
    });

    const onSubmit = async (data: BundleFormData) => {
        setServerError(null);
        updateMutation.mutate(data);
    };

    if (isLoadingBundle) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
                <p className="text-sm text-muted-foreground">Loading bundle details...</p>
            </div>
        );
    }

    if (!bundle) {
        return (
            <div className="text-center py-12">
                <p className="text-destructive">Bundle not found.</p>
                <Link href="/inventory/bundles">
                    <Button variant="link">Back to bundles</Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-12">
            <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-4">
                    <Link href="/inventory/bundles">
                        <Button variant="ghost" size="sm">
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">Edit Service Bundle</h1>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Update bundle details and parts.
                        </p>
                    </div>
                </div>
            </div>

            {serverError && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                    <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-destructive">{serverError}</p>
                </div>
            )}

            <BundleForm
                initialData={bundle}
                onSubmit={onSubmit}
                isSubmitting={updateMutation.isPending}
                mode="edit"
                onCancel={() => router.push("/inventory/bundles")}
            />
        </div>
    );
}
