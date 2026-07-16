"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter, useSearchParams } from "next/navigation";
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
import { accountingApi } from "@/lib/api/accounting";
import { useBranchStore } from "@/store/branchStore";
import Link from "next/link";
import { canConvertPoToBill } from "@/lib/billing/ap-flow";
import { ApFlowHint } from "@/components/billing/ApFlowHint";

const lineItemSchema = z.object({
    line_type: z.enum(["category", "item"]),
    description: z.string().min(1, "Description is required"),
    quantity: z.number().min(0.01, "Quantity must be at least 0.01"),
    unit_price: z.number().min(0, "Price must be non-negative"),
    expense_account_id: z.string().optional(),
    expense_category: z.string().optional(),
    inventory_item: z.number().optional(),
});

const formSchema = z.object({
    vendor: z.string().optional(),
    branch: z.string().optional(),
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

const initialBillDate = format(new Date(), "yyyy-MM-dd");
const initialDueDate = format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");

function getEntityId(value: unknown): number | undefined {
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim()) {
        const parsed = Number.parseInt(value, 10);
        return Number.isNaN(parsed) ? undefined : parsed;
    }
    if (value && typeof value === "object" && "id" in value) {
        const id = (value as { id?: unknown }).id;
        return typeof id === "number" ? id : getEntityId(id);
    }
    return undefined;
}

function getEntityName(value: unknown, fallback?: string): string | undefined {
    if (value && typeof value === "object") {
        const entity = value as { name?: unknown; po_number?: unknown };
        if (typeof entity.name === "string" && entity.name.trim()) return entity.name;
        if (typeof entity.po_number === "string" && entity.po_number.trim()) return entity.po_number;
    }
    return fallback;
}

export default function NewBillPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialPurchaseOrderId = searchParams.get("po") || "";
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { currency: configuredCurrency, formatCurrency } = useCurrency();
    const activeBranchId = useBranchStore((state) => state.activeBranchId);
    const activeBranch = useBranchStore((state) => state.activeBranch);
    const isPurchaseOrderPrefill = Boolean(initialPurchaseOrderId);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            vendor: "",
            branch: "",
            purchase_order: initialPurchaseOrderId,
            reference_number: "",
            notes: "",
            bill_date: initialBillDate,
            due_date: initialDueDate,
            terms: "Net 30",
            currency: "USD",
            line_items: [{ line_type: "category", description: "", quantity: 1, unit_price: 0, expense_account_id: "", expense_category: "", inventory_item: undefined }],
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

    const selectedVendor = useWatch({
        control: form.control,
        name: "vendor",
    });

    const selectedPurchaseOrder = useWatch({
        control: form.control,
        name: "purchase_order",
    });

    useEffect(() => {
        if (initialPurchaseOrderId) {
            form.setValue("purchase_order", initialPurchaseOrderId);
        }
    }, [form, initialPurchaseOrderId]);

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

    const branches = branchesResponse ?? [];

    const { data: expenseAccounts = [] } = useQuery({
        queryKey: ["accounting", "expense-accounts", "bill-new"],
        queryFn: async () => {
            const accounts = await accountingApi.getAccounts({
                account_type: "expense",
                is_active: true,
                page_size: 500,
            });
            return accounts.filter((account) => (account.children_count || 0) === 0);
        },
    });

    const { data: accountingSettings } = useQuery({
        queryKey: ["accounting", "settings", "bill-new"],
        queryFn: () => accountingApi.getAccountingSettings(),
    });

    const { data: catalogPartsData } = useQuery({
        queryKey: ["parts", "bill-lines"],
        queryFn: () =>
            inventoryApi.list({
                is_active: true,
                page_size: 200,
                ordering: "part_number",
            }),
    });
    const catalogParts = catalogPartsData?.results ?? [];

    const { data: purchaseOrdersResponse } = useQuery({
        queryKey: ["purchase-orders", "billable", selectedVendor],
        queryFn: () => inventoryApi.listPurchaseOrders({
            supplier: parseInt(selectedVendor || "0"),
        }),
        enabled: Boolean(selectedVendor),
    });

    const purchaseOrders = Array.isArray(purchaseOrdersResponse)
        ? purchaseOrdersResponse
        : purchaseOrdersResponse?.results || [];

    const billablePurchaseOrders = purchaseOrders.filter((po) =>
        canConvertPoToBill(po.status)
    );

    const { data: purchaseOrderDetail, isLoading: isPurchaseOrderDetailLoading } = useQuery({
        queryKey: ["purchase-order", selectedPurchaseOrder],
        queryFn: () => inventoryApi.getPurchaseOrder(parseInt(selectedPurchaseOrder || "0")),
        enabled: Boolean(selectedPurchaseOrder),
    });

    useEffect(() => {
        if (!purchaseOrderDetail) return;

        const supplierId = getEntityId(purchaseOrderDetail.supplier);
        const supplier = typeof purchaseOrderDetail.supplier === "object"
            ? purchaseOrderDetail.supplier
            : null;
        const branchId = getEntityId(purchaseOrderDetail.branch) ?? activeBranchId ?? undefined;
        const resolvedBillDate =
            purchaseOrderDetail.received_date ||
            purchaseOrderDetail.received_at?.slice(0, 10) ||
            purchaseOrderDetail.order_date ||
            initialBillDate;
        const resolvedDueDate =
            purchaseOrderDetail.due_date ||
            purchaseOrderDetail.expected_delivery_date ||
            resolvedBillDate;
        const defaultExpenseAccountId = accountingSettings?.default_expense_account
            ? String(accountingSettings.default_expense_account)
            : "";
        const defaultExpenseAccount = expenseAccounts.find(
            (account) => String(account.id) === defaultExpenseAccountId
        );

        const importedItems = (purchaseOrderDetail.items || []).map((item) => {
            const part = typeof item.part === "object" ? item.part : null;
            const partName = item.part_name || part?.name || item.part_number || "Inventory item";
            const partNumber = item.part_number || part?.part_number;
            const isInventoryLine = part?.item_type === "inventory";

            return {
                line_type: isInventoryLine ? ("item" as const) : ("category" as const),
                description: partNumber ? `${partNumber} - ${partName}` : partName,
                quantity: Number(item.quantity_received || item.quantity || 1),
                unit_price: parseFloat(item.unit_cost || "0"),
                expense_category: isInventoryLine
                    ? "Inventory"
                    : defaultExpenseAccount
                      ? `${defaultExpenseAccount.code} — ${defaultExpenseAccount.name}`
                      : "",
                expense_account_id: isInventoryLine ? "" : defaultExpenseAccountId,
                inventory_item: isInventoryLine
                    ? part?.id || (typeof item.part === "number" ? item.part : undefined)
                    : undefined,
            };
        });
        const currentValues = form.getValues();

        form.reset({
            ...currentValues,
            vendor: supplierId ? supplierId.toString() : currentValues.vendor,
            branch: branchId ? branchId.toString() : currentValues.branch,
            purchase_order: purchaseOrderDetail.id ? purchaseOrderDetail.id.toString() : currentValues.purchase_order,
            bill_date: resolvedBillDate,
            due_date: resolvedDueDate,
            terms: supplier?.payment_terms || currentValues.terms,
            notes: currentValues.notes || `Created from purchase order ${purchaseOrderDetail.po_number}.`,
            line_items: importedItems.length > 0 ? importedItems : currentValues.line_items,
        });
    }, [activeBranchId, accountingSettings, expenseAccounts, form, purchaseOrderDetail]);

    const isPurchaseOrderPrefillReady =
        !isPurchaseOrderPrefill ||
        (Boolean(purchaseOrderDetail) &&
            Boolean(getEntityId(purchaseOrderDetail?.supplier) || selectedVendor) &&
            Boolean(selectedPurchaseOrder));
    const prefilledSupplierId = purchaseOrderDetail ? getEntityId(purchaseOrderDetail.supplier) : undefined;
    const prefilledBranchId = purchaseOrderDetail
        ? getEntityId(purchaseOrderDetail.branch) ?? activeBranchId ?? undefined
        : undefined;
    const prefilledSupplierName = purchaseOrderDetail
        ? getEntityName(purchaseOrderDetail.supplier, purchaseOrderDetail.supplier_name)
        : undefined;
    const prefilledBranchName = purchaseOrderDetail
        ? getEntityName(purchaseOrderDetail.branch, activeBranch?.name)
        : undefined;

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
            const isStandaloneDraft = !data.purchase_order && data.status === "draft";
            router.push(
                isStandaloneDraft ? `/billing/bills/${data.id}?submit=1` : `/billing/bills/${data.id}`
            );
        },

        onError: (error: unknown) => {
            const apiError = error as { response?: { data?: { detail?: string } | unknown } };
            toast({
                title: "Error Creating Bill",
                description: typeof apiError.response?.data === "object" && apiError.response.data !== null && "detail" in apiError.response.data
                    ? String(apiError.response.data.detail)
                    : JSON.stringify(apiError.response?.data) || "Failed to create bill",
                variant: "destructive",
            });
        },
    });

    const onSubmit = (data: FormValues) => {
        const purchaseOrderSupplierId = purchaseOrderDetail
            ? getEntityId(purchaseOrderDetail.supplier)
            : undefined;
        const purchaseOrderBranchId = purchaseOrderDetail
            ? getEntityId(purchaseOrderDetail.branch)
            : undefined;
        const resolvedVendor = isPurchaseOrderPrefill ? purchaseOrderSupplierId : parseInt(data.vendor || "0", 10);
        const resolvedBranch = isPurchaseOrderPrefill
            ? purchaseOrderBranchId ?? activeBranchId ?? undefined
            : parseInt(data.branch || "0", 10);
        const resolvedPurchaseOrder = isPurchaseOrderPrefill
            ? parseInt(initialPurchaseOrderId, 10)
            : data.purchase_order
                ? parseInt(data.purchase_order, 10)
                : null;

        if (!resolvedVendor || Number.isNaN(resolvedVendor)) {
            form.setError("vendor", { type: "manual", message: "Vendor is required" });
            toast({
                title: "Vendor Required",
                description: "The purchase order did not provide a vendor. Please refresh the page or open the bill from the purchase order again.",
                variant: "destructive",
            });
            return;
        }

        if (!resolvedBranch || Number.isNaN(resolvedBranch)) {
            form.setError("branch", { type: "manual", message: "Branch is required" });
            toast({
                title: "Branch Required",
                description: "Select an active branch and try creating the bill again.",
                variant: "destructive",
            });
            return;
        }

        createMutation.mutate({
            vendor: resolvedVendor,
            branch: resolvedBranch,
            purchase_order: resolvedPurchaseOrder,
            status: resolvedPurchaseOrder ? "open" : "draft",
            reference_number: data.reference_number,
            bill_date: data.bill_date,
            due_date: data.due_date,
            terms: data.terms,
            notes: data.notes,
            currency: data.currency,
            line_items: data.line_items.map((item) => {
                const expenseAccount = expenseAccounts.find(
                    (account) => String(account.id) === item.expense_account_id
                );
                return {
                    description: item.description,
                    quantity: item.quantity,
                    unit_price: item.unit_price.toString(),
                    inventory_item: item.line_type === "item" ? item.inventory_item : undefined,
                    expense_category:
                        item.line_type === "category" && expenseAccount
                            ? `${expenseAccount.code} — ${expenseAccount.name}`
                            : item.expense_category || "",
                };
            }),
            tax_amount: "0.00",
        });
    };

    return (
        <div className="space-y-6 w-full pb-10">
            <div className="flex items-center gap-4">
                <Link href="/billing/bills">
                    <Button variant="outline" size="icon" className="h-9 w-9">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-foreground">Create New Bill</h1>
                    <p className="text-sm text-muted-foreground">Enter vendor bill details and line items.</p>
                </div>
            </div>

            {selectedPurchaseOrder || isPurchaseOrderPrefill ? (
                <ApFlowHint variant="bill-from-po" />
            ) : (
                <ApFlowHint variant="bill-standalone" />
            )}

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
                                            onValueChange={(value) => {
                                                field.onChange(value);
                                                form.setValue("purchase_order", "");
                                            }}
                                            defaultValue={field.value}
                                            value={field.value}
                                            disabled={isPurchaseOrderPrefill}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select Vendor" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {isPurchaseOrderPrefill && prefilledSupplierId && !suppliers.some(s => s.id === prefilledSupplierId) && (
                                                    <SelectItem value={prefilledSupplierId.toString()}>
                                                        {prefilledSupplierName || `Vendor #${prefilledSupplierId}`}
                                                    </SelectItem>
                                                )}
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
                                            disabled={isPurchaseOrderPrefill}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select Branch" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {isPurchaseOrderPrefill && prefilledBranchId && !branches.some(b => b.id === prefilledBranchId) && (
                                                    <SelectItem value={prefilledBranchId.toString()}>
                                                        {prefilledBranchName || `Branch #${prefilledBranchId}`}
                                                    </SelectItem>
                                                )}
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
                                name="purchase_order"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Purchase Order</FormLabel>
                                        <Select
                                            onValueChange={field.onChange}
                                            value={field.value}
                                            disabled={isPurchaseOrderPrefill || !selectedVendor || billablePurchaseOrders.length === 0}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder={selectedVendor ? "Link a PO" : "Select vendor first"} />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {isPurchaseOrderPrefill && purchaseOrderDetail && (
                                                    <SelectItem value={purchaseOrderDetail.id.toString()}>
                                                        {purchaseOrderDetail.po_number} - {formatCurrency(parseFloat(purchaseOrderDetail.total || "0"))}
                                                    </SelectItem>
                                                )}
                                                {billablePurchaseOrders
                                                    .filter((po) => !isPurchaseOrderPrefill || po.id !== purchaseOrderDetail?.id)
                                                    .map((po) => (
                                                    <SelectItem key={po.id} value={po.id.toString()}>
                                                        {po.po_number} - {formatCurrency(parseFloat(po.total || "0"))}
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
                            <div>
                                <CardTitle className="text-base font-semibold">Line items</CardTitle>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Category lines map to GL expense accounts (like QBO Category details). Product lines
                                    link to catalog parts (like QBO Item details).
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                        append({
                                            line_type: "category",
                                            description: "",
                                            quantity: 1,
                                            unit_price: 0,
                                            expense_account_id: "",
                                            expense_category: "",
                                            inventory_item: undefined,
                                        })
                                    }
                                >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Category line
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                        append({
                                            line_type: "item",
                                            description: "",
                                            quantity: 1,
                                            unit_price: 0,
                                            expense_account_id: "",
                                            expense_category: "",
                                            inventory_item: undefined,
                                        })
                                    }
                                >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Product line
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted hover:bg-muted">
                                            <TableHead className="w-[10%] pl-6">Type</TableHead>
                                            <TableHead className="w-[28%]">Description</TableHead>
                                            <TableHead className="w-[22%]">Category / Product</TableHead>
                                            <TableHead className="w-[10%] text-right">Qty</TableHead>
                                            <TableHead className="w-[12%] text-right">Rate</TableHead>
                                            <TableHead className="w-[10%] text-right">Amount</TableHead>
                                            <TableHead className="w-[5%]"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {fields.map((field, index) => {
                                            const qty = lineItems?.[index]?.quantity || 0;
                                            const price = lineItems?.[index]?.unit_price || 0;
                                            const total = qty * price;

                                            return (
                                                <TableRow key={field.id}>
                                                    <TableCell className="pl-6 align-top pt-3">
                                                        <FormField
                                                            control={form.control}
                                                            name={`line_items.${index}.line_type`}
                                                            render={({ field }) => (
                                                                <FormItem>
                                                                    <Select
                                                                        value={field.value}
                                                                        onValueChange={(value) => {
                                                                            field.onChange(value);
                                                                            if (value === "category") {
                                                                                form.setValue(`line_items.${index}.inventory_item`, undefined);
                                                                            } else {
                                                                                form.setValue(`line_items.${index}.expense_account_id`, "");
                                                                            }
                                                                        }}
                                                                    >
                                                                        <FormControl>
                                                                            <SelectTrigger className="h-9">
                                                                                <SelectValue />
                                                                            </SelectTrigger>
                                                                        </FormControl>
                                                                        <SelectContent>
                                                                            <SelectItem value="category">Category</SelectItem>
                                                                            <SelectItem value="item">Product</SelectItem>
                                                                        </SelectContent>
                                                                    </Select>
                                                                </FormItem>
                                                            )}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="align-top pt-3">
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
                                                        {lineItems?.[index]?.line_type === "item" ? (
                                                            <FormField
                                                                control={form.control}
                                                                name={`line_items.${index}.inventory_item`}
                                                                render={({ field }) => (
                                                                    <FormItem>
                                                                        <Select
                                                                            value={field.value ? String(field.value) : ""}
                                                                            onValueChange={(value) => {
                                                                                const partId = Number.parseInt(value, 10);
                                                                                field.onChange(partId);
                                                                                const part = catalogParts.find((p) => p.id === partId);
                                                                                if (part) {
                                                                                    form.setValue(
                                                                                        `line_items.${index}.description`,
                                                                                        `${part.part_number} — ${part.name}`
                                                                                    );
                                                                                }
                                                                            }}
                                                                        >
                                                                            <FormControl>
                                                                                <SelectTrigger>
                                                                                    <SelectValue placeholder="Select product" />
                                                                                </SelectTrigger>
                                                                            </FormControl>
                                                                            <SelectContent className="max-h-72">
                                                                                {catalogParts.map((part) => (
                                                                                    <SelectItem key={part.id} value={String(part.id)}>
                                                                                        {part.part_number} — {part.name}
                                                                                    </SelectItem>
                                                                                ))}
                                                                            </SelectContent>
                                                                        </Select>
                                                                    </FormItem>
                                                                )}
                                                            />
                                                        ) : (
                                                            <FormField
                                                                control={form.control}
                                                                name={`line_items.${index}.expense_account_id`}
                                                                render={({ field }) => (
                                                                    <FormItem>
                                                                        <Select
                                                                            value={field.value || ""}
                                                                            onValueChange={field.onChange}
                                                                        >
                                                                            <FormControl>
                                                                                <SelectTrigger>
                                                                                    <SelectValue placeholder="Expense account" />
                                                                                </SelectTrigger>
                                                                            </FormControl>
                                                                            <SelectContent className="max-h-72">
                                                                                {expenseAccounts.map((account) => (
                                                                                    <SelectItem key={account.id} value={String(account.id)}>
                                                                                        {account.code} — {account.name}
                                                                                    </SelectItem>
                                                                                ))}
                                                                            </SelectContent>
                                                                        </Select>
                                                                    </FormItem>
                                                                )}
                                                            />
                                                        )}
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
                                                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
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
                        <Button
                            type="submit"
                            disabled={createMutation.isPending || (isPurchaseOrderPrefill && (!isPurchaseOrderPrefillReady || isPurchaseOrderDetailLoading))}
                        >
                            <Save className="mr-2 h-4 w-4" />
                            {createMutation.isPending
                                ? "Creating Bill..."
                                : isPurchaseOrderPrefill && (!isPurchaseOrderPrefillReady || isPurchaseOrderDetailLoading)
                                    ? "Loading PO..."
                                    : "Create Bill"}
                        </Button>
                    </div>

                </form>
            </Form>
        </div>
    );
}
