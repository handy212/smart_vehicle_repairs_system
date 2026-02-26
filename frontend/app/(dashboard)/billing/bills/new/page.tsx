"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter } from "next/navigation";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { CalendarIcon, Plus, Save, Trash2, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { useEffect } from "react";
import { useCurrency } from "@/lib/hooks/useCurrency";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars 
    FormDescription
} from "@/components/ui/form";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { useToast } from "@/lib/hooks/useToast";
import { billingApi, Bill } from "@/lib/api/billing";
import { inventoryApi } from "@/lib/api/inventory";
import { branchesApi } from "@/lib/api/branches";
import Link from "next/link";

const lineItemSchema = z.object({
    description: z.string().min(1, "Description is required"),
    quantity: z.number().min(1, "Quantity must be at least 1"),
    unit_price: z.number().min(0, "Price must be non-negative"),
    expense_category: z.string().optional(),
});

const formSchema = z.object({
    vendor: z.string().min(1, "Vendor is required"),
    branch: z.string().min(1, "Branch is required"),
    reference_number: z.string().optional(),
    bill_date: z.string().min(1, "Bill date is required"),
    due_date: z.string().min(1, "Due date is required"),
    terms: z.string().optional(),
    notes: z.string().optional(),
    currency: z.string().default("USD"),
    line_items: z.array(lineItemSchema).min(1, "At least one line item is required"),
});

type FormValues = z.infer<typeof formSchema>;

