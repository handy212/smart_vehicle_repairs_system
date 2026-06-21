"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useForm, Controller, useFieldArray } from "react-hook-form";


import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { billingApi, Invoice } from "@/lib/api/billing";
import { workordersApi } from "@/lib/api/workorders";
import { inventoryApi } from "@/lib/api/inventory";
import { billingLineTypeForPart, formatPartPickerMeta } from "@/lib/inventory/part-catalog";
import { adminApi } from "@/lib/api/admin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertCircle, Plus, Trash2, Search } from "lucide-react";
import Link from "next/link";
import { useState, useEffect, Fragment } from "react";

import { AxiosError } from "axios";
import { getUserFacingError } from "@/lib/api/errors";
import { computeGhanaTaxBreakdown } from "@/lib/utils/tax";
import { useCurrency } from "@/lib/hooks/useCurrency";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { Badge } from "@/components/ui/badge";

import { useBranchStore } from "@/store/branchStore";
import { useToast } from "@/lib/hooks/useToast";
import { CustomerSelector } from "@/components/customers/CustomerSelector";
import { VehicleSelector } from "@/components/vehicles/VehicleSelector";


const lineItemSchema = z.object({
    item_type: z.enum(["labor", "part", "fee", "discount", "sublet", "other"]),
    description: z.string().min(1, "Description is required"),
    quantity: z.number().min(0, "Quantity must be at least 0").optional(),
    unit_price: z.number().min(0, "Unit price must be at least 0").optional(),
    labor_hours: z.number().min(0).optional(),
    labor_rate: z.number().min(0).optional(),
    is_taxable: z.boolean(),
    part: z.number().optional(),
    part_number: z.string().optional(),
    notes: z.string().optional(),
});




const invoiceSchema = z.object({
    customer: z.number().min(1, "Customer is required"),
    vehicle: z.number().optional(),
    work_order: z.number().optional(),
    invoice_date: z.string().min(1, "Invoice date is required"),
    due_date: z.string().min(1, "Due date is required"),
    payment_terms: z.enum(["due_on_receipt", "net_15", "net_30", "net_60", "custom"]),
    notes: z.string().optional(),
    sales_agent: z.number().optional(),
    discount_percentage: z.number().min(0).max(100).optional(),
    discount_type: z.enum(["none", "before_tax", "after_tax"]),
    discount_reason: z.string().optional(),
    line_items: z.array(lineItemSchema).min(1, "At least one line item is required"),
    status: z.string().optional(),
});

type InvoiceFormData = z.infer<typeof invoiceSchema>;
type LineItemFormData = z.infer<typeof lineItemSchema>;

const PAYMENT_TERMS = [
    { value: "due_on_receipt", label: "Due on Receipt", days: 0 },
    { value: "net_15", label: "Net 15", days: 15 },
    { value: "net_30", label: "Net 30", days: 30 },
    { value: "net_60", label: "Net 60", days: 60 },
    { value: "custom", label: "Custom", days: null },
];

