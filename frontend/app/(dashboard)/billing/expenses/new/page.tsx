"use client";

import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { billingApi } from "@/lib/api/billing";
import { inventoryApi } from "@/lib/api/inventory";
import { branchesApi } from "@/lib/api/branches";
import { accountingApi, type Account } from "@/lib/api/accounting";
import { useBranchStore } from "@/store/branchStore";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";
import { ArrowLeft, Loader2, Plus, Save, Trash2 } from "lucide-react";

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
  payment_account: string;
  cash_account: string;
  bank_account: string;
  reference_number: string;
  notes: string;
  line_items: LineForm[];
};

const today = format(new Date(), "yyyy-MM-dd");

function accountLabel(account: Account) {
  return account.code ? `${account.code} — ${account.name}` : account.name;
}

function lineTotal(line: LineForm) {
  const qty = parseFloat(line.quantity) || 0;
  const price = parseFloat(line.unit_price) || 0;
  return qty * price;
}

export default function NewVendorExpensePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { formatCurrency } = useCurrency();
  const activeBranchId = useBranchStore((state) => state.activeBranchId);
  const [saveMode, setSaveMode] = useState<"save" | "save_close">("save");
  const [defaultsApplied, setDefaultsApplied] = useState(false);

  const { register, control, handleSubmit, watch, setValue, setError } = useForm<VendorExpenseForm>({
    defaultValues: {
      expense_date: today,
      payment_method: "bank_transfer",
      payment_account: "",
      cash_account: "",
      bank_account: "",
      branch: activeBranchId ? String(activeBranchId) : "",
      line_items: [
        { description: "", quantity: "1", unit_price: "", expense_account: "" },
        { description: "", quantity: "1", unit_price: "", expense_account: "" },
      ],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({ control, name: "line_items" });
  const lineItems = useWatch({ control, name: "line_items" }) ?? [];
  const branchId = watch("branch");
  const paymentMethod = watch("payment_method");
  const paymentAccount = watch("payment_account");

  const subtotal = useMemo(
    () => lineItems.reduce((sum, line) => sum + lineTotal(line), 0),
    [lineItems],
  );

  const { data: suppliersResponse } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => inventoryApi.listSuppliers({ is_active: true }),
  });
  const suppliers = Array.isArray(suppliersResponse)
    ? suppliersResponse
    : suppliersResponse?.results || [];

  const { data: branches } = useQuery({
    queryKey: ["branches"],
    queryFn: () => branchesApi.list({ is_active: true }),
  });

  const { data: accountingSettings } = useQuery({
    queryKey: ["accounting", "settings"],
    queryFn: () => accountingApi.getAccountingSettings(),
  });

  const { data: tillAccounts = [] } = useQuery({
    queryKey: ["accounting", "till-enabled-accounts"],
    queryFn: () => accountingApi.getTillEnabledAccounts(),
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["accounting", "bank-accounts"],
    queryFn: () => accountingApi.getBankAccounts(),
  });

  const { data: openTills = [] } = useQuery({
    queryKey: ["accounting", "open-tills", branchId],
    queryFn: () =>
      accountingApi.getTills({
        status: "open",
        ...(branchId ? { branch: branchId } : {}),
      }),
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

  const openTillAccountIds = useMemo(
    () => new Set(openTills.map((till) => till.till_account)),
    [openTills],
  );

  const paymentAccountOptions = useMemo(() => {
    const cashOptions = tillAccounts
      .filter((account) => openTillAccountIds.has(account.id))
      .map((account) => ({
        value: `cash:${account.id}`,
        label: accountLabel(account),
        hint: "Open till",
      }));

    const bankOptions = bankAccounts.map((account) => ({
      value: `bank:${account.id}`,
      label: accountLabel(account),
      hint: "Bank",
    }));

    return { cashOptions, bankOptions };
  }, [bankAccounts, openTillAccountIds, tillAccounts]);

  useEffect(() => {
    if (activeBranchId && !branchId) {
      setValue("branch", String(activeBranchId));
    }
  }, [activeBranchId, branchId, setValue]);

  useEffect(() => {
    if (defaultsApplied) return;
    if (!accountingSettings && openTills.length === 0 && bankAccounts.length === 0) return;

    const defaultExpenseAccount = accountingSettings?.default_expense_account
      ? String(accountingSettings.default_expense_account)
      : "";

    if (defaultExpenseAccount) {
      replace(
        lineItems.map((line) => ({
          ...line,
          expense_account: line.expense_account || defaultExpenseAccount,
        })),
      );
    }

    const openTill = openTills[0];
    if (openTill?.till_account) {
      const accountValue = `cash:${openTill.till_account}`;
      setValue("payment_account", accountValue);
      setValue("payment_method", "cash");
      setValue("cash_account", String(openTill.till_account));
      setValue("bank_account", "");
      setDefaultsApplied(true);
      return;
    }

    const defaultBank = accountingSettings?.default_bank_account;
    if (defaultBank) {
      const accountValue = `bank:${defaultBank}`;
      setValue("payment_account", accountValue);
      setValue("payment_method", "bank_transfer");
      setValue("bank_account", String(defaultBank));
      setValue("cash_account", "");
      setDefaultsApplied(true);
      return;
    }

    if (bankAccounts[0]?.id) {
      const accountValue = `bank:${bankAccounts[0].id}`;
      setValue("payment_account", accountValue);
      setValue("payment_method", "bank_transfer");
      setValue("bank_account", String(bankAccounts[0].id));
      setValue("cash_account", "");
    }

    setDefaultsApplied(true);
  }, [
    accountingSettings,
    bankAccounts,
    defaultsApplied,
    lineItems,
    openTills,
    replace,
    setValue,
  ]);

  useEffect(() => {
    if (!paymentAccount) return;
    const [kind, id] = paymentAccount.split(":");
    if (kind === "cash") {
      setValue("payment_method", "cash");
      setValue("cash_account", id);
      setValue("bank_account", "");
      return;
    }
    if (kind === "bank") {
      if (paymentMethod === "cash") {
        setValue("payment_method", "bank_transfer");
      }
      setValue("bank_account", id);
      setValue("cash_account", "");
    }
  }, [paymentAccount, paymentMethod, setValue]);

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => billingApi.vendorExpenses.create(payload),
    onSuccess: (expense) => {
      toast({ title: "Expense recorded", description: "Vendor expense posted successfully." });
      if (saveMode === "save_close") {
        router.push("/billing/expenses");
      } else {
        router.push(`/billing/expenses/${expense.id}`);
      }
    },
    onError: (error: unknown) => {
      toast({
        title: "Could not save expense",
        description: getUserFacingError(error, "Could not save vendor expense."),
        variant: "destructive",
      });
    },
  });

  const buildPayload = (data: VendorExpenseForm) => {
    if (!data.vendor) {
      setError("vendor", { type: "manual", message: "Select who you paid." });
      return null;
    }

    if (data.payment_method === "cash" && !data.cash_account) {
      setError("payment_account", {
        type: "manual",
        message: "Open a till for this branch or choose a bank account.",
      });
      return null;
    }

    if (data.payment_method !== "cash" && !data.bank_account) {
      setError("payment_account", {
        type: "manual",
        message: "Select a payment account.",
      });
      return null;
    }

    const validLines = data.line_items.filter(
      (line) => line.description.trim() && parseFloat(line.unit_price) > 0,
    );

    if (validLines.length === 0) {
      toast({
        title: "Add at least one line",
        description: "Enter a description and amount on at least one line.",
        variant: "destructive",
      });
      return null;
    }

    const payload: Record<string, unknown> = {
      vendor: parseInt(data.vendor, 10),
      branch: data.branch ? parseInt(data.branch, 10) : null,
      expense_date: data.expense_date,
      payment_method: data.payment_method,
      reference_number: data.reference_number,
      notes: data.notes,
      line_items: validLines.map((line) => ({
        description: line.description,
        quantity: line.quantity || "1",
        unit_price: line.unit_price,
        ...(line.expense_account ? { expense_account: parseInt(line.expense_account, 10) } : {}),
      })),
    };

    if (data.payment_method === "cash") {
      payload.cash_account = parseInt(data.cash_account, 10);
    } else {
      payload.bank_account = parseInt(data.bank_account, 10);
    }

    return payload;
  };

  const submitExpense = (data: VendorExpenseForm) => {
    const payload = buildPayload(data);
    if (!payload) return;
    createMutation.mutate(payload);
  };

  const clearAllLines = () => {
    const defaultExpenseAccount = accountingSettings?.default_expense_account
      ? String(accountingSettings.default_expense_account)
      : "";
    replace([
      { description: "", quantity: "1", unit_price: "", expense_account: defaultExpenseAccount },
      { description: "", quantity: "1", unit_price: "", expense_account: defaultExpenseAccount },
    ]);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-24">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/billing/expenses">
            <Button variant="outline" size="icon" className="h-9 w-9">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Expense</h1>
            <p className="text-sm text-muted-foreground">
              Record a vendor payment — no bill required.
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Amount</p>
          <p className="text-3xl font-bold tabular-nums">{formatCurrency(subtotal)}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(submitExpense)} className="space-y-6">
        <Card>
          <CardContent className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <Label>Payee</Label>
              <Select value={watch("vendor") || undefined} onValueChange={(v) => setValue("vendor", v, { shouldValidate: true })}>
                <SelectTrigger>
                  <SelectValue placeholder="Who did you pay?" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s: { id: number; name: string }) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Payment account</Label>
              <Select value={paymentAccount || undefined} onValueChange={(v) => setValue("payment_account", v, { shouldValidate: true })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select payment account" />
                </SelectTrigger>
                <SelectContent>
                  {paymentAccountOptions.cashOptions.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Cash — open till</SelectLabel>
                      {paymentAccountOptions.cashOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {paymentAccountOptions.bankOptions.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Bank</SelectLabel>
                      {paymentAccountOptions.bankOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
              {paymentMethod === "cash" && openTills.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  No open till for this branch — open one or pick a bank account.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Payment date</Label>
              <Input type="date" {...register("expense_date", { required: true })} />
            </div>

            <div className="space-y-2">
              <Label>Payment method</Label>
              <Select value={paymentMethod} onValueChange={(v) => setValue("payment_method", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                  <SelectItem value="credit_card">Credit card</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Ref no.</Label>
              <Input {...register("reference_number")} placeholder="Optional" />
            </div>

            <div className="space-y-2">
              <Label>Location</Label>
              <Select value={branchId || undefined} onValueChange={(v) => setValue("branch", v)}>
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
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b px-6 py-3">
              <h2 className="text-sm font-semibold">Category details</h2>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    append({
                      description: "",
                      quantity: "1",
                      unit_price: "",
                      expense_account: accountingSettings?.default_expense_account
                        ? String(accountingSettings.default_expense_account)
                        : "",
                    })
                  }
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add line
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={clearAllLines}>
                  Clear all lines
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="w-10 pl-6">#</TableHead>
                    <TableHead className="min-w-[180px]">Category</TableHead>
                    <TableHead className="min-w-[240px]">Description</TableHead>
                    <TableHead className="w-36 text-right">Amount</TableHead>
                    <TableHead className="w-12 pr-6" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((field, index) => {
                    const line = lineItems[index];
                    const amount = line ? lineTotal(line) : 0;
                    return (
                      <TableRow key={field.id}>
                        <TableCell className="pl-6 align-top pt-4 text-muted-foreground">{index + 1}</TableCell>
                        <TableCell className="align-top pt-3">
                          <Select
                            value={line?.expense_account || "none"}
                            onValueChange={(v) =>
                              setValue(`line_items.${index}.expense_account`, v === "none" ? "" : v)
                            }
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Category" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Default mapping</SelectItem>
                              {expenseAccounts.map((account) => (
                                <SelectItem key={account.id} value={String(account.id)}>
                                  {accountLabel(account)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="align-top pt-3">
                          <Input
                            {...register(`line_items.${index}.description`)}
                            placeholder="What was this expense for?"
                            className="h-9"
                          />
                          <input type="hidden" {...register(`line_items.${index}.quantity`)} value="1" />
                        </TableCell>
                        <TableCell className="align-top pt-3">
                          <Input
                            {...register(`line_items.${index}.unit_price`)}
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            className="h-9 text-right"
                          />
                        </TableCell>
                        <TableCell className="align-top pt-3 pr-6 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <span className="hidden text-sm font-medium tabular-nums sm:inline">
                              {formatCurrency(amount)}
                            </span>
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
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col items-end border-t bg-muted/30 p-6">
            <div className="w-full max-w-xs space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium tabular-nums">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 text-base font-bold">
                <span>Total</span>
                <span className="tabular-nums">{formatCurrency(subtotal)}</span>
              </div>
            </div>
          </CardFooter>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="space-y-2">
              <Label>Memo</Label>
              <Textarea
                {...register("notes")}
                placeholder="Notes visible on this expense"
                rows={3}
                className="resize-none"
              />
            </div>
          </CardContent>
        </Card>

        <div className="sticky bottom-0 z-10 -mx-2 flex flex-wrap items-center justify-end gap-3 border-t bg-background/95 px-2 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <Button variant="outline" type="button" onClick={() => router.push("/billing/expenses")}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="outline"
            disabled={createMutation.isPending}
            onClick={() => setSaveMode("save_close")}
          >
            {createMutation.isPending && saveMode === "save_close" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save and close
          </Button>
          <Button
            type="submit"
            disabled={createMutation.isPending}
            onClick={() => setSaveMode("save")}
          >
            {createMutation.isPending && saveMode === "save" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Save
          </Button>
        </div>
      </form>
    </div>
  );
}
