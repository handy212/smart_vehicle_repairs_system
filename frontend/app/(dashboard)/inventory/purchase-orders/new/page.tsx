"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { inventoryApi, PurchaseOrder } from "@/lib/api/inventory";
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

export default function NewPurchaseOrderPage() {
    const router = useRouter();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            supplier: "",
            order_date: new Date().toISOString().split("T")[0],
            expected_delivery_date: "",
            notes: "",
        },
    });

    const { data: suppliersResponse } = useQuery({
        queryKey: ["suppliers"],
        queryFn: () => inventoryApi.listSuppliers({ is_active: true }),
    });

    const suppliers = Array.isArray(suppliersResponse)
        ? suppliersResponse
        : suppliersResponse?.results || [];

    const createMutation = useMutation({
        mutationFn: (data: Partial<PurchaseOrder>) => inventoryApi.createPurchaseOrder(data),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
            toast({
                title: "Success",
                description: "Purchase order created successfully",
            });
            router.push(`/inventory/purchase-orders/${data.id}`);
        },

        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.response?.data?.detail || "Failed to create purchase order",
                variant: "destructive",
            });
        },
    });

    function onSubmit(values: FormValues) {
        createMutation.mutate({
            supplier: parseInt(values.supplier),
            order_date: values.order_date,
            expected_delivery_date: values.expected_delivery_date || undefined,
            notes: values.notes,
            status: "draft",
        });
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center space-x-4">
                <Link href="/inventory/purchase-orders">
                    <Button variant="secondary">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back
                    </Button>
                </Link>
                <div>
                    <h1 className="text-3xl font-bold text-foreground">New Purchase Order</h1>
                    <p className="text-sm text-muted-foreground mt-1">Create a new purchase order</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <Card className="border-t shadow-sm">
                        <CardHeader className="py-4 border-b bg-muted/30">
                            <CardTitle className="text-sm font-semibold">Order Information</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <FormField
                                            control={form.control}
                                            name="supplier"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs font-semibold uppercase text-muted-foreground">Supplier *</FormLabel>
                                                    <FormControl>
                                                        <select
                                                            {...field}
                                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
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
                                                    <FormLabel className="text-xs font-semibold uppercase text-muted-foreground">Order Date *</FormLabel>
                                                    <FormControl>
                                                        <Input type="date" {...field} className="h-10 transition-colors" />
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
                                                    <FormLabel className="text-xs font-semibold uppercase text-muted-foreground">Expected Delivery Date</FormLabel>
                                                    <FormControl>
                                                        <Input type="date" {...field} className="h-10 transition-colors" />
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
                                                <FormLabel className="text-xs font-semibold uppercase text-muted-foreground">Notes & Instructions</FormLabel>
                                                <FormControl>
                                                    <Textarea
                                                        placeholder="Add any specific instructions for the supplier..."
                                                        {...field}
                                                        className="min-h-[120px] resize-none transition-colors focus:bg-card"
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <div className="flex justify-end pt-4 border-t">
                                        <Button type="submit" size="lg" disabled={createMutation.isPending} className="min-w-[200px]">
                                            <Save className="w-4 h-4 mr-2" />
                                            {createMutation.isPending ? "Creating..." : "Initialize Order"}
                                        </Button>
                                    </div>
                                </form>
                            </Form>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
