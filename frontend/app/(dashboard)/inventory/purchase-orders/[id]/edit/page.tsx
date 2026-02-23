"use client";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { inventoryApi, PurchaseOrder, PurchaseOrderItem } from "@/lib/api/inventory";
import PurchaseOrderItemsManager from "../../components/PurchaseOrderItemsManager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/lib/hooks/useToast";

const formSchema = z.object({
    supplier: z.string().min(1, "Supplier is required"),
    order_date: z.string().min(1, "Order date is required"),
    expected_delivery_date: z.string().optional(),
    notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function EditPurchaseOrderPage() {
    const router = useRouter();
    const params = useParams();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const id = parseInt(params.id as string);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            supplier: "",
            order_date: new Date().toISOString().split("T")[0],
            expected_delivery_date: "",
            notes: "",
        },
    });

    const { data: purchaseOrder, isLoading: isLoadingPO } = useQuery({
        queryKey: ["purchase-order", id],
        queryFn: () => inventoryApi.getPurchaseOrder(id),
        enabled: !isNaN(id),
    });

    const { data: suppliersResponse } = useQuery({
        queryKey: ["suppliers"],
        queryFn: () => inventoryApi.listSuppliers({ is_active: true }),
    });

    const suppliers = Array.isArray(suppliersResponse)
        ? suppliersResponse
        : suppliersResponse?.results || [];

    useEffect(() => {
        if (purchaseOrder) {
            form.reset({
                supplier: typeof purchaseOrder.supplier === 'object' ? purchaseOrder.supplier.id.toString() : purchaseOrder.supplier.toString(),
                order_date: purchaseOrder.order_date,
                expected_delivery_date: purchaseOrder.expected_delivery_date || "",
                notes: purchaseOrder.notes || "",
            });
        }
    }, [purchaseOrder, form]);

    const updateMutation = useMutation({
        mutationFn: (data: Partial<PurchaseOrder>) => inventoryApi.updatePurchaseOrder(id, data),
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["purchase-order", id] });
            queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
            toast({
                title: "Success",
                description: "Purchase order updated successfully",
            });
            router.push(`/inventory/purchase-orders/${id}`);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onError: (error: any) => {
        toast({
            title: "Error",
            description: error.response?.data?.detail || "Failed to update purchase order",
            variant: "destructive",
        });
    },
    });

function onSubmit(values: FormValues) {
    updateMutation.mutate({
        supplier: parseInt(values.supplier),
        order_date: values.order_date,
        expected_delivery_date: values.expected_delivery_date || undefined,
        notes: values.notes,
    });
}

if (isNaN(id)) {
    return <div>Invalid Purchase Order ID</div>;
}

if (isLoadingPO) {
    return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
    );
}

return (
    <div className="space-y-6">
        <div className="flex items-center space-x-4">
            <Link href={`/inventory/purchase-orders/${id}`}>
                <Button variant="secondary">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                </Button>
            </Link>
            <div>
                <h1 className="text-3xl font-bold text-foreground">Edit Purchase Order</h1>
                <p className="text-sm text-muted-foreground mt-1">Update purchase order details</p>
            </div>
        </div>

        <Card>
            <CardHeader>
                <CardTitle>Order Details</CardTitle>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        {/* ... fields ... */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField
                                control={form.control}
                                name="supplier"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Supplier</FormLabel>
                                        <FormControl>
                                            <select
                                                {...field}
                                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                <option value="">Select a supplier</option>
                                                {suppliers.map((supplier) => (
                                                    <option key={supplier.id} value={supplier.id.toString()}>
                                                        {supplier.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="order_date"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Order Date</FormLabel>
                                        <FormControl>
                                            <Input type="date" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="expected_delivery_date"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Expected Delivery Date</FormLabel>
                                        <FormControl>
                                            <Input type="date" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="notes"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Notes</FormLabel>
                                    <FormControl>
                                        <Textarea placeholder="Add any notes here..." {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="flex justify-end">
                            <Button type="submit" disabled={updateMutation.isPending}>
                                <Save className="w-4 h-4 mr-2" />
                                {updateMutation.isPending ? "Saving..." : "Save Changes"}
                            </Button>
                        </div>
                    </form>
                </Form>
            </CardContent>
        </Card>

        {purchaseOrder && (
            <Card>
                <CardContent className="pt-6">
                    <PurchaseOrderItemsManager purchaseOrder={purchaseOrder} />
                </CardContent>
            </Card>
        )}
    </div>
);
}
