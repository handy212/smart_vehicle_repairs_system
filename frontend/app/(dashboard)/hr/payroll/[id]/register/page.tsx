"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { hrApi } from "@/lib/api/hr";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { exportToCSV } from "@/lib/utils/export";

interface RegisterRow {
    employee_id: number;
    employee_name: string;
    department: string | null;
    basic_salary: number;
    overtime_pay: number;
    gross_pay: number;
    tax_amount: number;
    deductions: number;
    net_pay: number;
    status: string;
}

interface PayrollRegister {
    period: { id: number; name: string; start_date: string; end_date: string; status: string };
    rows: RegisterRow[];
    totals: Record<string, number>;
}

export default function PayrollRegisterPage() {
    return (
        <PermissionPageGuard permission="view_payroll">
            <PayrollRegisterContent />
        </PermissionPageGuard>
    );
}

function PayrollRegisterContent() {
    const params = useParams();
    const periodId = Number(params.id);
    const { formatCurrency } = useCurrency();

    const { data: period } = useQuery({
        queryKey: ["hr", "payroll-period", periodId],
        queryFn: async () => (await hrApi.payrollPeriods.get(periodId)).data,
        enabled: !!periodId,
    });

    const { data: registerResponse, isLoading } = useQuery({
        queryKey: ["hr", "payroll-register", periodId],
        queryFn: async () => (await hrApi.payrollPeriods.payrollRegister(periodId)).data as PayrollRegister,
        enabled: !!periodId,
    });

    const register = registerResponse;
    const rows = register?.rows ?? [];
    const totals = register?.totals;

    const handleExport = () => {
        if (!register) return;
        exportToCSV({
            filename: `payroll-register-${register.period.name}`,
            headers: ["Employee", "Department", "Basic", "Overtime", "Gross", "Tax", "Deductions", "Net", "Status"],
            rows: rows.map((r) => [
                r.employee_name,
                r.department ?? "",
                r.basic_salary,
                r.overtime_pay,
                r.gross_pay,
                r.tax_amount,
                r.deductions,
                r.net_pay,
                r.status,
            ]),
        });
    };

    return (
        <div className="space-y-4">
            <DynamicPageTitle title={period ? `Payroll Register — ${period.name}` : "Payroll Register"} />
            <StaffPageHeader
                title="Payroll Register"
                breadcrumbs={[
                    { label: "HR", href: "/hr" },
                    { label: "Payroll", href: "/hr/payroll" },
                    { label: period?.name ?? "Period", href: `/hr/payroll/${periodId}` },
                    { label: "Register" },
                ]}
                actions={
                    <div className="flex gap-2">
                        <Button variant="outline" asChild>
                            <Link href={`/hr/payroll/${periodId}`}><ArrowLeft className="h-4 w-4 mr-2" />Back to Period</Link>
                        </Button>
                        {rows.length > 0 && (
                            <Button variant="outline" onClick={handleExport}>Export CSV</Button>
                        )}
                    </div>
                }
            />

            {totals && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground uppercase">Headcount</p><p className="text-xl font-bold">{totals.headcount}</p></CardContent></Card>
                    <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground uppercase">Gross Pay</p><p className="text-xl font-bold">{formatCurrency(totals.gross_pay)}</p></CardContent></Card>
                    <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground uppercase">Tax</p><p className="text-xl font-bold">{formatCurrency(totals.tax_amount)}</p></CardContent></Card>
                    <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground uppercase">Net Pay</p><p className="text-xl font-bold">{formatCurrency(totals.net_pay)}</p></CardContent></Card>
                </div>
            )}

            <Card>
                <CardHeader><CardTitle className="text-base">Employee Register</CardTitle></CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="h-32 bg-muted animate-pulse m-4 rounded" />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Employee</TableHead>
                                    <TableHead>Department</TableHead>
                                    <TableHead className="text-right">Gross</TableHead>
                                    <TableHead className="text-right">Tax</TableHead>
                                    <TableHead className="text-right">Net</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.length > 0 ? rows.map((row) => (
                                    <TableRow key={row.employee_id}>
                                        <TableCell className="font-medium">{row.employee_name}</TableCell>
                                        <TableCell>{row.department ?? "—"}</TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(row.gross_pay)}</TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(row.tax_amount)}</TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(row.net_pay)}</TableCell>
                                        <TableCell className="capitalize">{row.status}</TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                            No payslips in this period yet. Process payroll to generate the register.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
