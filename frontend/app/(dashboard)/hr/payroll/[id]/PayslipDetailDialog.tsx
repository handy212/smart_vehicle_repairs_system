"use client";

import { useMutation } from "@tanstack/react-query";
import { hrApi, PaySlip } from "@/lib/api/hr";
import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Loader2, Download, Building2, User, CalendarDays, Lock } from "lucide-react";
import { toast } from "sonner";

import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { useState } from "react";
import { EditPayslipDialog } from "./EditPayslipDialog";

interface PayslipDetailDialogProps {
    payslip: PaySlip | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function PayslipDetailDialog({ payslip, open, onOpenChange }: PayslipDetailDialogProps) {
    const [showEdit, setShowEdit] = useState(false);
    const downloadMutation = useMutation({
        mutationFn: async () => {
            if (!payslip) return;
            const res = await hrApi.payslips.downloadPdf(payslip.id);
            // Create blob link to download
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            const safeName = payslip.staff_name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            link.setAttribute('download', `payslip_${safeName}_${payslip.payroll_period}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        },
        onSuccess: () => {
            toast.success("Payslip downloaded");
        },
        onError: () => toast.error("Failed to download payslip"),
    });

    if (!payslip) return null;

    const formatCurrency = (amount: string | number) => {
        const val = typeof amount === 'string' ? parseFloat(amount) : amount;
        return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };
    const entriesFromJson = (data: unknown): [string, string][] => {
        if (!data) return [];
        if (Array.isArray(data)) {
            return data.map((item, index) => [
                String(item?.name || `Item ${index + 1}`),
                String(item?.amount || "0"),
            ]);
        }
        if (typeof data === "object") {
            return Object.entries(data as Record<string, unknown>).map(([key, value]) => [key, String(value || "0")]);
        }
        return [];
    };
    const allowanceEntries = entriesFromJson(payslip.allowances);
    const deductionEntries = entriesFromJson(payslip.deductions);
    const unpaidLeave = parseFloat(payslip.unpaid_leave_deduction || "0");
    const absenceDeduction = parseFloat(payslip.absence_deduction || "0");

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        Payslip Details
                        {payslip.is_locked && <Lock className="h-4 w-4 text-muted-foreground" />}
                    </DialogTitle>
                    <DialogDescription>
                        Reference: {payslip.payslip_number || `#${payslip.id}`}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-hidden">
                    <ScrollArea className="h-full pr-4">
                        {/* Header Info */}
                        <div className="bg-muted/30 p-3 rounded-md border mb-4 grid grid-cols-2 gap-3">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-primary">
                                    <User className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-muted-foreground uppercase">Employee</p>
                                    <p className="font-medium">{payslip.staff_name}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center text-primary">
                                    <CalendarDays className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-muted-foreground uppercase">Period</p>
                                    <p className="font-medium">{payslip.period_name}</p>
                                </div>
                            </div>
                            <div className="col-span-2 grid grid-cols-3 gap-2 border-t pt-3 text-xs">
                                <div>
                                    <p className="text-muted-foreground">Status</p>
                                    <p className="font-medium capitalize">{payslip.status}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Proration</p>
                                    <p className="font-medium">{payslip.proration_factor || "1.0000"}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Payment Ref.</p>
                                    <p className="font-medium truncate">{payslip.payment_reference || "N/A"}</p>
                                </div>
                            </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                            {/* Earnings Section */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between border-b pb-2">
                                    <h3 className="font-semibold text-sm uppercase text-success">Earnings</h3>
                                </div>
                                <div className="space-y-3">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Basic Salary</span>
                                        <span className="font-mono font-medium">{formatCurrency(payslip.basic_salary)}</span>
                                    </div>
                                    {parseFloat(payslip.overtime_pay) > 0 && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">Overtime Pay</span>
                                            <span className="font-mono font-medium">{formatCurrency(payslip.overtime_pay)}</span>
                                        </div>
                                    )}
                                    {allowanceEntries.map(([name, amount]) => (
                                        <div key={name} className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">{name}</span>
                                            <span className="font-mono font-medium">{formatCurrency(amount)}</span>
                                        </div>
                                    ))}
                                    <div className="border-t pt-3 mt-2 flex justify-between font-bold">
                                        <span>Total Gross Pay</span>
                                        <span className="font-mono text-green-700">{formatCurrency(payslip.gross_pay)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Deductions Section */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between border-b pb-2">
                                    <h3 className="font-semibold text-sm uppercase text-destructive">Deductions</h3>
                                </div>
                                <div className="space-y-3">
                                    {parseFloat(payslip.tax_amount) > 0 && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">Tax (PAYE)</span>
                                            <span className="font-mono font-medium text-destructive">{formatCurrency(payslip.tax_amount)}</span>
                                        </div>
                                    )}
                                    {unpaidLeave > 0 && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">Unpaid Leave</span>
                                            <span className="font-mono font-medium text-destructive">{formatCurrency(unpaidLeave)}</span>
                                        </div>
                                    )}
                                    {absenceDeduction > 0 && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">Absence</span>
                                            <span className="font-mono font-medium text-destructive">{formatCurrency(absenceDeduction)}</span>
                                        </div>
                                    )}
                                    {deductionEntries.map(([name, amount]) => (
                                        <div key={name} className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">{name}</span>
                                            <span className="font-mono font-medium text-destructive">{formatCurrency(amount)}</span>
                                        </div>
                                    ))}
                                    <div className="border-t pt-3 mt-2 flex justify-between font-bold text-gray-500">
                                        <span>Total Deductions</span>
                                        <span className="font-mono text-destructive">
                                            {formatCurrency(
                                                parseFloat(payslip.gross_pay) - parseFloat(payslip.net_pay)
                                            )}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Net Pay Highlight */}
                        <div className="mt-6 bg-gray-900 text-white p-4 rounded-md flex justify-between items-center shadow-sm">
                            <div>
                                <p className="text-xs uppercase tracking-wider opacity-70 font-semibold mb-1">Net Pay</p>
                                <p className="text-xs opacity-50">{payslip.is_locked ? "Locked payroll record" : "Editable draft payroll record"}</p>
                            </div>
                            <div className="text-2xl font-bold font-mono">
                                {formatCurrency(payslip.net_pay)}
                            </div>
                        </div>
                    </ScrollArea>
                </div>

                <DialogFooter className="mt-4 pt-4 border-t flex justify-between sm:justify-end gap-2">
                    {!payslip.is_locked && (
                        <PermissionGuard permission="manage_payroll">
                            <Button variant="outline" onClick={() => setShowEdit(true)}>
                                Edit Payslip
                            </Button>
                        </PermissionGuard>
                    )}
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                        <Button
                            onClick={() => downloadMutation.mutate()}
                            disabled={downloadMutation.isPending}
                            className="gap-2"
                        >
                            {downloadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            Download PDF
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>

            <EditPayslipDialog
                key={payslip.id}
                payslip={payslip}
                open={showEdit}
                onOpenChange={setShowEdit}
                onSaved={() => onOpenChange(false)}
            />
        </Dialog>
    );
}
