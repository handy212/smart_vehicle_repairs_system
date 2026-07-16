"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

import { billingApi } from "@/lib/api/billing";
import { inventoryApi } from "@/lib/api/inventory";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/lib/hooks/useToast";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const vendorCreditSchema = z.object({
  vendor: z.number().min(1, "Vendor is required"),
  bill: z.number().optional().nullable(),
  credit_date: z.string(),
  reason: z.string().optional(),
  notes: z.string().optional(),
  line_items: z
    .array(
      z.object({
        description: z.string().min(1, "Description is required"),
        quantity: z.number().min(0.01, "Quantity must be greater than 0"),
        unit_price: z.number().min(0, "Price cannot be negative"),
        is_taxable: z.boolean(),
      })
    )
    .min(1, "At least one line item is required"),
});

type VendorCreditFormData = z.infer<typeof vendorCreditSchema>;

function VendorCreditNewContent() {
  const { formatCurrency } = useCurrency();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const vendorId = searchParams.get("vendor") ? parseInt(searchParams.get("vendor")!, 10) : undefined;
  const billId = searchParams.get("bill") ? parseInt(searchParams.get("bill")!, 10) : undefined;

  const { register, control, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } =
    useForm<VendorCreditFormData>({
      resolver: zodResolver(vendorCreditSchema),
      defaultValues: {
        vendor: vendorId || 0,
        bill: billId ?? null,
        credit_date: new Date().toISOString().split("T")[0],
        line_items: [{ description: "Vendor return / adjustment", quantity: 1, unit_price: 0, is_taxable: false }],
      },
    });

  const { fields, append, remove } = useFieldArray({ control, name: "line_items" });
  const lineItems = watch("line_items");
  const selectedVendorId = watch("vendor");
  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);

  const { data: suppliersData } = useQuery({
    queryKey: ["suppliers", "vendor-credit-new"],
    queryFn: () => inventoryApi.listSuppliers({ page_size: 200 } as { page_size?: number }),
  });
  const suppliers = Array.isArray(suppliersData)
    ? suppliersData
    : suppliersData?.results ?? [];

  const { data: vendorBills } = useQuery({
    queryKey: ["bills", "vendor-credit-new", selectedVendorId],
    queryFn: () =>
      billingApi.bills.list({
        vendor: selectedVendorId,
        page_size: 50,
        ordering: "-bill_date",
      }),
    enabled: selectedVendorId > 0,
  });

  const createMutation = useMutation({
    mutationFn: (data: VendorCreditFormData) =>
      billingApi.vendorCredits.create({
        vendor: data.vendor,
        bill: data.bill || undefined,
        credit_date: data.credit_date,
        reason: data.reason,
        notes: data.notes,
        line_items: data.line_items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unit_price: String(item.unit_price),
          is_taxable: item.is_taxable,
        })),
      }),
    onSuccess: (data) => {
      toast({ title: "Vendor credit created", description: "Draft saved successfully." });
      queryClient.invalidateQueries({ queryKey: ["vendor-credits"] });
      router.push(`/billing/vendor-credits/${data.id}`);
    },
    onError: (error: unknown) => {
      let description = "Failed to create vendor credit.";
      if (error && typeof error === "object" && "response" in error) {
        const d = (error as { response?: { data?: { error?: string; detail?: string } } }).response?.data;
        if (d?.error) description = d.error;
        else if (d?.detail) description = String(d.detail);
      }
      toast({ title: "Error", description, variant: "destructive" });
    },
  });

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/billing/vendor-credits">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold">New Vendor Credit</h1>
          <p className="text-sm text-muted-foreground">
            Record a vendor credit memo. Issue it, then apply to open bills.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Credit details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Vendor *</Label>
              <Select
                value={selectedVendorId ? String(selectedVendorId) : undefined}
                onValueChange={(val) => setValue("vendor", parseInt(val, 10), { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  {(Array.isArray(suppliers) ? suppliers : []).map((supplier: { id: number; name: string }) => (
                    <SelectItem key={supplier.id} value={String(supplier.id)}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.vendor && <p className="text-xs text-destructive">{errors.vendor.message}</p>}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Related bill (optional)</Label>
              <Select
                value={watch("bill") ? String(watch("bill")) : "__none__"}
                onValueChange={(val) =>
                  setValue("bill", val === "__none__" ? null : parseInt(val, 10))
                }
                disabled={!selectedVendorId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Link to original bill" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {(vendorBills?.results ?? []).map((bill) => (
                    <SelectItem key={bill.id} value={String(bill.id)}>
                      {bill.bill_number} ({bill.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="credit_date">Credit date</Label>
              <Input id="credit_date" type="date" {...register("credit_date")} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason</Label>
              <Input id="reason" {...register("reason")} placeholder="Return, pricing adjustment…" />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={2} {...register("notes")} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="text-sm">Line items</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                append({ description: "", quantity: 1, unit_price: 0, is_taxable: false })
              }
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add line
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {fields.map((field, index) => (
              <div key={field.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-12">
                <div className="sm:col-span-5">
                  <Input
                    placeholder="Description"
                    {...register(`line_items.${index}.description`)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Qty"
                    {...register(`line_items.${index}.quantity`, { valueAsNumber: true })}
                  />
                </div>
                <div className="sm:col-span-3">
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Unit price"
                    {...register(`line_items.${index}.unit_price`, { valueAsNumber: true })}
                  />
                </div>
                <div className="flex items-center justify-end sm:col-span-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(index)}
                    disabled={fields.length === 1}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
            <p className="text-right text-sm font-semibold">Subtotal: {formatCurrency(subtotal)}</p>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Link href="/billing/vendor-credits">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={isSubmitting || createMutation.isPending}>
            {createMutation.isPending ? "Saving…" : "Create draft"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function NewVendorCreditPage() {
  return (
    <PermissionPageGuard permission="view_billing">
      <VendorCreditNewContent />
    </PermissionPageGuard>
  );
}
