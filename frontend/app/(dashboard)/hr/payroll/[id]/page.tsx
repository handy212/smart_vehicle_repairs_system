"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { hrApi, PayrollPeriod, PaySlip } from "@/lib/api/hr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Banknote, ArrowLeft, CheckCircle2, Play, CreditCard, User, Download,
} from "lucide-react";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { useParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import Link from "next/link";

import { useState } from "react";
import { PayslipDetailDialog } from "./PayslipDetailDialog";

export default function PayrollPeriodDetailPage() {
    return (
        <PermissionGuard permission="view_payroll">
            <PayrollPeriodDetail />
        </PermissionGuard>
    );
}

function PayrollPeriodDetail() {
    const params = useParams();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const router = useRouter();
    const queryClient = useQueryClient();
    const periodId = Number(params.id);
    const [selectedPayslip, setSelectedPayslip] = useState<PaySlip | null>(null);

    const { data: period, isLoading: loadingPeriod } = useQuery({
        queryKey: ["hr", "payroll-period", periodId],
        queryFn: async () => {
            const res = await hrApi.payrollPeriods.get(periodId);
            return res.data;
        },
    });

    const { data: payslipsData, isLoading: loadingPayslips } = useQuery({
        queryKey: ["hr", "payslips", periodId],
        queryFn: async () => {
            const res = await hrApi.payslips.list({ payroll_period: periodId });
            return res.data;
        },
    });

    const processMutation = useMutation({
        mutationFn: () => hrApi.payrollPeriods.process(periodId),
        onSuccess: () => {
            toast.success("Payroll processing started");
            queryClient.invalidateQueries({ queryKey: ["hr", "payroll-period", periodId] });
            queryClient.invalidateQueries({ queryKey: ["hr", "payslips", periodId] });
        },
        onError: () => toast.error("Failed to process payroll"),
    });

    const approveMutation = useMutation({
        mutationFn: () => hrApi.payrollPeriods.approve(periodId),
        onSuccess: () => {
            toast.success("Payroll approved");
            queryClient.invalidateQueries({ queryKey: ["hr", "payroll-period", periodId] });
        },
        onError: () => toast.error("Failed to approve payroll"),
    });

    const markPaidMutation = useMutation({
        mutationFn: () => hrApi.payrollPeriods.markPaid(periodId),
        onSuccess: () => {
            toast.success("Payroll marked as paid");
            queryClient.invalidateQueries({ queryKey: ["hr", "payroll-period", periodId] });
        },
        onError: () => toast.error("Failed to mark as paid"),
    });

    const getStatusConfig = (status: string) => {
        switch (status) {
            case "draft": return { color: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400", label: "Draft" };
            case "processing": return { color: "bg-info/10 text-blue-700 border-info/20 dark:bg-blue-900/20 dark:text-blue-400", label: "Processing" };
            case "approved": return { color: "bg-warning/10 text-amber-700 border-warning/20 dark:bg-amber-900/20 dark:text-amber-400", label: "Approved" };
            case "paid": return { color: "bg-success/10 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400", label: "Paid" };
            default: return { color: "", label: status };
        }
    };

    const getPayslipStatusColor = (status: string) => {
        switch (status) {
            case "draft": return "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400";
            case "approved": return "bg-warning/10 text-amber-700 border-warning/20 dark:bg-amber-900/20 dark:text-amber-400";
            case "paid": return "bg-success/10 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400";
            default: return "";
        }
    };

    const payslips = payslipsData?.results ?? [];
    const totalGross = payslips.reduce((s, p) => s + parseFloat(p.gross_pay || "0"), 0);
    const totalDeductions = payslips.reduce((s, p) => {
        const deds = (Object.values(p.deductions || {}) as string[]).reduce((a: number, v: string) => a + parseFloat(v || "0"), 0);
        return s + deds + parseFloat(p.tax_amount || "0");
    }, 0);
    const totalNet = payslips.reduce((s, p) => s + parseFloat(p.net_pay || "0"), 0);

    if (loadingPeriod) {
        return (
            <div className="space-y-4">
                <div className="h-12 rounded-lg bg-muted animate-pulse" />
                <div className="h-32 rounded-lg bg-muted animate-pulse" />
                <div className="h-64 rounded-lg bg-muted animate-pulse" />
            </div>
        );
    }

    if (!period) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <p>Payroll period not found</p>
                <Button variant="outline" className="mt-4" asChild>
                    <Link href="/hr/payroll">Back to Payroll</Link>
                </Button>
            </div>
        );
    }

    const cfg = getStatusConfig(period.status);

    return (
        <div className="space-y-4">
            <DynamicPageTitle title={`Payroll — ${period.name}`} />
            <StaffPageHeader
                title={period.name}
                breadcrumbs={[
                    { label: "Dashboard", href: "/dashboard" },
                    { label: "HR", href: "/hr" },
                    { label: "Payroll", href: "/hr/payroll" },
                    { label: period.name },
                ]}
                actions={
                    <PermissionGuard permission="process_payroll">
                        <div className="flex gap-2">
                            {period.status === "draft" && (
                                <Button size="sm" onClick={() => processMutation.mutate()} disabled={processMutation.isPending}>
                                    <Play className="h-4 w-4 mr-2" />
                                    Process Payroll
                                </Button>
                            )}
                            {period.status === "processing" && (
                                <Button size="sm" onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
                                    <CheckCircle2 className="h-4 w-4 mr-2" />
                                    Approve
                                </Button>
                            )}
                            {period.status === "approved" && (
                                <Button size="sm" onClick={() => markPaidMutation.mutate()} disabled={markPaidMutation.isPending}>
                                    <CreditCard className="h-4 w-4 mr-2" />
                                    Mark as Paid
                                </Button>
                            )}
                        </div>
                    </PermissionGuard>
                }
            />

            {/* Period Summary */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <Card className="shadow-sm border">
                    <CardContent className="p-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Status</p>
                        <Badge variant="outline" className={cn("mt-1 text-[10px] px-2 py-0.5 border shadow-none", cfg.color)}>
                            {cfg.label}
                        </Badge>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border">
                    <CardContent className="p-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Period</p>
                        <p className="text-sm font-medium mt-1">{period.start_date} → {period.end_date}</p>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border">
                    <CardContent className="p-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Total Gross</p>
                        <p className="text-lg font-bold mt-1 text-foreground">{totalGross.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border">
                    <CardContent className="p-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Total Deductions</p>
                        <p className="text-lg font-bold mt-1 text-destructive">{totalDeductions.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border">
                    <CardContent className="p-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Total Net Pay</p>
                        <p className="text-lg font-bold mt-1 text-success">{totalNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Notes */}
            {period.notes && (
                <Card className="shadow-sm border">
                    <CardContent className="p-4">
                        <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Notes</p>
                        <p className="text-sm text-foreground">{period.notes}</p>
                    </CardContent>
                </Card>
            )}

            {/* Payslips */}
            <Card className="border-t shadow-sm">
                <CardHeader className="py-3 px-4 border-b bg-muted/30">
                    <CardTitle className="text-sm font-semibold">Payslips ({payslips.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {loadingPayslips ? (
                        <div className="space-y-2 p-4">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
                            ))}
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50 hover:bg-muted/50">
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Staff</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Basic</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Overtime</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Gross</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Tax</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Net Pay</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {payslips.length > 0 ? payslips.map((slip) => (
                                    <TableRow key={slip.id} className="hover:bg-muted/50 transition-colors border-b">
                                        <TableCell className="px-4 py-2">
                                            <div className="flex items-center gap-2">
                                                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center">
                                                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                                                </div>
                                                <span className="text-sm font-medium">{slip.staff_name}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-sm text-right font-mono">{parseFloat(slip.basic_salary || "0").toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="px-4 py-2 text-sm text-right font-mono">{parseFloat(slip.overtime_pay || "0").toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="px-4 py-2 text-sm text-right font-mono font-medium">{parseFloat(slip.gross_pay || "0").toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="px-4 py-2 text-sm text-right font-mono text-destructive">{parseFloat(slip.tax_amount || "0").toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="px-4 py-2 text-sm text-right font-mono font-bold text-success">{parseFloat(slip.net_pay || "0").toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="px-4 py-2">
                                            <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 capitalize border shadow-none", getPayslipStatusColor(slip.status))}>
                                                {slip.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-right">
                                            <Button variant="ghost" size="sm" onClick={() => setSelectedPayslip(slip)}>View</Button>
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-32 text-center">
                                            <div className="flex flex-col items-center justify-center text-muted-foreground">
                                                <Banknote className="h-8 w-8 mb-2 opacity-50" />
                                                <p className="text-sm">No payslips generated yet</p>
                                                {period.status === "draft" && (
                                                    <p className="text-xs mt-1">Process this payroll period to generate payslips</p>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <PayslipDetailDialog
                payslip={selectedPayslip}
                open={!!selectedPayslip}
                onOpenChange={(open) => !open && setSelectedPayslip(null)}
            />
        </div>
    );
}
