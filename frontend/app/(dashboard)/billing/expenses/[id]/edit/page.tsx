"use client";

import { useFieldArray, useForm } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { billingApi, type VendorExpense } from "@/lib/api/billing";
import { inventoryApi } from "@/lib/api/inventory";
import { branchesApi } from "@/lib/api/branches";
import { accountingApi } from "@/lib/api/accounting";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/lib/hooks/useToast";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";

type LineForm = {
  description: string;
  quantity: string;
  unit_price: string;
  expense_account: string;
};

type VendorExpenseForm = {
  vendor: string;
  branch: string;
  expense_date: string;
  payment_method: string;
  cash_account: string;
  bank_account: string;
  reference_number: string;
  notes: string;
  line_items: LineForm[];
};

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "credit_card", label: "Credit card" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "other", label: "Other" },
] as const;

function mapExpenseToForm(expense: VendorExpense): VendorExpenseForm {
  return {
    vendor: String(expense.vendor),
    branch: expense.branch ? String(expense.branch) : "",
    expense_date: expense.expense_date,
    payment_method: expense.payment_method,
    cash_account: expense.cash_account ? String(expense.cash_account) : "",
    bank_account: expense.bank_account ? String(expense.bank_account) : "",
    reference_number: expense.reference_number || "",
    notes: expense.notes || "",
    line_items:
      expense.line_items && expense.line_items.length > 0
        ? expense.line_items.map((line) => ({
            description: line.description,
            quantity: String(line.quantity),
            unit_price: String(line.unit_price),
            expense_account: line.expense_account ? String(line.expense_account) : "",
          }))
        : [{ description: "", quantity: "1", unit_price: "0", expense_account: "" }],
  };
}

