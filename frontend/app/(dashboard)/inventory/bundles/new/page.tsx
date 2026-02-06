"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api/inventory";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AxiosError } from "axios";
import { BundleForm, BundleFormData } from "@/components/inventory/BundleForm";
import { useToast } from "@/lib/hooks/useToast";

export default function NewBundlePage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const [serverError, setServerError] = useState<string | null>(null);

    const createMutation = useMutation({
        mutationFn: (data: any) => {
            // Map frontend items format back to backend expectations
            const payload = {
                ...data,
                items: data.items.map((item: any) => ({
                    part_id: item.part_id,
                    quantity: item.quantity
                }))
            };
            return inventoryApi.createBundle(payload);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["service-bundles"] });
            toast({
                title: "Success",
                description: "Service bundle created successfully",
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
                    setServerError(fieldErrors || "Failed to create bundle. Please check the data.");
                }
            } else {
                setServerError("An unexpected error occurred.");
            }
        },
    });

    const onSubmit = async (data: BundleFormData) => {
        setServerError(null);
        createMutation.mutate(data);
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-12">
            <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-4">
                    <Link href="/inventory/bundles">
                        <Button variant="ghost" size="sm">
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">New Service Bundle</h1>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Create a reusable bundle of parts.
                        </p>
                    </div>
                </div>
            </div>

            {serverError && (
                <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 border border-red-200">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-800">{serverError}</p>
                </div>
            )}

            <BundleForm
                onSubmit={onSubmit}
                isSubmitting={createMutation.isPending}
                mode="create"
                onCancel={() => router.push("/inventory/bundles")}
            />
        </div>
    );
}
