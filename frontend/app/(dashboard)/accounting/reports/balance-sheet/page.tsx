"use client";

import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { useState } from "react";
import { Filter, ArrowLeft } from "lucide-react";
import { useCurrency } from "@/lib/hooks/useCurrency";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AccountingReportSkeleton } from "../../components/AccountingReportSkeleton";
import { AccountingReportToolbar } from "../../components/AccountingReportToolbar";
import { AccountingReportPrintHeader } from "../../components/AccountingReportPrintHeader";
import { buildBalanceSheetExportPayload } from "@/lib/utils/accounting-report-export";

export default function BalanceSheetPage() {
  const { formatCurrency } = useCurrency();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [showFilters, setShowFilters] = useState(false);

  const { data: report, isLoading } = useQuery({
    queryKey: ["accounting", "balance-sheet", date],
    queryFn: () => accountingApi.getBalanceSheet(date),
  });

  const getExportPayload = () =>
    report ? buildBalanceSheetExportPayload(report, date) : null;

  return (
    <div className="space-y-6 p-6">
      <div className="no-print flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/accounting" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Balance Sheet</h1>
          </div>
          <p className="text-sm text-muted-foreground">Statement of Financial Position</p>
        </div>
        <AccountingReportToolbar
          getExportPayload={getExportPayload}
          disabled={!report}
          isLoading={isLoading}
          reportPrint={{
            slug: "balance-sheet",
            getQueryParams: () => ({ date }),
            pdfFilename: `balance-sheet_${date}`,
          }}
        >
          <Button
            variant="secondary"
            onClick={() => setShowFilters(!showFilters)}
            className="sm:hidden"
            size="sm"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
          <div
            className={`flex items-center gap-2 ${showFilters ? "flex" : "hidden sm:flex"}`}
          >
            <span className="text-sm text-muted-foreground">As of:</span>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full sm:w-40 h-9 text-sm"
            />
          </div>
        </AccountingReportToolbar>
      </div>

      <AccountingReportPrintHeader
        title="Balance Sheet"
        dateInfo={`As of ${date}`}
      />

      {isLoading ? (
        <AccountingReportSkeleton />
      ) : report ? (
        <div className="print-container grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Assets</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.assets.map((acc) => (
                    <TableRow key={acc.code}>
                      <TableCell>
                        <span className="font-medium text-foreground">{acc.code}</span> - {acc.name}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(acc.balance)}</TableCell>
                    </TableRow>
                  ))}
                  {report.assets.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center text-muted-foreground">
                        No assets found
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow className="font-bold bg-muted/50">
                    <TableCell>Total Assets</TableCell>
                    <TableCell className="text-right">{formatCurrency(report.totals.assets)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Liabilities</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.liabilities.map((acc) => (
                      <TableRow key={acc.code}>
                        <TableCell>
                          <span className="font-medium text-foreground">{acc.code}</span> - {acc.name}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(acc.balance)}</TableCell>
                      </TableRow>
                    ))}
                    {report.liabilities.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-muted-foreground">
                          No liabilities found
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow className="font-bold bg-muted/50">
                      <TableCell>Total Liabilities</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(report.totals.liabilities)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Equity</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.equity.map((acc) => (
                      <TableRow key={acc.code}>
                        <TableCell>
                          <span className="font-medium text-foreground">{acc.code}</span> - {acc.name}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(acc.balance)}</TableCell>
                      </TableRow>
                    ))}
                    {report.equity.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-muted-foreground">
                          No equity records found
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow className="font-bold bg-muted/50">
                      <TableCell>Total Equity</TableCell>
                      <TableCell className="text-right">{formatCurrency(report.totals.equity)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card
              className={
                report.is_balanced
                  ? "border-green-200 bg-success/10"
                  : "border-destructive/20 bg-destructive/10/50"
              }
            >
              <CardContent className="pt-6">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-foreground">Total Liabilities + Equity</span>
                  <span
                    className={`font-bold ${report.is_balanced ? "text-green-700" : "text-destructive"}`}
                  >
                    {formatCurrency(report.totals.liabilities_plus_equity)}
                  </span>
                </div>
                {!report.is_balanced && (
                  <p className="text-xs text-destructive mt-1">
                    Warning: Balance Sheet is not balanced!
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="text-center py-10 text-muted-foreground">No data available</div>
      )}
    </div>
  );
}
