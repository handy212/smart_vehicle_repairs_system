"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { hrApi, PaySlip } from "@/lib/api/hr";
import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "@/lib/toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

interface EditPayslipDialogProps {
    payslip: PaySlip | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}

interface ComponentItem {
    name: string;
    amount: number;
}

type PayslipUpdatePayload = Pick<
    PaySlip,
    "basic_salary" | "overtime_pay" | "unpaid_leave_deduction" | "absence_deduction"
> & {
    allowances: ComponentItem[];
    deductions: ComponentItem[];
};

type ApiError = {
    response?: {
        data?: {
            detail?: string;
            error?: string;
        };
    };
};

const parseComponents = (data: unknown): ComponentItem[] => {
    if (!data) return [];
    if (Array.isArray(data)) {
        return data.map((item, index) => {
            const record = item as { name?: unknown; amount?: unknown };
            return {
                name: String(record.name || `Item ${index + 1}`),
                amount: parseFloat(String(record.amount || "0")),
            };
        });
    }
    if (typeof data === "object") {
        return Object.entries(data as Record<string, unknown>).map(([key, val]) => ({
            name: key,
            amount: parseFloat(String(val || "0")),
        }));
    }
    return [];
};

export function EditPayslipDialog({ payslip, open, onOpenChange, onSaved }: EditPayslipDialogProps) {
    const queryClient = useQueryClient();
    const [basicSalary, setBasicSalary] = useState<string>(payslip?.basic_salary || "");
    const [overtimePay, setOvertimePay] = useState<string>(payslip?.overtime_pay || "0");
    const [unpaidLeaveDeduction, setUnpaidLeaveDeduction] = useState<string>(payslip?.unpaid_leave_deduction || "0");
    const [absenceDeduction, setAbsenceDeduction] = useState<string>(payslip?.absence_deduction || "0");
    const [allowances, setAllowances] = useState<ComponentItem[]>(parseComponents(payslip?.allowances));
    const [deductions, setDeductions] = useState<ComponentItem[]>(parseComponents(payslip?.deductions));

    // Tracks new items being added
    const [newAllowanceName, setNewAllowanceName] = useState("");
    const [newAllowanceAmount, setNewAllowanceAmount] = useState("");
    const [newDeductionName, setNewDeductionName] = useState("");
    const [newDeductionAmount, setNewDeductionAmount] = useState("");

    const updateMut = useMutation({

        mutationFn: (data: PayslipUpdatePayload) => hrApi.payslips.update(payslip!.id, data),
        onSuccess: () => {
            toast.success("Payslip updated");
            queryClient.invalidateQueries({ queryKey: ["hr", "payslips", payslip?.payroll_period] });
            queryClient.invalidateQueries({ queryKey: ["hr", "payroll-period", payslip?.payroll_period] });
            onSaved();
            onOpenChange(false);
        },
        onError: (error: unknown) => {
            const data = (error as ApiError)?.response?.data;
            toast.error(data?.detail || data?.error || "Failed to update payslip");
        },
    });

    const handleSave = () => {
        // Convert components back to format expected by backend (list of dicts or dict? Backend likely expects JSON)
        // The serializer uses JSONField. The logic in payroll service might expect specific format.
        // Assuming list of {name, amount} or dict {name: amount}.
        // Let's us dict {name: amount} which is cleaner for JSONField if model supports it, 
        // but if the backend code iterates over it, we should check `PayrollService` or keep existing structure.
        // The `parseComponents` handles both. Let's persist as list of objects which is more standard for ordered items.

        const formatForSave = (items: ComponentItem[]) => {
            return items.map(item => ({ name: item.name, amount: item.amount }));
        };

        updateMut.mutate({
            basic_salary: basicSalary,
            overtime_pay: overtimePay,
            unpaid_leave_deduction: unpaidLeaveDeduction,
            absence_deduction: absenceDeduction,
            allowances: formatForSave(allowances),
            deductions: formatForSave(deductions),
        });
    };

    const addAllowance = () => {
        if (newAllowanceName && newAllowanceAmount) {
            setAllowances([...allowances, { name: newAllowanceName, amount: parseFloat(newAllowanceAmount) }]);
            setNewAllowanceName("");
            setNewAllowanceAmount("");
        }
    };

    const addDeduction = () => {
        if (newDeductionName && newDeductionAmount) {
            setDeductions([...deductions, { name: newDeductionName, amount: parseFloat(newDeductionAmount) }]);
            setNewDeductionName("");
            setNewDeductionAmount("");
        }
    };

    const removeAllowance = (index: number) => {
        setAllowances(allowances.filter((_, i) => i !== index));
    };

    const removeDeduction = (index: number) => {
        setDeductions(deductions.filter((_, i) => i !== index));
    };

    if (!payslip) return null;
    if (payslip.is_locked) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Locked Payslip</DialogTitle>
                        <DialogDescription>
                            This payslip belongs to an approved, paid, or reversed payroll period and cannot be edited.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Edit Payslip - {payslip.staff_name}</DialogTitle>
                    <DialogDescription>Modify draft payroll details before approval locks the payslip.</DialogDescription>
                </DialogHeader>

                <ScrollArea className="flex-1 pr-4 -mr-4">
                    <div className="space-y-5 py-4">
                        {/* Basic Pay */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Basic Salary</Label>
                                <Input type="number" step="0.01" value={basicSalary} onChange={e => setBasicSalary(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>Overtime Pay</Label>
                                <Input type="number" step="0.01" value={overtimePay} onChange={e => setOvertimePay(e.target.value)} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Unpaid Leave Deduction</Label>
                                <Input type="number" step="0.01" value={unpaidLeaveDeduction} onChange={e => setUnpaidLeaveDeduction(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>Absence Deduction</Label>
                                <Input type="number" step="0.01" value={absenceDeduction} onChange={e => setAbsenceDeduction(e.target.value)} />
                            </div>
                        </div>

                        <Separator />

                        {/* Allowances */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label className="text-base font-semibold text-success dark:text-success">Allowances</Label>
                                <Badge variant="outline" className="bg-success/15 text-success border-success/20">
                                    Total: {allowances.reduce((s, i) => s + i.amount, 0).toLocaleString()}
                                </Badge>
                            </div>
                            <div className="space-y-2">
                                {allowances.map((item, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <Input value={item.name} onChange={e => { const n = [...allowances]; n[idx].name = e.target.value; setAllowances(n); }} className="flex-1 h-8 text-xs" />
                                        <Input type="number" value={item.amount} onChange={e => { const n = [...allowances]; n[idx].amount = parseFloat(e.target.value); setAllowances(n); }} className="w-24 h-8 text-xs text-right" />
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeAllowance(idx)}><Trash2 className="h-4 w-4" /></Button>
                                    </div>
                                ))}
                                <div className="flex items-center gap-2 pt-2 border-t border-dashed">
                                    <Input placeholder="New Allowance Name" value={newAllowanceName} onChange={e => setNewAllowanceName(e.target.value)} className="flex-1 h-8 text-xs" />
                                    <Input type="number" placeholder="Amount" value={newAllowanceAmount} onChange={e => setNewAllowanceAmount(e.target.value)} className="w-24 h-8 text-xs text-right" />
                                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={addAllowance} disabled={!newAllowanceName || !newAllowanceAmount}><Plus className="h-4 w-4" /></Button>
                                </div>
                            </div>
                        </div>

                        <Separator />

                        {/* Deductions */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label className="text-base font-semibold text-destructive dark:text-destructive">Deductions</Label>
                                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                                    Total: {deductions.reduce((s, i) => s + i.amount, 0).toLocaleString()}
                                </Badge>
                            </div>
                            <div className="space-y-2">
                                {deductions.map((item, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <Input value={item.name} onChange={e => { const n = [...deductions]; n[idx].name = e.target.value; setDeductions(n); }} className="flex-1 h-8 text-xs" />
                                        <Input type="number" value={item.amount} onChange={e => { const n = [...deductions]; n[idx].amount = parseFloat(e.target.value); setDeductions(n); }} className="w-24 h-8 text-xs text-right" />
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeDeduction(idx)}><Trash2 className="h-4 w-4" /></Button>
                                    </div>
                                ))}
                                <div className="flex items-center gap-2 pt-2 border-t border-dashed">
                                    <Input placeholder="New Deduction Name" value={newDeductionName} onChange={e => setNewDeductionName(e.target.value)} className="flex-1 h-8 text-xs" />
                                    <Input type="number" placeholder="Amount" value={newDeductionAmount} onChange={e => setNewDeductionAmount(e.target.value)} className="w-24 h-8 text-xs text-right" />
                                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={addDeduction} disabled={!newDeductionName || !newDeductionAmount}><Plus className="h-4 w-4" /></Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={updateMut.isPending}>
                        {updateMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Save Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
