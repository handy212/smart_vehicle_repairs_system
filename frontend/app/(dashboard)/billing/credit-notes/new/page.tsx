"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { customersApi } from "@/lib/api/customers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label"; // Label is a standard HTML element or imported if bespoke
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/lib/hooks/useToast";
import Link from "next/link";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { useCurrency } from "@/lib/hooks/useCurrency";
const creditNoteSchema = z.object({
    customer: z.number().min(1, "Customer is required"),
    invoice: z.number().optional().nullable(),
    credit_date: z.string(),
    reason: z.string().optional(),
    notes: z.string().optional(),
    internal_notes: z.string().optional(),
    line_items: z.array(z.object({
        description: z.string().min(1, "Description is required"),
        quantity: z.number().min(0.01, "Quantity must be greater than 0"),
        unit_price: z.number().min(0, "Price cannot be negative"),
        is_taxable: z.boolean(),
    })).min(1, "At least one item is required"),
});

type CreditNoteFormData = z.infer<typeof creditNoteSchema>;

export default function NewCreditNotePage() {
    const { formatCurrency, currencySymbol } = useCurrency();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");

    // Check for pre-selected customer or invoice from URL
    const customerId = searchParams.get("customer") ? parseInt(searchParams.get("customer")!) : undefined;
    const invoiceId = searchParams.get("invoice") ? parseInt(searchParams.get("invoice")!) : undefined;

    const { register, control, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<CreditNoteFormData>({
        resolver: zodResolver(creditNoteSchema),
        defaultValues: {
            customer: customerId || 0,
            invoice: invoiceId,
            credit_date: new Date().toISOString().split('T')[0],
            line_items: [{ description: "Credit Adjustment", quantity: 1, unit_price: 0, is_taxable: false }],
        },
    });

    const { fields, append, remove } = useFieldArray({
        control,
        name: "line_items",
    });

    // Calculate totals
    const lineItems = watch("line_items");
    const subtotal = lineItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

    // Search customers
    const { data: customers } = useQuery({
        queryKey: ["customers", searchTerm],
        queryFn: () => customersApi.list({ search: searchTerm }),
        enabled: true,
    });

    // Fetch invoices for selected customer
    const selectedCustomerId = watch("customer");
    const { data: customerInvoices } = useQuery({
        queryKey: ["customer-invoices", selectedCustomerId],
        queryFn: () => billingApi.invoices.list({ customer: selectedCustomerId }),
        enabled: !!selectedCustomerId,
    });

    const createMutation = useMutation({
        mutationFn: (data: CreditNoteFormData) => {
            // Transform data to match API requirements
            const apiData = {
                ...data,
                invoice: data.invoice ? data.invoice : undefined, // Convert null to undefined
                line_items: data.line_items.map(item => ({
                    ...item,
                    unit_price: String(item.unit_price),
                    is_taxable: !!item.is_taxable
                }))
            };

            return billingApi.creditNotes.create(apiData as any);
        },
        onSuccess: (data) => {
            toast({
                title: "Success",
                description: "Credit note created successfully",
            });
            queryClient.invalidateQueries({ queryKey: ["creditNotes"] });
            router.push(`/billing/credit-notes/${data.id}`);
        },

        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.response?.data?.error || "Failed to create credit note",
                variant: "destructive",
            });
        },
    });

    const onSubmit = (data: CreditNoteFormData) => {
        createMutation.mutate(data);
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/billing/credit-notes">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Create Credit Note</h1>
                    <p className="text-sm text-muted-foreground">Issue a credit to a customer</p>
                </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <Label>Customer</Label>
                                    {/* Very basic search input since Select is simple */}
                                    <input
                                        className="text-xs border rounded p-1"
                                        placeholder="Search..."
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                    />
                                </div>
                                {/* Fallback to simple Select for customers */}
                                <Select
                                    value={selectedCustomerId?.toString() || ""}
                                    onValueChange={(val) => {
                                        setValue("customer", val ? parseInt(val) : 0);
                                        setValue("invoice", null); // Reset invoice when customer changes
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Customer" />
                                    </SelectTrigger>
                                    <SelectContent>

                                        {customers?.results?.map((c: any) => (
                                            <SelectItem key={c.id} value={c.id.toString()}>
                                                {c.first_name} {c.last_name} {c.company_name ? `(${c.company_name})` : ''}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {errors.customer && <p className="text-sm text-red-500">{errors.customer.message}</p>}
                            </div>

                            <div className="space-y-2">
                                <Label>Original Invoice (Optional)</Label>
                                <Select
                                    value={watch("invoice")?.toString() || ""}
                                    onValueChange={(val) => {
                                        setValue("invoice", val ? parseInt(val) : null);
                                    }}
                                    disabled={!selectedCustomerId}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="None" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">None</SelectItem>
                                        {customerInvoices?.results.map((inv) => (
                                            <SelectItem key={inv.id} value={inv.id.toString()}>
                                                #{inv.invoice_number} - {inv.invoice_date} (${inv.total})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Credit Date</Label>
                                <Input type="date" {...register("credit_date")} />
                            </div>

                            <div className="space-y-2">
                                <Label>Reason</Label>
                                <Input placeholder="e.g. Returned Goods, Pricing Adjustment" {...register("reason")} />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Notes</Label>
                                <Textarea placeholder="Notes visible to customer" {...register("notes")} />
                            </div>
                            <div className="space-y-2">
                                <Label>Internal Notes</Label>
                                <Textarea placeholder="Internal only" {...register("internal_notes")} />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>Line Items</CardTitle>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => append({ description: "", quantity: 1, unit_price: 0, is_taxable: false })}
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Item
                        </Button>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {fields.map((field, index) => (
                            <div key={field.id} className="grid grid-cols-12 gap-4 items-end border-b pb-4 last:border-0 last:pb-0">
                                <div className="col-span-12 md:col-span-5 space-y-2">
                                    <Label className={index !== 0 ? "sr-only" : ""}>Description</Label>
                                    <Input {...register(`line_items.${index}.description`)} placeholder="Description" />
                                    {errors.line_items?.[index]?.description && (
                                        <p className="text-xs text-red-500">{errors.line_items[index]?.description?.message}</p>
                                    )}
                                </div>
                                <div className="col-span-4 md:col-span-2 space-y-2">
                                    <Label className={index !== 0 ? "sr-only" : ""}>Qty</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        {...register(`line_items.${index}.quantity`, { valueAsNumber: true })}
                                    />
                                </div>
                                <div className="col-span-4 md:col-span-3 space-y-2">
                                    <Label className={index !== 0 ? "sr-only" : ""}>Price</Label>
                                    <div className="relative">
                                        <span className="absolute left-2.5 top-2.5 text-muted-foreground">{currencySymbol || '$'}</span>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            className="pl-6"
                                            {...register(`line_items.${index}.unit_price`, { valueAsNumber: true })}
                                        />
                                    </div>
                                </div>
                                <div className="col-span-4 md:col-span-2 flex justify-end pb-2">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                        onClick={() => remove(index)}
                                        disabled={fields.length === 1}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}

                        <div className="flex justify-end pt-4">
                            <div className="w-64 space-y-2">
                                <div className="flex justify-between text-lg font-bold">
                                    <span>Total</span>
                                    <span>{formatCurrency(subtotal)}</span>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="flex justify-end gap-4">
                    <Button type="button" variant="outline" onClick={() => router.back()}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? "Creating..." : "Create Credit Note"}
                    </Button>
                </div>
            </form>
        </div>
    );
}
