"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import * as z from "zod";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";

import { billingApi, Bill } from "@/lib/api/billing";
import { branchesApi } from "@/lib/api/branches";
import { inventoryApi } from "@/lib/api/inventory";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useToast } from "@/lib/hooks/useToast";

const lineItemSchema = z.object({
    description: z.string().min(1, "Description is required"),
    quantity: z.number().min(1, "Quantity must be at least 1"),
    unit_price: z.number().min(0, "Price must be non-negative"),
    expense_category: z.string().optional(),
    inventory_item: z.number().optional(),
});

const formSchema = z.object({
    vendor: z.string().min(1, "Vendor is required"),
    branch: z.string().min(1, "Branch is required"),
    purchase_order: z.string().optional(),
    reference_number: z.string().optional(),
    bill_date: z.string().min(1, "Bill date is required"),
    due_date: z.string().min(1, "Due date is required"),
    terms: z.string().optional(),
    notes: z.string().optional(),
    currency: z.string().min(1),
    line_items: z.array(lineItemSchema).min(1, "At least one line item is required"),
});

type FormValues = z.infer<typeof formSchema>;

export default function EditBillPage() {
    const params = useParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { formatCurrency } = useCurrency();
    const id = Number.parseInt(params.id as string, 10);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            vendor: "",
            branch: "",
            purchase_order: "",
            reference_number: "",
            bill_date: format(new Date(), "yyyy-MM-dd"),
            due_date: format(new Date(), "yyyy-MM-dd"),
            terms: "",
            notes: "",
            currency: "USD",
            line_items: [{ description: "", quantity: 1, unit_price: 0, expense_category: "", inventory_item: undefined }],
        },
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "line_items",
    });

    const lineItems = useWatch({ control: form.control, name: "line_items" });
    const subtotal = lineItems?.reduce((sum, item) => sum + (item.quantity || 0) * (item.unit_price || 0), 0) || 0;

    const { data: bill, isLoading } = useQuery({
        queryKey: ["bill", id],
        queryFn: () => billingApi.bills.get(id),
        enabled: Number.isFinite(id) && id > 0,
    });

    const { data: suppliersResponse } = useQuery({
        queryKey: ["suppliers"],
        queryFn: () => inventoryApi.listSuppliers({ is_active: true }),
    });

    const { data: branchesResponse } = useQuery({
        queryKey: ["branches"],
        queryFn: () => branchesApi.list({ is_active: true }),
    });

    const suppliers = Array.isArray(suppliersResponse) ? suppliersResponse : suppliersResponse?.results || [];
    const branches = branchesResponse ?? [];

    useEffect(() => {
        if (!bill) return;
        form.reset({
            vendor: bill.vendor?.toString() || "",
            branch: bill.branch?.toString() || "",
            purchase_order: bill.purchase_order?.toString() || "",
            reference_number: bill.reference_number || "",
            bill_date: bill.bill_date,
            due_date: bill.due_date,
            terms: bill.terms || "",
            notes: bill.notes || "",
            currency: bill.currency || "USD",
            line_items: (bill.line_items || []).map((item) => ({
                description: item.description,
                quantity: Number(item.quantity || 1),
                unit_price: Number.parseFloat(item.unit_price || "0"),
                expense_category: item.expense_category || "",
                inventory_item: item.inventory_item,
            })),
        });
    }, [bill, form]);

    const updateMutation = useMutation({
        mutationFn: (data: Partial<Bill>) => billingApi.bills.update(id, data),
        onSuccess: (updated) => {
            queryClient.invalidateQueries({ queryKey: ["bills"] });
            queryClient.invalidateQueries({ queryKey: ["bill", id] });
            toast({ title: "Bill Updated", description: `Bill #${updated.bill_number} updated successfully.` });
            router.push(`/billing/bills/${id}`);
        },
        onError: (error: unknown) => {
            const apiError = error as { response?: { data?: { detail?: string } | unknown } };
            toast({
                title: "Error Updating Bill",
                description: typeof apiError.response?.data === "object" && apiError.response.data !== null && "detail" in apiError.response.data
                    ? String(apiError.response.data.detail)
                    : JSON.stringify(apiError.response?.data) || "Failed to update bill",
                variant: "destructive",
            });
        },
    });

    const onSubmit = (data: FormValues) => {
        updateMutation.mutate({
            vendor: Number.parseInt(data.vendor, 10),
            branch: Number.parseInt(data.branch, 10),
            purchase_order: data.purchase_order ? Number.parseInt(data.purchase_order, 10) : null,
            reference_number: data.reference_number,
            bill_date: data.bill_date,
            due_date: data.due_date,
            terms: data.terms,
            notes: data.notes,
            currency: data.currency,
            line_items: data.line_items.map((item) => ({
                ...item,
                unit_price: item.unit_price.toString(),
            })),
            tax_amount: bill?.tax_amount || "0.00",
        });
    };

    if (isLoading) {
        return <div className="p-8 text-sm text-muted-foreground">Loading bill...</div>;
    }

    return (
        <div className="mx-auto max-w-5xl space-y-6 pb-10">
            <div className="flex items-center gap-4">
                <Link href={`/billing/bills/${id}`}>
                    <Button variant="outline" size="icon" className="h-9 w-9">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Edit Bill</h1>
                    <p className="text-sm text-muted-foreground">{bill?.bill_number || "Vendor bill"}</p>
                </div>
            </div>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base font-semibold">Bill Details</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-2">
                            <FormField control={form.control} name="vendor" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Vendor</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl><SelectTrigger><SelectValue placeholder="Select Vendor" /></SelectTrigger></FormControl>
                                        <SelectContent>{suppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id.toString()}>{supplier.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="branch" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Branch</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl><SelectTrigger><SelectValue placeholder="Select Branch" /></SelectTrigger></FormControl>
                                        <SelectContent>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id.toString()}>{branch.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="reference_number" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Reference #</FormLabel>
                                    <FormControl><Input placeholder="Vendor invoice number" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="bill_date" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Bill Date</FormLabel>
                                    <FormControl><Input type="date" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="due_date" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Due Date</FormLabel>
                                    <FormControl><Input type="date" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="notes" render={({ field }) => (
                                <FormItem className="md:col-span-2">
                                    <FormLabel>Notes</FormLabel>
                                    <FormControl><Textarea placeholder="Internal notes..." {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="text-base font-semibold">Line Items</CardTitle>
                            <Button type="button" variant="outline" size="sm" onClick={() => append({ description: "", quantity: 1, unit_price: 0, expense_category: "", inventory_item: undefined })}>
                                <Plus className="mr-2 h-4 w-4" />
                                Add Item
                            </Button>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted hover:bg-muted">
                                            <TableHead className="w-[40%] pl-6">Description</TableHead>
                                            <TableHead className="w-[15%]">Category</TableHead>
                                            <TableHead className="w-[15%] text-right">Quantity</TableHead>
                                            <TableHead className="w-[15%] text-right">Unit Price</TableHead>
                                            <TableHead className="w-[10%] text-right">Total</TableHead>
                                            <TableHead className="w-[5%]"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {fields.map((field, index) => {
                                            const qty = lineItems?.[index]?.quantity || 0;
                                            const price = lineItems?.[index]?.unit_price || 0;
                                            return (
                                                <TableRow key={field.id}>
                                                    <TableCell className="pl-6 align-top pt-3">
                                                        <FormField control={form.control} name={`line_items.${index}.description`} render={({ field }) => (
                                                            <FormItem><FormControl><Input placeholder="Item description" {...field} /></FormControl><FormMessage /></FormItem>
                                                        )} />
                                                    </TableCell>
                                                    <TableCell className="align-top pt-3">
                                                        <FormField control={form.control} name={`line_items.${index}.expense_category`} render={({ field }) => (
                                                            <FormItem><FormControl><Input placeholder="Category" {...field} /></FormControl><FormMessage /></FormItem>
                                                        )} />
                                                    </TableCell>
                                                    <TableCell className="align-top pt-3">
                                                        <FormField control={form.control} name={`line_items.${index}.quantity`} render={({ field }) => (
                                                            <FormItem><FormControl><Input type="number" min="1" step="1" className="text-right" {...field} onChange={(event) => field.onChange(Number.parseFloat(event.target.value) || 0)} /></FormControl><FormMessage /></FormItem>
                                                        )} />
                                                    </TableCell>
                                                    <TableCell className="align-top pt-3">
                                                        <FormField control={form.control} name={`line_items.${index}.unit_price`} render={({ field }) => (
                                                            <FormItem><FormControl><Input type="number" min="0" step="0.01" className="text-right" {...field} onChange={(event) => field.onChange(Number.parseFloat(event.target.value) || 0)} /></FormControl><FormMessage /></FormItem>
                                                        )} />
                                                    </TableCell>
                                                    <TableCell className="pt-5 text-right font-medium">{formatCurrency(qty * price)}</TableCell>
                                                    <TableCell className="align-top pt-3 text-right pr-6">
                                                        {fields.length > 1 && (
                                                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => remove(index)}>
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                        <CardFooter className="flex flex-col items-end border-t bg-muted/50 p-6">
                            <div className="w-full max-w-xs space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Subtotal:</span>
                                    <span className="font-medium">{formatCurrency(subtotal)}</span>
                                </div>
                                <div className="flex justify-between border-t pt-2 text-base font-bold text-foreground">
                                    <span>Total:</span>
                                    <span>{formatCurrency(subtotal)}</span>
                                </div>
                            </div>
                        </CardFooter>
                    </Card>

                    <div className="flex justify-end gap-3">
                        <Button variant="outline" type="button" onClick={() => router.back()}>Cancel</Button>
                        <Button type="submit" disabled={updateMutation.isPending}>
                            <Save className="mr-2 h-4 w-4" />
                            {updateMutation.isPending ? "Saving..." : "Save Bill"}
                        </Button>
                    </div>
                </form>
            </Form>
        </div>
    );
}
