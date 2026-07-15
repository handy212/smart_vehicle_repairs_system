"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth } from "date-fns";
import { accountingApi, type Account, type GeneralLedgerLine } from "@/lib/api/accounting";
import { AccountingReportSkeleton } from "../../components/AccountingReportSkeleton";
import { AccountingReportToolbar } from "../../components/AccountingReportToolbar";
import { AccountingReportPrintHeader } from "../../components/AccountingReportPrintHeader";
import { BranchReportChip } from "@/components/reporting/BranchReportChip";
import { useBranchStore } from "@/store/branchStore";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { cn } from "@/lib/utils/cn";
import { ACCOUNTING_TABLE_HEAD_CLASS } from "@/lib/constants/table-typography";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TableExportPayload } from "@/lib/utils/report-export";

function isCreditNormalAccount(account?: Account | null): boolean {
  if (!account) return false;
  if (account.balance_type === "credit") return true;
  if (account.balance_type === "debit") return false;
  return ["liability", "equity", "income", "revenue"].includes(account.account_type);
}

function signedAmount(line: GeneralLedgerLine, creditNormal: boolean): number {
  const amount = Number(line.amount || 0);
  if (line.transaction_type === "debit") {
    return creditNormal ? -amount : amount;
  }
  return creditNormal ? amount : -amount;
}

export default function AccountRegisterPage() {
  const { formatCurrency } = useCurrency();
  const { activeBranchId } = useBranchStore();
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [accountId, setAccountId] = useState<string>("");

  const { data: accounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: ["accounting", "accounts", "register"],
    queryFn: () => accountingApi.getAccounts({ is_active: true }),
  });

  const selectedAccount = accounts.find((account) => String(account.id) === accountId) ?? null;
  const creditNormal = isCreditNormalAccount(selectedAccount);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["accounting", "account-register", accountId, startDate, endDate, activeBranchId],
    queryFn: () =>
      accountingApi.getGeneralLedger({
        start_date: startDate,
        end_date: endDate,
        account_id: Number(accountId),
      }),
    enabled: Boolean(accountId),
  });

  const lines = useMemo(() => {
    const raw = (data as { results?: GeneralLedgerLine[] })?.results ?? (data as GeneralLedgerLine[]) ?? [];
    return [...raw].sort((a, b) => {
      const dateCompare = String(a.date).localeCompare(String(b.date));
      if (dateCompare !== 0) return dateCompare;
      return Number(a.id) - Number(b.id);
    });
  }, [data]);

  const rowsWithBalance = useMemo(() => {
    let running = 0;
    return lines.map((line) => {
      running += signedAmount(line, creditNormal);
      return { line, running };
    });
  }, [lines, creditNormal]);

  const buildExportPayload = (): TableExportPayload | null => {
    if (!selectedAccount || rowsWithBalance.length === 0) return null;
    return {
      filename: `account-register_${selectedAccount.code}_${startDate}_${endDate}`,
      reportTitle: "Account Register",
      dateInfo: `${selectedAccount.code} ${selectedAccount.name} | ${startDate} to ${endDate}`,
      headers: ["Date", "Reference", "Description", "Debit", "Credit", "Balance"],
      rows: rowsWithBalance.map(({ line, running }) => [
        line.date,
        line.reference ?? "",
        line.description ?? "",
        line.transaction_type === "debit" ? Number(line.amount) : "",
        line.transaction_type === "credit" ? Number(line.amount) : "",
        running,
      ]),
      currencyColumnIndexes: [3, 4, 5],
    };
  };

  return (
    <div className="space-y-4">
      <div className="no-print space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4 pt-2">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Account Register</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Posted GL lines for a single account with running balance
            </p>
          </div>
          <BranchReportChip />
        </div>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-1">
                <Label className="text-xs">Account</Label>
                <Select value={accountId} onValueChange={setAccountId} disabled={loadingAccounts}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={String(account.id)}>
                        {account.code} — {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="start_date" className="text-xs">Start Date</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <Label htmlFor="end_date" className="text-xs">End Date</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <AccountingReportToolbar
          getExportPayload={buildExportPayload}
          disabled={!accountId || rowsWithBalance.length === 0}
          isLoading={isLoading}
        />
      </div>

      <AccountingReportPrintHeader
        title="Account Register"
        dateInfo={
          selectedAccount
            ? `${selectedAccount.code} ${selectedAccount.name} | ${startDate} to ${endDate}`
            : `${startDate} to ${endDate}`
        }
      />

      <Card className="print-container overflow-hidden">
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-base">Transactions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!accountId ? (
            <p className="p-6 text-sm text-muted-foreground">Select an account to view its register.</p>
          ) : isLoading ? (
            <AccountingReportSkeleton compact rows={6} />
          ) : isError ? (
            <p className="p-6 text-sm text-destructive">
              Failed to load register.{" "}
              <button type="button" className="underline" onClick={() => refetch()}>
                Retry
              </button>
            </p>
          ) : rowsWithBalance.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No posted lines in this period.</p>
          ) : (
            <Table>
              <TableHeader className="bg-muted/10">
                <TableRow className="hover:bg-transparent border-none">
                  <TableHead className={ACCOUNTING_TABLE_HEAD_CLASS}>Date</TableHead>
                  <TableHead className={ACCOUNTING_TABLE_HEAD_CLASS}>Reference</TableHead>
                  <TableHead className={ACCOUNTING_TABLE_HEAD_CLASS}>Description</TableHead>
                  <TableHead className={cn(ACCOUNTING_TABLE_HEAD_CLASS, "text-right")}>Debit</TableHead>
                  <TableHead className={cn(ACCOUNTING_TABLE_HEAD_CLASS, "text-right")}>Credit</TableHead>
                  <TableHead className={cn(ACCOUNTING_TABLE_HEAD_CLASS, "text-right")}>Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowsWithBalance.map(({ line, running }) => (
                  <TableRow key={line.id} className="border-b border-border hover:bg-muted/20">
                    <TableCell className="px-4 py-2 text-sm">{line.date}</TableCell>
                    <TableCell className="px-4 py-2 text-sm">{line.reference ?? "—"}</TableCell>
                    <TableCell className="px-4 py-2 text-sm">{line.description ?? "—"}</TableCell>
                    <TableCell className="px-4 py-2 text-sm text-right font-mono">
                      {line.transaction_type === "debit" ? formatCurrency(Number(line.amount)) : "—"}
                    </TableCell>
                    <TableCell className="px-4 py-2 text-sm text-right font-mono">
                      {line.transaction_type === "credit" ? formatCurrency(Number(line.amount)) : "—"}
                    </TableCell>
                    <TableCell className="px-4 py-2 text-sm text-right font-mono font-medium">
                      {formatCurrency(running)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