export default function NewBillPage() {
    const router = useRouter();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { currency: configuredCurrency, formatCurrency } = useCurrency();

    const form = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {
            vendor: "",
            branch: "",
            reference_number: "",
            notes: "",
            bill_date: format(new Date(), "yyyy-MM-dd"),
            due_date: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"),
            terms: "Net 30",
            currency: "USD",
            line_items: [{ description: "", quantity: 1, unit_price: 0, expense_category: "" }],
        },
    });

    // Update currency when configured currency changes
    useEffect(() => {
        if (configuredCurrency) {
            form.setValue('currency', configuredCurrency);
        }
    }, [configuredCurrency, form]);

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "line_items",
    });

    // Watch line items to calculate totals
    const lineItems = useWatch({
        control: form.control,
        name: "line_items",
    });

    const subtotal = lineItems?.reduce((sum, item) => {
        return sum + (item.quantity || 0) * (item.unit_price || 0);
    }, 0) || 0;

    // Fetch Suppliers
    const { data: suppliersResponse } = useQuery({
        queryKey: ["suppliers"],
        queryFn: () => inventoryApi.listSuppliers({ is_active: true }),
    });

    const suppliers = Array.isArray(suppliersResponse)
        ? suppliersResponse
        : suppliersResponse?.results || [];

    // Fetch Branches
    const { data: branchesResponse } = useQuery({
        queryKey: ["branches"],
        queryFn: () => branchesApi.list({ is_active: true }),
    });

    const branches = Array.isArray(branchesResponse)
        ? branchesResponse
        : branchesResponse?.results || [];

    // Create Mutation
    const createMutation = useMutation({
        mutationFn: (data: Partial<Bill>) => billingApi.bills.create(data),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["bills"] });
            toast({
                title: "Bill Created",
                description: `Bill #${data.bill_number} created successfully.`,
                variant: "success",
            });
            router.push(`/billing/bills/${data.id}`);
        },

        onError: (error: any) => {
            toast({
                title: "Error Creating Bill",
                description: error.response?.data?.detail || JSON.stringify(error.response?.data) || "Failed to create bill",
                variant: "destructive",
            });
        },
    });

    const onSubmit = (data: FormValues) => {
        createMutation.mutate({
            vendor: parseInt(data.vendor),
            branch: parseInt(data.branch),
            reference_number: data.reference_number,
            bill_date: data.bill_date,
            due_date: data.due_date,
            terms: data.terms,
            notes: data.notes,
            currency: data.currency,
            line_items: data.line_items.map(item => ({
                ...item,
                unit_price: item.unit_price.toString(),
            })),
            tax_amount: "0.00", // Simple tax handling for now
        });
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-10">
            <div className="flex items-center gap-4">
                <Link href="/billing/bills">
                    <Button variant="outline" size="icon" className="h-9 w-9">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Create New Bill</h1>
                    <p className="text-sm text-muted-foreground">Enter vendor bill details and line items.</p>
                </div>
            </div>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

                    {/* Main Details Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base font-semibold">Bill Details</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">

                            <FormField
                                control={form.control}
                                name="vendor"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Vendor</FormLabel>
                                        <Select
                                            onValueChange={field.onChange}
                                            defaultValue={field.value}
                                            value={field.value}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select Vendor" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {suppliers.map(s => (
                                                    <SelectItem key={s.id} value={s.id.toString()}>
                                                        {s.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="branch"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Branch</FormLabel>
                                        <Select
                                            onValueChange={field.onChange}
                                            defaultValue={field.value}
                                            value={field.value}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select Branch" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {branches.map(b => (
                                                    <SelectItem key={b.id} value={b.id.toString()}>
                                                        {b.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="reference_number"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Reference # (Invoice #)</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Vendor's Invoice Number" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="terms"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Payment Terms</FormLabel>
                                        <FormControl>
                                            <Input placeholder="e.g. Net 30" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="bill_date"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Bill Date</FormLabel>
                                        <FormControl>
                                            <Input type="date" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="due_date"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Due Date</FormLabel>
                                        <FormControl>
                                            <Input type="date" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="notes"
                                render={({ field }) => (
                                    <FormItem className="col-span-1 md:col-span-2">
                                        <FormLabel>Notes</FormLabel>
                                        <FormControl>
                                            <Textarea placeholder="Internal notes or description..." {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                        </CardContent>
                    </Card>

                    {/* Line Items Card */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="text-base font-semibold">Line Items</CardTitle>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => append({ description: "", quantity: 1, unit_price: 0, expense_category: "" })}
                            >
                                <Plus className="h-4 w-4 mr-2" />
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
                                            const qty = form.watch(`line_items.${index}.quantity`) || 0;
                                            const price = form.watch(`line_items.${index}.unit_price`) || 0;
                                            const total = qty * price;

                                            return (
                                                <TableRow key={field.id}>
                                                    <TableCell className="pl-6 align-top pt-3">
                                                        <FormField
                                                            control={form.control}
                                                            name={`line_items.${index}.description`}
                                                            render={({ field }) => (
                                                                <FormItem>
                                                                    <FormControl>
                                                                        <Input placeholder="Item description" {...field} />
                                                                    </FormControl>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="align-top pt-3">
                                                        <FormField
                                                            control={form.control}
                                                            name={`line_items.${index}.expense_category`}
                                                            render={({ field }) => (
                                                                <FormItem>
                                                                    <FormControl>
                                                                        <Input placeholder="Category" {...field} />
                                                                    </FormControl>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="align-top pt-3">
                                                        <FormField
                                                            control={form.control}
                                                            name={`line_items.${index}.quantity`}
                                                            render={({ field }) => (
                                                                <FormItem>
                                                                    <FormControl>
                                                                        <Input
                                                                            type="number"
                                                                            min="1"
                                                                            step="1"
                                                                            className="text-right"
                                                                            {...field}
                                                                            onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                                                                        />
                                                                    </FormControl>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="align-top pt-3">
                                                        <FormField
                                                            control={form.control}
                                                            name={`line_items.${index}.unit_price`}
                                                            render={({ field }) => (
                                                                <FormItem>
                                                                    <FormControl>
                                                                        <Input
                                                                            type="number"
                                                                            min="0"
                                                                            step="0.01"
                                                                            className="text-right"
                                                                            {...field}
                                                                            onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                                                                        />
                                                                    </FormControl>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-right align-top pt-5 font-medium">
                                                        {formatCurrency(total)}
                                                    </TableCell>
                                                    <TableCell className="align-top pt-3 text-right pr-6">
                                                        {fields.length > 1 && (
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 text-muted-foreground hover:text-red-600"
                                                                onClick={() => remove(index)}
                                                            >
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
                        <CardFooter className="flex flex-col items-end border-t p-6 bg-muted/50">
                            <div className="w-full max-w-xs space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Subtotal:</span>
                                    <span className="font-medium">{formatCurrency(subtotal)}</span>
                                </div>
                                <div className="flex justify-between text-base font-bold text-foreground pt-2 border-t">
                                    <span>Total:</span>
                                    <span>{formatCurrency(subtotal)}</span>
                                </div>
                            </div>
                        </CardFooter>
                    </Card>

                    <div className="flex justify-end gap-3">
                        <Button variant="outline" type="button" onClick={() => router.back()}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={createMutation.isPending}>
                            <Save className="mr-2 h-4 w-4" />
                            {createMutation.isPending ? "Creating Bill..." : "Create Bill"}
                        </Button>
                    </div>

                </form>
            </Form>
        </div>
    );
}
