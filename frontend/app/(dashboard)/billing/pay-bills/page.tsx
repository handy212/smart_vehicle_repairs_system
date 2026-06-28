"use client";

import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { billingApi, type Bill, type BillPayment } from "@/lib/api/billing";
import { inventoryApi } from "@/lib/api/inventory";
import { accountingApi } from "@/lib/api/accounting";
import { quickbooksApi } from "@/lib/api/quickbooks";
import { useQuickBooksConnection } from "@/hooks/useQuickBooksConnection";
import { QboListCell } from "@/components/integrations/QboListCell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
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
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";

const PAYABLE_STATUSES = new Set(["open", "partially_paid", "overdue"]);

export default function PayBillsPage() {
  const { formatCurrency } = useCurrency();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { isConnected: isQboConnected } = useQuickBooksConnection();
  const [vendorId, setVendorId] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [cashAccount, setCashAccount] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [lastPayments, setLastPayments] = useState<BillPayment[]>([]);
  const [syncingPaymentId, setSyncingPaymentId] = useState<number | null>(null);

  useEffect(() => {
    const vendorParam = searchParams.get("vendor");
    if (vendorParam) {
      setVendorId(vendorParam);
    }
  }, [searchParams]);

  const { data: suppliersResponse } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => inventoryApi.listSuppliers({ is_active: true }),
  });
  const suppliers = Array.isArray(suppliersResponse)
    ? suppliersResponse
    : suppliersResponse?.results || [];

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

  const { data: billsResponse, isLoading } = useQuery({
    queryKey: ["pay-bills", vendorId],
    queryFn: () =>
      billingApi.bills.list({
        vendor: parseInt(vendorId, 10),
        page_size: 100,
        ordering: "due_date",
      }),
    enabled: Boolean(vendorId),
  });

  const openBills = useMemo(() => {
    const rows = billsResponse?.results ?? [];
    return rows.filter((bill: Bill) => {
      const status = bill.status?.toLowerCase() ?? "";
      const due = parseFloat(String(bill.amount_due ?? 0));
      return PAYABLE_STATUSES.has(status) && due > 0;
    });
  }, [billsResponse]);

  useEffect(() => {
    const billParam = searchParams.get("bill");
    if (!billParam || !vendorId || openBills.length === 0) return;
    const bill = openBills.find((row) => String(row.id) === billParam);
    if (bill) {
      setSelected({ [bill.id]: String(bill.amount_due ?? 0) });
    }
  }, [searchParams, vendorId, openBills]);

  const totalSelected = useMemo(() => {
    return Object.entries(selected).reduce((sum, [, amount]) => {
      const parsed = parseFloat(amount || "0");
      return sum + (Number.isNaN(parsed) ? 0 : parsed);
    }, 0);
  }, [selected]);

  const payMutation = useMutation({
    mutationFn: () => {
      const payload: Parameters<typeof billingApi.payBills>[0] = {
        vendor: parseInt(vendorId, 10),
        payment_date: paymentDate,
        payment_method: paymentMethod,
        reference_number: referenceNumber,
        lines: Object.entries(selected).map(([billId, amount]) => ({
          bill_id: parseInt(billId, 10),
          amount,
        })),
      };
      if (paymentMethod === "cash") {
        payload.cash_account = parseInt(cashAccount, 10);
      } else {
        payload.bank_account = parseInt(bankAccount, 10);
      }
      return billingApi.payBills(payload);
    },
    onSuccess: (payments) => {
      setLastPayments(payments);
      toast({
        title: "Payment recorded",
        description: isQboConnected
          ? "Bills paid in SVR. QuickBooks sync runs in the background — check status below."
          : "Vendor bills were paid successfully.",
      });
      setSelected({});
      queryClient.invalidateQueries({ queryKey: ["pay-bills"] });
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "bill-payments"] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: Record<string, string | string[]> } };
      const data = apiError.response?.data;
      const firstFieldError = data
        ? Object.values(data)
            .map((value) => (Array.isArray(value) ? value.join(" ") : value))
            .find(Boolean)
        : undefined;
      toast({
        title: "Payment failed",
        description: firstFieldError || "Could not record bill payment.",
        variant: "destructive",
      });
    },
  });

  const handlePay = () => {
    if (paymentMethod === "cash" && !cashAccount) {
      toast({
        title: "Cash account required",
        description: "Select the till-enabled cash account for this payment.",
        variant: "destructive",
      });
      return;
    }
    if (paymentMethod !== "cash" && !bankAccount) {
      toast({
        title: "Bank account required",
        description: "Select the bank account to pay from.",
        variant: "destructive",
      });
      return;
    }
    payMutation.mutate();
  };

  const handlePushPayment = async (paymentId: number) => {
    try {
      setSyncingPaymentId(paymentId);
      await quickbooksApi.syncOutbound({ entity_type: "bill_payment", object_id: paymentId });
      toast({
        title: "QuickBooks sync",
        description: "Bill payment push triggered. Status should update shortly.",
      });
      queryClient.invalidateQueries({ queryKey: ["billing", "bill-payments"] });
      setLastPayments((current) =>
        current.map((payment) =>
          payment.id === paymentId
            ? { ...payment, qbo_sync_status: "pending", qbo_sync_error: null }
            : payment
        )
      );
    } catch {
      toast({
        title: "QuickBooks sync failed",
        description: "Could not push bill payment to QuickBooks.",
        variant: "destructive",
      });
    } finally {
      setSyncingPaymentId(null);
    }
  };

  const toggleBill = (bill: Bill, checked: boolean) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (checked) {
        next[bill.id] = String(bill.amount_due ?? 0);
      } else {
        delete next[bill.id];
      }
      return next;
    });
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Link href="/billing/bills">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Bills
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Pay Bills</h1>
          <p className="text-sm text-muted-foreground">
            Select open bills and pay one or more in a single payment run (QBO-style).
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label>Vendor</Label>
            <Select
              value={vendorId}
              onValueChange={(value) => {
                setVendorId(value);
                setSelected({});
                setLastPayments([]);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select vendor" />
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
            <Label>Payment date</Label>
            <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Payment method</Label>
            <Select
              value={paymentMethod}
              onValueChange={(value) => {
                setPaymentMethod(value);
                setCashAccount("");
                setBankAccount("");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                <SelectItem value="check">Check</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="credit_card">Credit card</SelectItem>
                <SelectItem value="mobile_money">Mobile money</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Reference #</Label>
            <Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
          </div>

          {paymentMethod === "cash" ? (
            <div className="space-y-2 md:col-span-2 lg:col-span-4">
              <Label>Cash account (till)</Label>
              <Select value={cashAccount} onValueChange={setCashAccount}>
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
              <p className="text-xs text-muted-foreground">
                Required for QBO sync. Cash payments need an open till on this account.
              </p>
            </div>
          ) : (
            <div className="space-y-2 md:col-span-2 lg:col-span-4">
              <Label>Bank account</Label>
              <Select value={bankAccount} onValueChange={setBankAccount}>
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
              <p className="text-xs text-muted-foreground">
                Required for QBO Bill Payment sync — this is the account money leaves in QuickBooks.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Open bills</CardTitle>
          <span className="text-sm font-semibold">
            Total selected: {formatCurrency(totalSelected)}
          </span>
        </CardHeader>
        <CardContent>
          {!vendorId ? (
            <p className="text-sm text-muted-foreground">Select a vendor to see open bills.</p>
          ) : isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : openBills.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open bills for this vendor.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Bill #</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead>Open balance</TableHead>
                  {isQboConnected ? <TableHead>QBO</TableHead> : null}
                  <TableHead>Payment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openBills.map((bill: Bill) => (
                  <TableRow key={bill.id}>
                    <TableCell>
                      <Checkbox
                        checked={bill.id in selected}
                        onCheckedChange={(checked) => toggleBill(bill, Boolean(checked))}
                      />
                    </TableCell>
                    <TableCell>
                      <Link href={`/billing/bills/${bill.id}`} className="font-medium hover:underline">
                        {bill.bill_number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {bill.due_date ? format(new Date(bill.due_date), "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell>{formatCurrency(bill.amount_due ?? 0)}</TableCell>
                    {isQboConnected ? (
                      <TableCell>
                        <QboListCell
                          connected={isQboConnected}
                          status={bill.qbo_sync_status}
                          error={bill.qbo_sync_error}
                        />
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={!(bill.id in selected)}
                        value={selected[bill.id] ?? ""}
                        onChange={(e) =>
                          setSelected((prev) => ({ ...prev, [bill.id]: e.target.value }))
                        }
                        className="h-8 w-32"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {lastPayments.length > 0 ? (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Last payment recorded</CardTitle>
            <Link href="/billing/vendor-payments">
              <Button variant="outline" size="sm">
                <ExternalLink className="mr-2 h-4 w-4" />
                Payment history
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {lastPayments.length} bill{lastPayments.length === 1 ? "" : "s"} paid for{" "}
              {formatCurrency(lastPayments.reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0))}.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment #</TableHead>
                  <TableHead>Bill</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {isQboConnected ? <TableHead>QBO</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lastPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-mono text-xs">
                      <Link
                        href={`/billing/vendor-payments/${payment.id}`}
                        className="text-primary hover:underline"
                      >
                        {payment.payment_number}
                      </Link>
                    </TableCell>
                    <TableCell>{payment.bill_number ?? `#${payment.bill}`}</TableCell>
                    <TableCell className="text-right">{formatCurrency(payment.amount)}</TableCell>
                    {isQboConnected ? (
                      <TableCell>
                        <QboListCell
                          connected={isQboConnected}
                          status={payment.qbo_sync_status}
                          error={payment.qbo_sync_error}
                          onRetry={() => handlePushPayment(payment.id)}
                          isRetrying={syncingPaymentId === payment.id}
                        />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button
          disabled={!vendorId || Object.keys(selected).length === 0 || payMutation.isPending}
          onClick={handlePay}
        >
          {payMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save payment
        </Button>
      </div>
    </div>
  );
}