function ExpenseEditForm({ expense, expenseId }: { expense: VendorExpense; expenseId: number }) {
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<VendorExpenseForm>({
    defaultValues: mapExpenseToForm(expense),
  });
  const { register, control, handleSubmit, watch, setValue, setError } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "line_items" });
  const paymentMethod = watch("payment_method");

  const { data: suppliersResponse } = useQuery({
    queryKey: ["suppliers", "expense-edit", expense.vendor],
    queryFn: () => inventoryApi.listSuppliers({ is_active: true }),
  });
  const suppliers = Array.isArray(suppliersResponse)
    ? suppliersResponse
    : suppliersResponse?.results || [];

  const expenseVendor = suppliers.find((s: { id: number }) => s.id === expense.vendor);
  const supplierOptions =
    expenseVendor || !expense.vendor
      ? suppliers
      : [
          {
            id: expense.vendor,
            name: expense.vendor_name || `Vendor #${expense.vendor}`,
          },
          ...suppliers,
        ];

  const { data: branches } = useQuery({
    queryKey: ["branches"],
    queryFn: () => branchesApi.list({ is_active: true }),
  });

  const { data: tillAccounts = [], isLoading: tillAccountsLoading } = useQuery({
    queryKey: ["accounting", "till-enabled-accounts"],
    queryFn: () => accountingApi.getTillEnabledAccounts(),
    enabled: paymentMethod === "cash",
  });

  const { data: bankAccounts = [], isLoading: bankAccountsLoading } = useQuery({
    queryKey: ["accounting", "bank-accounts"],
    queryFn: () => accountingApi.getBankAccounts(),
    enabled: paymentMethod !== "cash",
  });

  const { data: expenseAccounts = [] } = useQuery({
    queryKey: ["accounting", "expense-accounts"],
    queryFn: async () => {
      const accounts = await accountingApi.getAccounts({
        account_type: "expense",
        is_active: true,
        page_size: 500,
      });
      return accounts.filter((account) => (account.children_count || 0) === 0);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      billingApi.vendorExpenses.update(expenseId, payload),
    onSuccess: () => {
      toast({ title: "Expense updated", description: "Vendor expense saved successfully." });
      router.push(`/billing/expenses/${expenseId}`);
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: Record<string, string | string[]> } };
      const data = apiError.response?.data;
      const detail = data?.detail;
      const firstFieldError = data
        ? Object.entries(data)
            .map(([field, value]) => {
              const message = Array.isArray(value) ? value.join(" ") : value;
              return message ? `${field}: ${message}` : undefined;
            })
            .find(Boolean)
        : undefined;
      toast({
        title: "Update failed",
        description:
          (typeof detail === "string" ? detail : Array.isArray(detail) ? detail.join(" ") : undefined) ||
          firstFieldError ||
          "Could not update vendor expense.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: VendorExpenseForm) => {
    if (data.payment_method === "cash" && !data.cash_account) {
      setError("cash_account", {
        type: "manual",
        message: "Select the cash account/till for this expense.",
      });
      return;
    }
    if (data.payment_method !== "cash" && !data.bank_account) {
      setError("bank_account", {
        type: "manual",
        message: "Select the bank account for this expense.",
      });
      return;
    }

    const payload: Record<string, unknown> = {
      vendor: parseInt(data.vendor, 10),
      branch: data.branch ? parseInt(data.branch, 10) : null,
      expense_date: data.expense_date,
      payment_method: data.payment_method,
      reference_number: data.reference_number,
      notes: data.notes,
      line_items: data.line_items.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_price,
        ...(line.expense_account ? { expense_account: parseInt(line.expense_account, 10) } : {}),
      })),
    };

    if (data.payment_method === "cash") {
      payload.cash_account = parseInt(data.cash_account, 10);
    } else {
      payload.bank_account = parseInt(data.bank_account, 10);
    }

    updateMutation.mutate(payload);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Expense details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Vendor</Label>
            <Select value={watch("vendor")} onValueChange={(v) => setValue("vendor", v, { shouldValidate: true })}>
              <SelectTrigger>
                <SelectValue placeholder="Select vendor" />
              </SelectTrigger>
              <SelectContent>
                {supplierOptions.map((s: { id: number; name: string }) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Branch</Label>
            <Select value={watch("branch") || ""} onValueChange={(v) => setValue("branch", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                {(branches ?? []).map((b: { id: number; name: string }) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" {...register("expense_date", { required: true })} />
          </div>
          <div className="space-y-2">
            <Label>Payment method</Label>
            <Select
              value={paymentMethod}
              onValueChange={(v) => {
                setValue("payment_method", v);
                setValue("cash_account", "");
                setValue("bank_account", "");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((method) => (
                  <SelectItem key={method.value} value={method.value}>
                    {method.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {paymentMethod === "cash" ? (
            <div className="space-y-2 md:col-span-2">
              <Label>Cash account (till)</Label>
              <Select
                value={watch("cash_account") || ""}
                onValueChange={(v) => setValue("cash_account", v, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={tillAccountsLoading ? "Loading..." : "Select cash account"} />
                </SelectTrigger>
                <SelectContent>
                  {tillAccounts.map((account) => (
                    <SelectItem key={account.id} value={String(account.id)}>
                      {account.code ? `${account.code} — ` : ""}
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2 md:col-span-2">
              <Label>Bank account</Label>
              <Select
                value={watch("bank_account") || ""}
                onValueChange={(v) => setValue("bank_account", v, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={bankAccountsLoading ? "Loading..." : "Select bank account"} />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((account) => (
                    <SelectItem key={account.id} value={String(account.id)}>
                      {account.code ? `${account.code} — ` : ""}
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2 md:col-span-2">
            <Label>Reference</Label>
            <Input {...register("reference_number")} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Notes</Label>
            <Input {...register("notes")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Line items</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              append({ description: "", quantity: "1", unit_price: "0", expense_account: "" })
            }
          >
            <Plus className="mr-1 h-4 w-4" />
            Add line
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {fields.map((field, index) => (
            <div key={field.id} className="grid items-end gap-2 md:grid-cols-12">
              <div className="space-y-1 md:col-span-4">
                <Label>Description</Label>
                <Input {...register(`line_items.${index}.description`, { required: true })} />
              </div>
              <div className="space-y-1 md:col-span-3">
                <Label>Expense account</Label>
                <Select
                  value={watch(`line_items.${index}.expense_account`) || "none"}
                  onValueChange={(v) =>
                    setValue(`line_items.${index}.expense_account`, v === "none" ? "" : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Default mapping</SelectItem>
                    {expenseAccounts.map((account) => (
                      <SelectItem key={account.id} value={String(account.id)}>
                        {account.code ? `${account.code} — ` : ""}
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 md:col-span-1">
                <Label>Qty</Label>
                <Input {...register(`line_items.${index}.quantity`, { required: true })} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Amount</Label>
                <Input {...register(`line_items.${index}.unit_price`, { required: true })} />
              </div>
              <div className="md:col-span-2">
                <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Link href={`/billing/expenses/${expenseId}`}>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </Link>
        <Button type="submit" disabled={updateMutation.isPending}>
          {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save changes
        </Button>
      </div>
    </form>
  );
}

export default function EditVendorExpensePage() {
  const params = useParams();
  const id = parseInt(params.id as string, 10);

  const { data: expense, isLoading: expenseLoading, isError } = useQuery({
    queryKey: ["vendor-expense", id],
    queryFn: () => billingApi.vendorExpenses.get(id),
    enabled: !Number.isNaN(id),
  });

  if (expenseLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading expense…</div>;
  }

  if (isError || !expense) {
    return (
      <div className="space-y-4 p-6">
        <p className="text-sm text-destructive">Could not load this expense.</p>
        <Link href="/billing/expenses">
          <Button variant="outline" size="sm">
            Back to expenses
          </Button>
        </Link>
      </div>
    );
  }

  if (expense.status === "void") {
    return (
      <div className="space-y-4 p-6">
        <p className="text-sm text-muted-foreground">Void expenses cannot be edited.</p>
        <Link href={`/billing/expenses/${id}`}>
          <Button variant="outline" size="sm">
            Back to expense
          </Button>
        </Link>
      </div>
    );
  }

  if (expense.qbo_sync_status === "synced") {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6">
        <h1 className="text-lg font-semibold">Cannot edit synced expense</h1>
        <p className="text-sm text-muted-foreground">
          This expense is synced to QuickBooks. Void it in SVR and recreate, or adjust directly in
          QuickBooks.
        </p>
        <Link href={`/billing/expenses/${id}`}>
          <Button variant="outline" size="sm">
            Back to expense
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Link href={`/billing/expenses/${id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {expense.expense_number}
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Edit Vendor Expense</h1>
          <p className="text-sm text-muted-foreground">
            Changes reverse and repost the GL entry. Not allowed after QuickBooks sync.
          </p>
        </div>
      </div>

      <ExpenseEditForm key={expense.id} expense={expense} expenseId={id} />
    </div>
  );
}
