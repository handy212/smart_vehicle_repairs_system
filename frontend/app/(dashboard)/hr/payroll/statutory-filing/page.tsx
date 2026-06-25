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
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";

export default function StatutoryFilingPage() {
  return (
    <PermissionPageGuard permission="view_payroll">
      <DynamicPageTitle title="Statutory Filing Pack" />
      <StatutoryFilingContent />
    </PermissionPageGuard>
  );
}

function StatutoryFilingContent() {
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

  const handleExport = async () => {
    if (!pack) return;
    type StatutorySummaryItem = { code: string; label: string; total: number };
    type StatutoryEmployee = {
      employee_name: string;
      gross_pay: number;
      paye: number;
      statutory_deductions: Record<string, number>;
    };
    type StatutoryExportRow = {
      employee_name: string;
      gross_pay: number;
      paye: number;
      [key: string]: string | number;
    };
    const summary = pack.summary as StatutorySummaryItem[];
    const rows: StatutoryExportRow[] = (pack.employees as StatutoryEmployee[]).map((e) => {
      const row: StatutoryExportRow = {
        employee_name: e.employee_name,
        gross_pay: e.gross_pay,
        paye: e.paye,
      };
      for (const item of summary) {
        row[item.code] = e.statutory_deductions[item.code] || 0;
      }
      return row;
    });
    await exportToCSV(
      rows,
      `statutory-pack-${pack.period.name}`,
      [
        { key: "employee_name", label: "Employee" },
        { key: "gross_pay", label: "Gross" },
        { key: "paye", label: "PAYE" },
        ...summary.map((s) => ({ key: s.code, label: s.label })),
      ]
    );
  };

  return (
    <div className="space-y-6">
      <StaffPageHeader
        title="Statutory Filing Pack"
        breadcrumbs={[
          { label: "HR", href: "/hr" },
          { label: "Payroll", href: "/hr/payroll" },
          { label: "Statutory Filing" },
        ]}
      />

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
