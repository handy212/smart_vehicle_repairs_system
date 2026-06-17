"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { hrApi } from "@/lib/api/hr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { exportToCSV } from "@/lib/utils/export";
import { Button } from "@/components/ui/button";

export default function StatutoryFilingPage() {
  const { formatCurrency } = useCurrency();
  const [periodId, setPeriodId] = useState<string>("");

  const { data: periodsData } = useQuery({
    queryKey: ["payroll-periods"],
    queryFn: () => hrApi.payrollPeriods.list({ ordering: "-start_date" }),
  });

  const periods = periodsData?.data?.results || [];

  const { data: packResponse, isLoading } = useQuery({
    queryKey: ["statutory-pack", periodId],
    queryFn: () => hrApi.payrollPeriods.statutoryPack(Number(periodId)),
    enabled: !!periodId,
  });

  const pack = packResponse?.data;

  const handleExport = () => {
    if (!pack) return;
    const rows = pack.employees.map((e: {
      employee_name: string;
      gross_pay: number;
      paye: number;
      statutory_deductions: Record<string, number>;
    }) => [
      e.employee_name,
      e.gross_pay,
      e.paye,
      ...pack.summary.map((s: { code: string }) => e.statutory_deductions[s.code] || 0),
    ]);
    exportToCSV(
      rows,
      `statutory-pack-${pack.period.name}`,
      ["Employee", "Gross", "PAYE", ...pack.summary.map((s: { label: string }) => s.label)]
    );
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Statutory Filing Pack</h1>
        <p className="text-sm text-muted-foreground mt-1">
          PAYE, SSNIT, and mapped deduction totals for authority filing.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Select value={periodId} onValueChange={setPeriodId}>
          <SelectTrigger className="w-[280px]">
            <SelectValue placeholder="Select payroll period" />
          </SelectTrigger>
          <SelectContent>
            {periods.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name} ({p.start_date} – {p.end_date})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {pack && (
          <Button variant="outline" onClick={handleExport}>
            Export CSV
          </Button>
        )}
      </div>

      {isLoading && <p className="text-muted-foreground">Loading statutory pack...</p>}

      {pack && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {pack.summary.map((item: { code: string; label: string; total: number }) => (
              <Card key={`ee-${item.code}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{item.label} (Employee)</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold">{formatCurrency(item.total)}</p>
                </CardContent>
              </Card>
            ))}
            {(pack.employer_summary || []).map((item: { code: string; label: string; total: number }) => (
              <Card key={`er-${item.code}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{item.label} (Employer)</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold">{formatCurrency(item.total)}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Employee Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">PAYE</TableHead>
                    {pack.summary
                      .filter((s: { code: string }) => s.code !== "PAYE")
                      .map((s: { code: string; label: string }) => (
                        <TableHead key={s.code} className="text-right">{s.label}</TableHead>
                      ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pack.employees.map((e: {
                    employee_id: number;
                    employee_name: string;
                    gross_pay: number;
                    paye: number;
                    statutory_deductions: Record<string, number>;
                  }) => (
                    <TableRow key={e.employee_id}>
                      <TableCell>{e.employee_name}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(e.gross_pay)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(e.paye)}</TableCell>
                      {pack.summary
                        .filter((s: { code: string }) => s.code !== "PAYE")
                        .map((s: { code: string }) => (
                          <TableCell key={s.code} className="text-right font-mono">
                            {formatCurrency(e.statutory_deductions[s.code] || 0)}
                          </TableCell>
                        ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">{pack.filing_notes}</p>
        </>
      )}
    </div>
  );
}
