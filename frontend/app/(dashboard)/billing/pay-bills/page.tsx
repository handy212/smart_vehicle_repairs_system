"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, subMonths, isBefore, parseISO, startOfDay } from "date-fns";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { billingApi, type Bill, type BillPayment } from "@/lib/api/billing";
import { accountingApi, type Account } from "@/lib/api/accounting";
import { branchesApi } from "@/lib/api/branches";
import { quickbooksApi } from "@/lib/api/quickbooks";
import { useQuickBooksConnection } from "@/hooks/useQuickBooksConnection";
import { useBranchStore } from "@/store/branchStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useCurrency } from "@/lib/hooks/useCurrency";
import { getUserFacingError } from "@/lib/api/errors";
import { ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const PAYABLE_STATUSES = new Set(["open", "partially_paid", "overdue"]);
const today = format(new Date(), "yyyy-MM-dd");

function accountLabel(account: Account) {
  return account.code ? `${account.code} — ${account.name}` : account.name;
}

function parseAmount(value: string | number | undefined) {
  const n = parseFloat(String(value ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function isBillOverdue(bill: Bill) {
  if (bill.status === "overdue") return true;
  if (!bill.due_date) return false;
  return isBefore(parseISO(bill.due_date), startOfDay(new Date()));
}

type DateRangeFilter = "12m" | "30d" | "all";
type StatusFilter = "all_open" | "overdue";

export default function PayBillsPage() {
  const router = useRouter();
  const { formatCurrency } = useCurrency();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const activeBranchId = useBranchStore((state) => state.activeBranchId);
  const { isConnected: isQboConnected } = useQuickBooksConnection();

  const [paymentDate, setPaymentDate] = useState(today);
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [paymentAccount, setPaymentAccount] = useState("");
  const [cashAccount, setCashAccount] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [branchId, setBranchId] = useState(activeBranchId ? String(activeBranchId) : "");
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [dateRange, setDateRange] = useState<DateRangeFilter>("12m");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all_open");
  const [vendorFilter, setVendorFilter] = useState<string>("");
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  const [lastPayments, setLastPayments] = useState<BillPayment[]>([]);

  useEffect(() => {
    const vendorParam = searchParams.get("vendor");
    if (vendorParam) setVendorFilter(vendorParam);
  }, [searchParams]);

  useEffect(() => {
    if (activeBranchId && !branchId) {
      setBranchId(String(activeBranchId));
    }
  }, [activeBranchId, branchId]);

  const { data: branches = [] } = useQuery({
    queryKey: ["branches", "active"],
    queryFn: () => branchesApi.list({ is_active: true }),
  });

  const { data: accountingSettings } = useQuery({
    queryKey: ["accounting", "settings"],
    queryFn: () => accountingApi.getAccountingSettings(),
  });

  const settlementBranchId = branchId ? parseInt(branchId, 10) : undefined;

  const { data: tillAccounts = [] } = useQuery({
    queryKey: ["accounting", "till-enabled-accounts", settlementBranchId],
    queryFn: () =>
      accountingApi.getTillEnabledAccounts(
        settlementBranchId ? { branch: settlementBranchId } : undefined,
      ),
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["accounting", "bank-accounts", settlementBranchId],
    queryFn: () =>
      accountingApi.getBankAccounts(settlementBranchId ? { branch: settlementBranchId } : undefined),
  });

  const { data: openTills = [] } = useQuery({
    queryKey: ["accounting", "open-tills", branchId],
    queryFn: () =>
      accountingApi.getTills({
        status: "open",
        ...(branchId ? { branch: branchId } : {}),
      }),
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
      }));

    const bankOptions = bankAccounts.map((account) => ({
      value: `bank:${account.id}`,
      label: accountLabel(account),
    }));

    return { cashOptions, bankOptions, allValues: new Set([...cashOptions, ...bankOptions].map((o) => o.value)) };
  }, [bankAccounts, openTillAccountIds, tillAccounts]);

  const applyPaymentAccount = useCallback(
    (value: string) => {
      if (!value || !paymentAccountOptions.allValues.has(value)) return false;
      setPaymentAccount(value);
      const [kind, id] = value.split(":");
      if (kind === "cash") {
        setPaymentMethod("cash");
        setCashAccount(id);
        setBankAccount("");
      } else {
        setPaymentMethod("bank_transfer");
        setBankAccount(id);
        setCashAccount("");
      }
      return true;
    },
    [paymentAccountOptions.allValues],
  );

  useEffect(() => {
    if (defaultsApplied) return;
    if (!accountingSettings && openTills.length === 0 && bankAccounts.length === 0) return;

    const openTill = openTills[0];
    if (openTill?.till_account) {
      applyPaymentAccount(`cash:${openTill.till_account}`);
      setDefaultsApplied(true);
      return;
    }

    const defaultBank = accountingSettings?.default_bank_account;
    const defaultBankInList =
      defaultBank && bankAccounts.some((account) => account.id === defaultBank);
    if (defaultBankInList) {
      applyPaymentAccount(`bank:${defaultBank}`);
      setDefaultsApplied(true);
      return;
    }

    if (bankAccounts[0]?.id) {
      applyPaymentAccount(`bank:${bankAccounts[0].id}`);
    }
    setDefaultsApplied(true);
  }, [
    accountingSettings,
    applyPaymentAccount,
    bankAccounts,
    defaultsApplied,
    openTills,
  ]);

  useEffect(() => {
    setDefaultsApplied(false);
    setPaymentAccount("");
    setCashAccount("");
    setBankAccount("");
  }, [branchId]);

  useEffect(() => {
    if (paymentAccount && !paymentAccountOptions.allValues.has(paymentAccount)) {
      setPaymentAccount("");
      setCashAccount("");
      setBankAccount("");
    }
  }, [paymentAccount, paymentAccountOptions.allValues]);

  const listParams = useMemo(() => {
    const params: Parameters<typeof billingApi.bills.list>[0] = {
      page_size: 200,
      ordering: "due_date",
    };
    if (vendorFilter) params.vendor = parseInt(vendorFilter, 10);
    if (branchId) params.branch = parseInt(branchId, 10);

    const now = new Date();
    if (dateRange === "12m") {
      params.due_date_from = format(subMonths(now, 12), "yyyy-MM-dd");
    } else if (dateRange === "30d") {
      params.due_date_from = format(subMonths(now, 1), "yyyy-MM-dd");
    }
    return params;
  }, [branchId, dateRange, vendorFilter]);

  const { data: billsResponse, isLoading } = useQuery({
    queryKey: ["pay-bills", listParams],
    queryFn: () => billingApi.bills.list(listParams),
  });

  const openBills = useMemo(() => {
    const rows = billsResponse?.results ?? [];
    return rows.filter((bill: Bill) => {
      const status = bill.status?.toLowerCase() ?? "";
      const due = parseAmount(bill.amount_due);
      if (!PAYABLE_STATUSES.has(status) || due <= 0) return false;
      if (statusFilter === "overdue" && !isBillOverdue(bill)) return false;
      return true;
    });
  }, [billsResponse, statusFilter]);

  useEffect(() => {
    const billParam = searchParams.get("bill");
    if (!billParam || openBills.length === 0) return;
    const bill = openBills.find((row) => String(row.id) === billParam);
    if (bill) {
      if (bill.branch) {
        setBranchId(String(bill.branch));
      }
      setChecked((prev) => ({ ...prev, [bill.id]: true }));
      setSelected((prev) => ({ ...prev, [bill.id]: String(bill.amount_due ?? 0) }));
    }
  }, [searchParams, openBills]);

  const totalOpenBalance = useMemo(
    () => openBills.reduce((sum, bill) => sum + parseAmount(bill.amount_due), 0),
    [openBills],
  );

  const totalPayment = useMemo(() => {
    return Object.entries(selected).reduce((sum, [billId, amount]) => {
      if (!checked[Number(billId)]) return sum;
      return sum + parseAmount(amount);
    }, 0);
  }, [checked, selected]);

  const selectedBillIds = useMemo(
    () =>
      Object.entries(checked)
        .filter(([, isChecked]) => isChecked)
        .map(([id]) => Number(id)),
    [checked],
  );

  const payMutation = useMutation({
    mutationFn: async () => {
      const billsByBatch = new Map<string, { vendor: number; lines: { bill_id: number; amount: string }[] }>();

      for (const billId of selectedBillIds) {
        const bill = openBills.find((b) => b.id === billId);
        if (!bill) continue;
        const amountDue = parseAmount(bill.amount_due);
        let amount = parseAmount(selected[billId]);
        if (!amount || amount <= 0) continue;
        if (amountDue > 0 && amount > amountDue) {
          amount = amountDue;
        }
        const batchKey = `${bill.vendor}:${bill.branch ?? "none"}`;
        const batch = billsByBatch.get(batchKey) ?? { vendor: bill.vendor, lines: [] };
        batch.lines.push({ bill_id: billId, amount: amount.toFixed(2) });
        billsByBatch.set(batchKey, batch);
      }

      const allPayments: BillPayment[] = [];
      for (const { vendor, lines } of billsByBatch.values()) {
        const payload: Parameters<typeof billingApi.payBills>[0] = {
          vendor,
          payment_date: paymentDate,
          payment_method: paymentMethod,
          reference_number: referenceNumber,
          lines,
        };
        if (paymentMethod === "cash") {
          const cashId = parseInt(cashAccount, 10);
          if (!Number.isFinite(cashId)) {
            throw new Error("Select a valid cash account.");
          }
          payload.cash_account = cashId;
        } else {
          const bankId = parseInt(bankAccount, 10);
          if (!Number.isFinite(bankId)) {
            throw new Error("Select a valid bank account.");
          }
          payload.bank_account = bankId;
        }
        const payments = await billingApi.payBills(payload);
        allPayments.push(...payments);
      }
      return allPayments;
    },
    onSuccess: (payments) => {
      setLastPayments(payments);
      toast({
        title: "Payment recorded",
        description: isQboConnected
          ? `${payments.length} payment(s) recorded. QuickBooks sync runs in the background.`
          : `${payments.length} payment(s) recorded successfully.`,
      });
      setSelected({});
      setChecked({});
      queryClient.invalidateQueries({ queryKey: ["pay-bills"] });
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "bill-payments"] });
    },
    onError: (error: unknown) => {
      toast({
        title: "Payment failed",
        description: getUserFacingError(error, "Could not record bill payment."),
        variant: "destructive",
      });
    },
  });

  const toggleBill = (bill: Bill, isChecked: boolean) => {
    setChecked((prev) => ({ ...prev, [bill.id]: isChecked }));
    setSelected((prev) => {
      const next = { ...prev };
      if (isChecked) {
        next[bill.id] = String(bill.amount_due ?? 0);
      } else {
        delete next[bill.id];
      }
      return next;
    });
  };

  const handlePay = () => {
    if (!paymentAccount) {
      toast({
        title: "Payment account required",
        description: "Select the bank or cash account to pay from.",
        variant: "destructive",
      });
      return;
    }
    if (selectedBillIds.length === 0) {
      toast({
        title: "No bills selected",
        description: "Check one or more bills and enter a payment amount.",
        variant: "destructive",
      });
      return;
    }
    const selectedBills = openBills.filter((bill) => checked[bill.id]);
    const branchIds = new Set(selectedBills.map((bill) => bill.branch).filter(Boolean));
    if (branchIds.size > 1) {
      toast({
        title: "Multiple locations selected",
        description: "Pay bills from one location at a time, or filter by branch first.",
        variant: "destructive",
      });
      return;
    }
    if (branchIds.size === 1 && branchId && selectedBills.some((bill) => String(bill.branch) !== branchId)) {
      toast({
        title: "Location mismatch",
        description: "Selected bills do not match the Location filter. Adjust the filter or selection.",
        variant: "destructive",
      });
      return;
    }
    payMutation.mutate();
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col pb-24">
      {/* Header — QBO-style title + total */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b pb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pay Bills</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Select bills to pay from your payment account.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Total payment amount
          </p>
          <p className="text-3xl font-bold tabular-nums">{formatCurrency(totalPayment)}</p>
        </div>
      </div>

      {/* Top fields — payment account, date, ref, location */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Payment account</Label>
          <Select
            value={paymentAccount || undefined}
            onValueChange={(value) => applyPaymentAccount(value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select an account" />
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
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Payment date</Label>
          <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Ref no.</Label>
          <Input
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
            placeholder="Optional"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Location</Label>
          <Select value={branchId || undefined} onValueChange={setBranchId}>
            <SelectTrigger>
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={String(branch.id)}>
                  {branch.name}
                  {branch.code ? ` (${branch.code})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all_open">All open</SelectItem>
            <SelectItem value="overdue">Overdue only</SelectItem>
          </SelectContent>
        </Select>
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRangeFilter)}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="12m">Last 12 months</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="all">All dates</SelectItem>
          </SelectContent>
        </Select>
        {vendorFilter && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setVendorFilter("")}>
            Clear vendor filter
          </Button>
        )}
      </div>

      {/* Bills table — QBO columns */}
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-10" />
              <TableHead className="text-xs uppercase">Payee</TableHead>
              <TableHead className="text-xs uppercase">Ref no.</TableHead>
              <TableHead className="text-xs uppercase">Due date</TableHead>
              <TableHead className="text-xs uppercase">Status</TableHead>
              <TableHead className="text-right text-xs uppercase">Open balance</TableHead>
              <TableHead className="text-right text-xs uppercase">Credit applied</TableHead>
              <TableHead className="w-28 text-right text-xs uppercase">Payment</TableHead>
              <TableHead className="text-right text-xs uppercase">Total amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : openBills.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center text-sm text-muted-foreground">
                  No open bills to pay for this location and date range.
                </TableCell>
              </TableRow>
            ) : (
              openBills.map((bill) => {
                const isChecked = Boolean(checked[bill.id]);
                const paymentAmount = parseAmount(selected[bill.id]);
                const overdue = isBillOverdue(bill);
                return (
                  <TableRow key={bill.id} className={isChecked ? "bg-primary/5" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(value) => toggleBill(bill, Boolean(value))}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{bill.vendor_name || "—"}</div>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/billing/bills/${bill.id}`}
                        className="text-sm text-primary hover:underline"
                      >
                        {bill.bill_number}
                      </Link>
                      {bill.reference_number && (
                        <div className="text-xs text-muted-foreground">{bill.reference_number}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {bill.due_date ? format(parseISO(bill.due_date), "dd/MM/yyyy") : "—"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "text-sm capitalize",
                          overdue ? "font-medium text-amber-600" : "text-muted-foreground",
                        )}
                      >
                        {overdue ? "Overdue" : bill.status.replace(/_/g, " ")}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(parseAmount(bill.amount_due))}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">—</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={!isChecked}
                        value={selected[bill.id] ?? ""}
                        onChange={(e) =>
                          setSelected((prev) => ({ ...prev, [bill.id]: e.target.value }))
                        }
                        className="ml-auto h-8 w-24 text-right tabular-nums"
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {isChecked ? formatCurrency(paymentAmount) : formatCurrency(0)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}

            {openBills.length > 0 && (
              <TableRow className="border-t-2 bg-muted/20 font-medium hover:bg-muted/20">
                <TableCell colSpan={5} className="text-sm">
                  Total payment
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(totalOpenBalance)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">—</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(totalPayment)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(totalPayment)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {lastPayments.length > 0 && (
        <div className="mt-6 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">
              {lastPayments.length} payment{lastPayments.length === 1 ? "" : "s"} recorded (
              {formatCurrency(lastPayments.reduce((s, p) => s + parseAmount(p.amount), 0))})
            </p>
            <Link href="/billing/vendor-payments">
              <Button variant="outline" size="sm">
                <ExternalLink className="mr-2 h-4 w-4" />
                Payment history
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Sticky footer */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Button variant="outline" onClick={() => router.push("/billing/bills")}>
            Cancel
          </Button>
          <Button
            onClick={handlePay}
            disabled={selectedBillIds.length === 0 || payMutation.isPending}
          >
            {payMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save payment
          </Button>
        </div>
      </div>
    </div>
  );
}
