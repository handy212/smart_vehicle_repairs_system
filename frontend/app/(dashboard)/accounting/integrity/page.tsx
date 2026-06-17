"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { accountingApi } from "@/lib/api/accounting";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertTriangle, RotateCcw, ExternalLink } from "lucide-react";

function formatMoney(value: number, format: (n: number) => string): string {
  return format(value);
}

function BalanceRow({
  label,
  value,
  format,
  emphasize,
}: {
  label: string;
  value: number;
  format: (n: number) => string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={emphasize ? "font-semibold text-foreground" : "font-medium"}>
        {formatMoney(value, format)}
      </span>
    </div>
  );
}

export default function SubledgerIntegrityPage() {
  const { formatCurrency } = useCurrency();

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["accounting", "subledger-reconciliation"],
    queryFn: () => accountingApi.getSubledgerReconciliation(),
  });

  const ar = data?.accounts_receivable;
  const ap = data?.accounts_payable;
  const prepayments = data?.customer_prepayments;

  return (
    <div className="space-y-4 p-4 md:p-0 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Subledger Integrity</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Compare general ledger control balances to open invoices and bills. AR and AP should
            match within {data?.tolerance ?? 0.01}. See the{" "}
            <Link href="/accounting/controls" className="text-primary hover:underline">
              Controls
            </Link>{" "}
            page to wire control accounts.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
          )}
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-8 text-center space-y-2">
            <p className="text-sm text-destructive">Could not load subledger reconciliation.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div
            className={`rounded-lg border px-4 py-3 flex items-center gap-3 ${
              data?.overall_in_balance
                ? "border-success/40 bg-success/5"
                : "border-warning/40 bg-warning/5"
            }`}
          >
            {data?.overall_in_balance ? (
              <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
            )}
            <div>
              <p className="text-sm font-semibold text-foreground">
                {data?.overall_in_balance
                  ? "Subledgers are in balance"
                  : "Subledger drift detected"}
              </p>
              <p className="text-xs text-muted-foreground">
                {data?.overall_in_balance
                  ? "GL control accounts match operational open balances."
                  : "Contact your administrator to run integrity repair commands."}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm font-semibold">
                    Accounts Receivable
                    {ar?.control_account_code && (
                      <span className="text-muted-foreground font-normal ml-1">
                        ({ar.control_account_code})
                      </span>
                    )}
                  </CardTitle>
                  <Badge variant={ar?.in_balance ? "success" : "danger"} className="text-xs">
                    {ar?.in_balance ? "In balance" : "Out of balance"}
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  {ar?.open_invoice_count ?? 0} open invoice(s),{" "}
                  {ar?.open_credit_note_count ?? 0} unapplied credit note(s)
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0 space-y-2">
                <BalanceRow label="GL balance (1200)" value={ar?.gl_balance ?? 0} format={formatCurrency} />
                <BalanceRow
                  label="Less prepayment GL (2150)"
                  value={ar?.prepayment_gl_balance ?? 0}
                  format={formatCurrency}
                />
                <BalanceRow
                  label="Net GL balance"
                  value={ar?.net_gl_balance ?? 0}
                  format={formatCurrency}
                  emphasize
                />
                <BalanceRow
                  label="Operational subledger (net)"
                  value={ar?.subledger_net_of_credits_and_prepayments ?? ar?.subledger_net_of_credits ?? 0}
                  format={formatCurrency}
                  emphasize
                />
                <div className="border-t border-border pt-2 mt-2">
                  <BalanceRow
                    label="Difference"
                    value={ar?.difference ?? 0}
                    format={formatCurrency}
                    emphasize
                  />
                </div>
                <Link
                  href="/accounting/reports/aging?type=ar"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-2"
                >
                  AR aging report
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm font-semibold">
                    Accounts Payable
                    {ap?.control_account_code && (
                      <span className="text-muted-foreground font-normal ml-1">
                        ({ap.control_account_code})
                      </span>
                    )}
                  </CardTitle>
                  <Badge variant={ap?.in_balance ? "success" : "danger"} className="text-xs">
                    {ap?.in_balance ? "In balance" : "Out of balance"}
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  {ap?.open_bill_count ?? 0} open bill(s),{" "}
                  {ap?.open_vendor_credit_count ?? 0} unapplied vendor credit(s)
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0 space-y-2">
                <BalanceRow label="GL balance (2000)" value={ap?.gl_balance ?? 0} format={formatCurrency} />
                <BalanceRow
                  label="Operational subledger (net)"
                  value={ap?.subledger_net_of_credits ?? 0}
                  format={formatCurrency}
                  emphasize
                />
                <div className="border-t border-border pt-2 mt-2">
                  <BalanceRow
                    label="Difference"
                    value={ap?.difference ?? 0}
                    format={formatCurrency}
                    emphasize
                  />
                </div>
                <Link
                  href="/accounting/reports/aging?type=ap"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-2"
                >
                  AP aging report
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </CardContent>
            </Card>
          </div>

          {prepayments && (
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-semibold">
                  Customer Prepayments
                  {prepayments.control_account_code && (
                    <span className="text-muted-foreground font-normal ml-1">
                      ({prepayments.control_account_code})
                    </span>
                  )}
                </CardTitle>
                <CardDescription className="text-xs">
                  {prepayments.configured
                    ? "Overpayments held for future invoice application."
                    : "Control account not configured — wire controls to enable prepayment posting."}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <BalanceRow
                  label="GL balance"
                  value={prepayments.gl_balance}
                  format={formatCurrency}
                />
                <BalanceRow
                  label="Operational unapplied"
                  value={prepayments.operational_balance}
                  format={formatCurrency}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