export default function NewProformaPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const workOrderId = searchParams.get("work_order");
    const queryClient = useQueryClient();
    const [serverError, setServerError] = useState<string | null>(null);

    const [dueDateManual, setDueDateManual] = useState(false);
    const { formatCurrency } = useCurrency();
    const { activeBranchId } = useBranchStore();
    const { toast } = useToast();

    const [partSearchTerm, setPartSearchTerm] = useState("");


    const { data: partsData } = useQuery({
        queryKey: ["parts", "search", partSearchTerm],
        queryFn: () => inventoryApi.list({ search: partSearchTerm, page: 1, is_active: true }),
        enabled: partSearchTerm.length > 0,
    });

    const { data: salesAgents } = useQuery({
        queryKey: ["users", "branch-staff", activeBranchId],
        queryFn: async () => {
            if (activeBranchId) {
                const res = await adminApi.users.list({ branch: activeBranchId });
                return res.results;
            }
            return adminApi.users.staffList();
        },
        enabled: true,
    });



    const { data: workOrder } = useQuery({
        queryKey: ["workorder", workOrderId],
        queryFn: () => workordersApi.get(parseInt(workOrderId!)),
        enabled: !!workOrderId,
    });

    const [selectedCustomer, setSelectedCustomer] = useState<number | null>(null);

    // Sync selectedCustomer with workOrder once loaded
    useEffect(() => {
        if (workOrder) {
            const customerId = typeof workOrder.customer === 'object' ? workOrder.customer.id : workOrder.customer;
            if (customerId) setSelectedCustomer(customerId);
        }
    }, [workOrder]);


    const { data: taxConfig } = useQuery({
        queryKey: ["tax", "config"],
        queryFn: () => billingApi.taxes.config(),
    });

    const {
        register,
        handleSubmit,
        control,
        formState: { errors, isSubmitting },
        setValue,
        watch,

        setError,
    } = useForm<InvoiceFormData>({
        resolver: zodResolver(invoiceSchema),
        defaultValues: {
            invoice_date: new Date().toISOString().split("T")[0],
            due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            payment_terms: "net_30",
            customer: workOrder ? (typeof workOrder.customer === 'object' ? workOrder.customer.id : workOrder.customer) : undefined,
            vehicle: workOrder ? (typeof workOrder.vehicle === 'object' ? workOrder.vehicle.id : workOrder.vehicle) : undefined,
            work_order: workOrderId ? parseInt(workOrderId) : undefined,
            discount_percentage: 0,
            discount_reason: "",
            discount_type: "before_tax",
            line_items: [
                { item_type: "labor", description: "", quantity: 1, unit_price: 0, is_taxable: true },
            ],
            status: 'proforma',
        },
    });


    const { fields, append, remove, update } = useFieldArray({
        control,
        name: "line_items",
    });


    const customer = watch("customer");
    const invoiceDate = watch("invoice_date");
    const paymentTerms = watch("payment_terms");
    const discountType = watch("discount_type");
    const discountPercentage = watch("discount_percentage");

    useEffect(() => {
        if (!dueDateManual && invoiceDate && paymentTerms) {
            const term = PAYMENT_TERMS.find(t => t.value === paymentTerms);
            if (term && term.days !== null) {
                const date = new Date(invoiceDate);
                date.setDate(date.getDate() + term.days);
                setValue("due_date", date.toISOString().split("T")[0]);
            }
        }
    }, [invoiceDate, paymentTerms, dueDateManual, setValue]);

    useEffect(() => {
        if (customer && customer !== selectedCustomer) {
            setSelectedCustomer(customer);
            setValue("vehicle", undefined);
        }
    }, [customer, selectedCustomer, setValue]);



    const addLineItem = (type: "labor" | "part" = "labor", partData?: any) => {
        if (type === "part" && partData) {
            append({
                item_type: billingLineTypeForPart(partData),
                description: partData.name,
                quantity: 1,
                unit_price: parseFloat(partData.selling_price || partData.cost_price || "0"),
                part: partData.id,
                part_number: partData.part_number,
                is_taxable: true,
            });
        } else {
            append({ item_type: "labor", description: "", quantity: 1, unit_price: 0, is_taxable: true });
        }
    };

    const removeLineItem = (index: number) => {
        remove(index);
    };





    const calculateLineItemTotal = (item: LineItemFormData): number => {
        const qty = typeof item.quantity === 'number' && !isNaN(item.quantity) ? item.quantity : 0;
        const price = typeof item.unit_price === 'number' && !isNaN(item.unit_price) ? item.unit_price : 0;
        return qty * price;
    };


    const lineItemsWatch = watch("line_items") || [];


    const subtotal = lineItemsWatch.reduce((sum, item) => sum + calculateLineItemTotal(item as any), 0);
    const taxableSubtotalBeforeDiscount = lineItemsWatch.reduce(

        (sum, item) => sum + (item.is_taxable !== false ? calculateLineItemTotal(item as any) : 0),
        0
    );


    let discountAmount = 0;
    if (discountPercentage && discountPercentage > 0) {
        discountAmount = (subtotal * discountPercentage) / 100;
    }

    const taxSummary = computeGhanaTaxBreakdown({
        taxableTotal: taxableSubtotalBeforeDiscount,
        subtotal,
        discountAmount: discountType === 'before_tax' ? discountAmount : 0,
        config: taxConfig,
    });

    let total = subtotal + taxSummary.totalTax;
    if (discountType === 'before_tax') {
        total = (subtotal - discountAmount) + taxSummary.totalTax;
    } else if (discountType === 'after_tax') {
        total = (subtotal + taxSummary.totalTax) - discountAmount;
    }

    const createMutation = useMutation({
        mutationFn: async (data: InvoiceFormData) => {
            const payload: Partial<Invoice> = {
                customer: data.customer,
                vehicle: data.vehicle,
                work_order: data.work_order,
                invoice_date: data.invoice_date,
                due_date: data.due_date,
                payment_terms: data.payment_terms,
                notes: data.notes,
                status: 'proforma',
                sales_agent: data.sales_agent,
                discount_percentage: data.discount_type !== 'none' ? data.discount_percentage?.toString() : '0',
                discount_reason: data.discount_reason,
                terms: PAYMENT_TERMS.find(t => t.value === data.payment_terms)?.label || data.payment_terms,
                line_items: data.line_items.map((item, idx) => ({
                    item_type: item.item_type,
                    description: item.description,
                    quantity: item.quantity || 0,
                    unit_price: (item.unit_price || 0).toString(),
                    labor_hours: item.labor_hours,
                    labor_rate: item.labor_rate?.toString(),
                    is_taxable: item.is_taxable,
                    part: item.part,
                    part_number: item.part_number,
                    notes: item.notes,
                    order: idx,
                })),
            };
            return billingApi.invoices.create(payload);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["invoices"] });
            queryClient.invalidateQueries({ queryKey: ["proformas"] });
            toast({
                title: "Success",
                description: "Proforma invoice created successfully",
            });
            router.push("/billing/proformas");
        },

        onError: (error: AxiosError<any>) => {
            const message = getUserFacingError(error, "We couldn't create the proforma. Please review the form and try again.");
            setServerError(message);
            toast({
                title: "Error",
                description: message,
                variant: "destructive",
            });
        },

    });

    const onSubmit = (data: InvoiceFormData) => {
        setServerError(null);
        createMutation.mutate(data);
    };


    const onInvalid = (errors: any) => {
        console.error("Form errors:", errors);

        // Extract specific error messages
        const errorMessages: string[] = [];
        if (errors.customer) errorMessages.push("Customer is required");
        if (errors.line_items) {
            if (Array.isArray(errors.line_items)) {

                errors.line_items.forEach((item: any, idx: number) => {
                    if (item?.description) errorMessages.push(`Line ${idx + 1}: ${item.description.message}`);
                    if (item?.quantity) errorMessages.push(`Line ${idx + 1}: ${item.quantity.message}`);
                    if (item?.unit_price) errorMessages.push(`Line ${idx + 1}: ${item.unit_price.message}`);
                });
            } else if (errors.line_items.message) {
                errorMessages.push(errors.line_items.message);
            }
        }

        toast({
            title: "Validation Error",
            description: errorMessages.length > 0
                ? errorMessages.slice(0, 3).join("; ") + (errorMessages.length > 3 ? "..." : "")
                : "Please check the form for errors and try again.",
            variant: "destructive",
        });
    };


    return (
        <div className="space-y-6 pb-24">
            <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
                <Link href="/dashboard" className="hover:text-primary transition-colors">Dashboard</Link>
                <span>/</span>
                <Link href="/billing" className="hover:text-primary transition-colors">Billing</Link>
                <span>/</span>
                <Link href="/billing/proformas" className="hover:text-primary transition-colors">Proforma Invoices</Link>
                <span>/</span>
                <span className="text-foreground font-medium">New</span>
            </div>
            <div>
                <h1 className="text-xl font-bold text-foreground tracking-tight">Create Proforma Invoice</h1>
            </div>

            {serverError && (
                <Card className="border-destructive/20 bg-destructive/10">
                    <CardContent className="pt-6">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-destructive">Error creating proforma</p>
                                <p className="text-sm text-destructive mt-1">{serverError}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}


            <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-6">

                <Card>

                    <CardHeader>
                        <CardTitle>Basic Information</CardTitle>
                        <CardDescription>Enter proforma invoice details</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Customer *</label>
                                <Controller
                                    name="customer"
                                    control={control}
                                    render={({ field }) => (
                                        <CustomerSelector
                                            selectedCustomerId={typeof field.value === "number" ? field.value : undefined}
                                            onSelect={(selected) => {
                                                field.onChange(selected.id);
                                                setValue("vehicle", undefined, { shouldValidate: true });
                                                setSelectedCustomer(selected.id);
                                            }}
                                            placeholder="Search and select a customer..."
                                        />
                                    )}
                                />
                                {errors.customer && <p className="text-sm text-destructive font-medium">{errors.customer.message as string}</p>}
                            </div>


                            <div className="space-y-2">
                                <label className="text-sm font-medium">Vehicle</label>
                                <Controller
                                    name="vehicle"
                                    control={control}
                                    render={({ field }) => (
                                        <VehicleSelector
                                            selectedVehicleId={typeof field.value === "number" ? field.value : undefined}
                                            ownerId={selectedCustomer}
                                            disabled={!selectedCustomer}
                                            onSelect={(selected) => field.onChange(selected.id)}
                                            placeholder={!selectedCustomer ? "Select a customer first" : "Search and select a vehicle..."}
                                        />
                                    )}
                                />
                            </div>


                            <div className="space-y-2">
                                <label className="text-sm font-medium">Sales Agent</label>
                                <Controller
                                    name="sales_agent"
                                    control={control}
                                    render={({ field }) => (
                                        <Select
                                            value={field.value?.toString() || ""}
                                            onValueChange={(val) => {
                                                const id = parseInt(val);
                                                if (!isNaN(id)) field.onChange(id);
                                            }}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select Agent" />
                                            </SelectTrigger>
                                            <SelectContent>

                                                {(salesAgents as any[] | undefined)?.map((agent: any) => (
                                                    <SelectItem key={agent.id} value={agent.id.toString()}>
                                                        {agent.full_name || `${agent.first_name} ${agent.last_name}`}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                />
                            </div>

                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Invoice Date *</label>
                                <Input type="date" {...register("invoice_date")} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Payment Terms *</label>
                                <Controller
                                    name="payment_terms"
                                    control={control}
                                    render={({ field }) => (
                                        <Select
                                            value={field.value || ""}
                                            onValueChange={field.onChange}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {PAYMENT_TERMS.map(term => (
                                                    <SelectItem key={term.value} value={term.value}>{term.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Due Date *</label>
                                <Input type="date" {...register("due_date")} />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Notes</label>
                            <Textarea {...register("notes")} placeholder="Additional notes..." rows={2} />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Line Items</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search parts..."
                                    className="pl-9"
                                    value={partSearchTerm}
                                    onChange={(e) => setPartSearchTerm(e.target.value)}
                                />
                                {partSearchTerm.length > 1 && partsData?.results && partsData.results.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">

                                        {partsData.results.map((part: any) => (
                                            <div
                                                key={part.id}
                                                className="px-4 py-2 hover:bg-muted cursor-pointer text-sm"
                                                onClick={() => {
                                                    addLineItem("part", part);
                                                    setPartSearchTerm("");
                                                }}
                                            >
                                                {part.part_number} - {part.name} ({formatPartPickerMeta(part, formatCurrency)})
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <Button type="button" onClick={() => addLineItem("labor")} variant="outline">
                                <Plus className="w-4 h-4 mr-2" /> Add Labor
                            </Button>
                        </div>

                        <div className="border rounded-md">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead className="w-24">Qty</TableHead>
                                        <TableHead className="w-32">Rate</TableHead>
                                        <TableHead className="w-16">Tax</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                        <TableHead className="w-10"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {fields.map((item, index) => (
                                        <Fragment key={item.id}>
                                            <TableRow>
                                                <TableCell className="p-2">
                                                    <Controller
                                                        name={`line_items.${index}.item_type`}
                                                        control={control}
                                                        render={({ field }) => (
                                                            <Select
                                                                value={field.value}
                                                                onValueChange={field.onChange}
                                                            >
                                                                <SelectTrigger className="h-8">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="labor">Labor</SelectItem>
                                                                    <SelectItem value="part">Part</SelectItem>
                                                                    <SelectItem value="fee">Fee</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        )}
                                                    />
                                                </TableCell>
                                                <TableCell className="p-2">
                                                    <Input
                                                        {...register(`line_items.${index}.description`)}
                                                        className="h-8"
                                                    />
                                                </TableCell>
                                                <TableCell className="p-2">
                                                    <Input
                                                        type="number"
                                                        {...register(`line_items.${index}.quantity`, { valueAsNumber: true })}
                                                        className="h-8"
                                                    />
                                                </TableCell>
                                                <TableCell className="p-2">
                                                    <Input
                                                        type="number"
                                                        {...register(`line_items.${index}.unit_price`, { valueAsNumber: true })}
                                                        className="h-8"
                                                    />
                                                </TableCell>
                                                <TableCell className="p-2 text-center">
                                                    <Controller
                                                        name={`line_items.${index}.is_taxable`}
                                                        control={control}
                                                        render={({ field }) => (
                                                            <Checkbox
                                                                checked={field.value}
                                                                onCheckedChange={field.onChange}
                                                            />
                                                        )}
                                                    />
                                                </TableCell>
                                                <TableCell className="p-2 text-right">

                                                    {formatCurrency(calculateLineItemTotal(lineItemsWatch[index] as any))}
                                                </TableCell>

                                                <TableCell className="p-2 text-center">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => removeLineItem(index)}
                                                        className="h-8 w-8 p-0 text-destructive"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                            {errors.line_items?.[index] && (
                                                <TableRow key={`${item.id}-error`} className="border-none bg-destructive/10/30">
                                                    <TableCell colSpan={7} className="p-2 pt-0">
                                                        <div className="flex gap-4 text-[11px] text-destructive font-medium ml-2">
                                                            {errors.line_items?.[index]?.description && <span>• {errors.line_items?.[index]?.description?.message as string}</span>}
                                                            {errors.line_items?.[index]?.quantity && <span>• {errors.line_items?.[index]?.quantity?.message as string}</span>}
                                                            {errors.line_items?.[index]?.unit_price && <span>• {errors.line_items?.[index]?.unit_price?.message as string}</span>}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </Fragment>
                                    ))}

                                </TableBody>

                            </Table>
                        </div>

                        <div className="flex justify-end">
                            <div className="w-64 space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span>Subtotal:</span>
                                    <span>{formatCurrency(subtotal)}</span>
                                </div>
                                {taxSummary.totalTax > 0 && (
                                    <div className="flex justify-between text-sm text-muted-foreground">
                                        <span>Tax:</span>
                                        <span>{formatCurrency(taxSummary.totalTax)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between font-bold text-lg border-t pt-2">
                                    <span>Total:</span>
                                    <span>{formatCurrency(total)}</span>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="fixed bottom-0 left-0 right-0 p-4 bg-card border-t z-10 flex justify-end gap-3 shadow-lg lg:pl-64">
                    <Button variant="outline" type="button" onClick={() => router.back()}>Cancel</Button>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? "Creating..." : "Save Proforma"}
                    </Button>
                </div>
            </form>
        </div >
    );
}
