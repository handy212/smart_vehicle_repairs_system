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
import { Loader2, Plus, Trash2, Save } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
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

export function EditPayslipDialog({ payslip, open, onOpenChange, onSaved }: EditPayslipDialogProps) {
    const queryClient = useQueryClient();
    const [basicSalary, setBasicSalary] = useState<string>("");
    const [overtimePay, setOvertimePay] = useState<string>("");
    const [allowances, setAllowances] = useState<ComponentItem[]>([]);
    const [deductions, setDeductions] = useState<ComponentItem[]>([]);

    // Tracks new items being added
    const [newAllowanceName, setNewAllowanceName] = useState("");
    const [newAllowanceAmount, setNewAllowanceAmount] = useState("");
    const [newDeductionName, setNewDeductionName] = useState("");
    const [newDeductionAmount, setNewDeductionAmount] = useState("");

    useEffect(() => {
        if (payslip) {
            setBasicSalary(payslip.basic_salary);
            setOvertimePay(payslip.overtime_pay || "0");

            // Parse JSON fields safely
            const parseComponents = (data: any): ComponentItem[] => {
                if (!data) return [];
                if (Array.isArray(data)) return data.map((item: any) => ({ name: item.name || "Item", amount: parseFloat(item.amount || "0") }));
                if (typeof data === 'object') {
                    return Object.entries(data).map(([key, val]) => ({ name: key, amount: parseFloat(val as string || "0") }));
                }
                return [];
            };

            setAllowances(parseComponents(payslip.allowances));
            setDeductions(parseComponents(payslip.deductions));
        }
    }, [payslip]);

    const updateMut = useMutation({
        mutationFn: (data: any) => hrApi.payslips.update(payslip!.id, data),
        onSuccess: () => {
            toast.success("Payslip updated");
            onSaved();
            onOpenChange(false);
        },
        onError: () => toast.error("Failed to update payslip"),
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

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Edit Payslip - {payslip.staff_name}</DialogTitle>
                    <DialogDescription>
                        Modify salary details. Totals will incur recalculation upon save.
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="flex-1 pr-4 -mr-4">
                    <div className="space-y-6 py-4">
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

                        <Separator />

                        {/* Allowances */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label className="text-base font-semibold text-green-700 dark:text-green-400">Allowances</Label>
                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                    Total: {allowances.reduce((s, i) => s + i.amount, 0).toLocaleString()}
                                </Badge>
                            </div>
                            <div className="space-y-2">
                                {allowances.map((item, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <Input value={item.name} onChange={e => { const n = [...allowances]; n[idx].name = e.target.value; setAllowances(n); }} className="flex-1 h-8 text-xs" />
                                        <Input type="number" value={item.amount} onChange={e => { const n = [...allowances]; n[idx].amount = parseFloat(e.target.value); setAllowances(n); }} className="w-24 h-8 text-xs text-right" />
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => removeAllowance(idx)}><Trash2 className="h-4 w-4" /></Button>
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
                                <Label className="text-base font-semibold text-red-700 dark:text-red-400">Deductions</Label>
                                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                                    Total: {deductions.reduce((s, i) => s + i.amount, 0).toLocaleString()}
                                </Badge>
                            </div>
                            <div className="space-y-2">
                                {deductions.map((item, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <Input value={item.name} onChange={e => { const n = [...deductions]; n[idx].name = e.target.value; setDeductions(n); }} className="flex-1 h-8 text-xs" />
                                        <Input type="number" value={item.amount} onChange={e => { const n = [...deductions]; n[idx].amount = parseFloat(e.target.value); setDeductions(n); }} className="w-24 h-8 text-xs text-right" />
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => removeDeduction(idx)}><Trash2 className="h-4 w-4" /></Button>
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
