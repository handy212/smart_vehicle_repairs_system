"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth } from "date-fns";
import { accountingApi } from "@/lib/api/accounting";
import { AccountingReportSkeleton } from "../../components/AccountingReportSkeleton";
import { AccountingReportToolbar } from "../../components/AccountingReportToolbar";
import { AccountingReportPrintHeader } from "../../components/AccountingReportPrintHeader";
import { BranchReportChip } from "@/components/reporting/BranchReportChip";
import { useBranchStore } from "@/store/branchStore";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";

export default function VatReturnPage() {
  const { formatCurrency } = useCurrency();
  const { activeBranchId } = useBranchStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [filingReference, setFilingReference] = useState("");

  const { data: report, isLoading } = useQuery({
    queryKey: ["accounting", "vat-return", startDate, endDate, activeBranchId],
    queryFn: () => accountingApi.getVatReturn(startDate, endDate, activeBranchId || undefined),
  });

  const { data: filings = [] } = useQuery({
    queryKey: ["accounting", "vat-return-filings"],
    queryFn: () => accountingApi.vatReturns.list(),
  });

  const createFiling = useMutation({
    mutationFn: () =>
      accountingApi.vatReturns.create({
        period_start: startDate,
        period_end: endDate,
        branch: activeBranchId || undefined,
      }),
    onSuccess: () => {
      toast({ title: "VAT return draft created" });
      queryClient.invalidateQueries({ queryKey: ["accounting", "vat-return-filings"] });
    },
    onError: (e) => toast({ title: "Failed", description: getUserFacingError(e), variant: "destructive" }),
  });

  const reviewFiling = useMutation({
    mutationFn: (id: number) => accountingApi.vatReturns.review(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accounting", "vat-return-filings"] }),
  });

  const fileFiling = useMutation({
    mutationFn: (id: number) => accountingApi.vatReturns.file(id, filingReference),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accounting", "vat-return-filings"] }),
  });

  const payFiling = useMutation({
    mutationFn: (id: number) => accountingApi.vatReturns.recordPayment(id, filingReference),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accounting", "vat-return-filings"] }),
  });

  const submitGra = useMutation({
    mutationFn: (id: number) => accountingApi.vatReturns.submitToGra(id, filingReference),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accounting", "vat-return-filings"] }),
  });

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const worksheet = report?.worksheet;
  const getExportPayload = () => {
    if (!worksheet) return null;
    return {
      reportTitle: "VAT Return Worksheet",
      filename: `vat-return_${startDate}_${endDate}`,
      dateInfo: `${startDate} to ${endDate}`,
      headers: ["Line", "Amount"],
      rows: [
        ["Output VAT", worksheet.output_vat],
        ["Output NHIL", worksheet.output_nhil],
        ["Output GETFund", worksheet.output_getfund],
        ["Output HRL", worksheet.output_hrl],
        ["Total Output Tax", worksheet.total_output_tax],
        ["Input VAT", worksheet.input_vat],
        ["Net VAT Payable", worksheet.net_vat_payable],
      ],
      currencyColumnIndexes: [1],
    };
  };

  const lines = worksheet
    ? [
        { label: "Output VAT", value: worksheet.output_vat },
        { label: "Output NHIL", value: worksheet.output_nhil },
        { label: "Output GETFund", value: worksheet.output_getfund },
        { label: "Output HRL", value: worksheet.output_hrl },
        { label: "Total Output Tax", value: worksheet.total_output_tax, highlight: true },
        { label: "Input VAT", value: worksheet.input_vat },
        { label: "Net VAT Payable", value: worksheet.net_vat_payable, highlight: true },
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="no-print space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4 pt-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">VAT Return</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Output tax collected vs input VAT paid
            </p>
          </div>
          <BranchReportChip />
        </div>

        <Card>
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="start_date" className="text-xs">Start Date</Label>
              <Input id="start_date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 text-sm" />
            </div>
            <div>
              <Label htmlFor="end_date" className="text-xs">End Date</Label>
              <Input id="end_date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 text-sm" />
            </div>
          </CardContent>
        </Card>

        <AccountingReportToolbar getExportPayload={getExportPayload} disabled={!report} isLoading={isLoading} />
      </div>

      <AccountingReportPrintHeader title="VAT Return Worksheet" dateInfo={`${startDate} to ${endDate}`} />

      {isLoading ? (
        <AccountingReportSkeleton />
      ) : report ? (
        <div className="print-container space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="capitalize">{report.status}</Badge>
            <Badge variant="outline">{report.supporting.invoice_count} invoices</Badge>
            <Badge variant="outline">{report.supporting.bill_count} bills</Badge>
          </div>

          <Card>
            <CardHeader className="border-b bg-muted/10">
              <CardTitle className="text-base">Worksheet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              {lines.map((line) => (
                <div
                  key={line.label}
                  className={`flex items-center justify-between rounded-lg border p-3 ${
                    line.highlight ? "border-primary/20 bg-primary/10" : "bg-muted/20"
                  }`}
                >
                  <span className={line.highlight ? "font-semibold" : "font-medium"}>{line.label}</span>
                  <span className={`font-mono font-bold ${line.highlight ? "text-lg" : ""}`}>
                    {formatCurrency(line.value)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filing Workflow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => createFiling.mutate()} disabled={createFiling.isPending}>
              Create Draft Return
            </Button>
            <Input
              placeholder="Filing / payment reference"
              value={filingReference}
              onChange={(e) => setFilingReference(e.target.value)}
              className="max-w-xs"
            />
          </div>
          {filings.length > 0 && (
            <div className="space-y-2">
              {filings.slice(0, 5).map((f) => (
                <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm">
                  <div>
                    <span className="font-medium">{f.period_start} → {f.period_end}</span>
                    <Badge variant="outline" className="ml-2 capitalize">{f.status}</Badge>
                    {f.gra_acknowledgment && (
                      <span className="ml-2 text-xs text-muted-foreground">GRA: {f.gra_acknowledgment}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const blob = await accountingApi.vatReturns.exportGraCsv(f.id);
                        downloadBlob(blob, `gra_vat_${f.period_end}.csv`);
                      }}
                    >
                      GRA CSV
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const blob = await accountingApi.vatReturns.exportGraXml(f.id);
                        downloadBlob(blob, `gra_vat_${f.period_end}.xml`);
                      }}
                    >
                      GRA XML
                    </Button>
                    {f.status === "draft" && (
                      <Button size="sm" variant="outline" onClick={() => reviewFiling.mutate(f.id)}>Review</Button>
                    )}
                    {(f.status === "draft" || f.status === "reviewed") && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => fileFiling.mutate(f.id)}>File</Button>
                        <Button size="sm" onClick={() => submitGra.mutate(f.id)}>Submit to GRA</Button>
                      </>
                    )}
                    {f.status === "filed" && (
                      <Button size="sm" onClick={() => payFiling.mutate(f.id)}>Record Payment</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
