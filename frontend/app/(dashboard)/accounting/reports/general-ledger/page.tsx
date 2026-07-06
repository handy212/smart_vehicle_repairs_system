"use client";

import { AccountingReportSkeleton } from "../../components/AccountingReportSkeleton";

import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { BranchReportChip } from "@/components/reporting/BranchReportChip";
import { useBranchStore } from "@/store/branchStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, startOfMonth } from "date-fns";
import { useState } from "react";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { AccountingReportToolbar } from "../../components/AccountingReportToolbar";
import { AccountingReportPrintHeader } from "../../components/AccountingReportPrintHeader";
import type { TableExportPayload } from "@/lib/utils/report-export";

type LedgerLine = {
  id: number;
  date: string;
  account_code?: string;
  account_name?: string;
  description?: string;
  debit?: string | number;
  credit?: string | number;
  reference?: string;
};

export default function GeneralLedgerPage() {
  const { formatCurrency } = useCurrency();
  const { activeBranchId } = useBranchStore();
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["general-ledger", startDate, endDate, activeBranchId],
    queryFn: () =>
      accountingApi.getGeneralLedger({
        start_date: startDate,
        end_date: endDate})});

  const results = (data as { results?: LedgerLine[] })?.results ?? (data as LedgerLine[]) ?? [];

  const buildExportPayload = (): TableExportPayload | null => {
    if (results.length === 0) return null;
    return {
      filename: `general-ledger_${startDate}_${endDate}`,
      reportTitle: "General Ledger",
      dateInfo: `Period: ${startDate} to ${endDate}`,
      headers: ["Date", "Account", "Description", "Debit", "Credit"],
      rows: results.map((line) => [
        line.date,
        `${line.account_code ?? ""} ${line.account_name ?? ""}`.trim(),
        line.description ?? line.reference ?? "",
        Number(line.debit) > 0 ? Number(line.debit) : "",
        Number(line.credit) > 0 ? Number(line.credit) : "",
      ]),
      currencyColumnIndexes: [3, 4]};
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">General Ledger</h1>
          <p className="text-sm text-muted-foreground mt-1">Posted journal lines for the selected period.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <AccountingReportToolbar
            getExportPayload={buildExportPayload}
            disabled={isLoading || results.length === 0}
            isLoading={isLoading}
            reportPrint={{
              slug: "general-ledger",
              getQueryParams: () => ({
                start_date: startDate,
                end_date: endDate,
              }),
              pdfFilename: `general-ledger_${startDate}_${endDate}`,
            }}
          >
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40 h-9 text-sm" />
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40 h-9 text-sm" />
          </AccountingReportToolbar>
          <BranchReportChip />
        </div>
      </div>
      <AccountingReportPrintHeader title="General Ledger" dateInfo={`${startDate} to ${endDate}`} />
      <Card className="print-container">
        <CardHeader>
          <CardTitle className="text-base">Transactions</CardTitle>
        </CardHeader>
        <CardContent className="max-h-[600px] overflow-auto">
          {isLoading && <AccountingReportSkeleton compact rows={5} />}
          {isError && (
            <p className="text-sm text-destructive">
              Failed to load ledger.{" "}
              <button type="button" className="underline" onClick={() => refetch()}>
                Retry
              </button>
            </p>
          )}
          {!isLoading && !isError && results.length === 0 && (
            <p className="text-sm text-muted-foreground">No posted lines in this period.</p>
          )}
          {results.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>{line.date}</TableCell>
                    <TableCell>
                      {line.account_code} {line.account_name}
                    </TableCell>
                    <TableCell>{line.description ?? line.reference ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {Number(line.debit) > 0 ? formatCurrency(Number(line.debit)) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {Number(line.credit) > 0 ? formatCurrency(Number(line.credit)) : "—"}
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
