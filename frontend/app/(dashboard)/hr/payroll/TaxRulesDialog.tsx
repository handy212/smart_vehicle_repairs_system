"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrApi, TaxRule } from "@/lib/api/hr";
import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Pencil, Trash2, AlertCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";

interface TaxRulesDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function TaxRulesDialog({ open, onOpenChange }: TaxRulesDialogProps) {
    const queryClient = useQueryClient();
    const [editingId, setEditingId] = useState<number | null>(null);
    const [formData, setFormData] = useState<Partial<TaxRule>>({});
    const [isFormOpen, setIsFormOpen] = useState(false);

    const { data, isLoading } = useQuery({
        queryKey: ["hr", "tax-rules"],
        queryFn: async () => (await hrApi.taxRules.list()).data,
        enabled: open,
    });

    const rules = data?.results ?? [];

    const deleteMut = useMutation({
        mutationFn: (id: number) => hrApi.taxRules.delete(id),
        onSuccess: () => {
            toast.success("Tax rule deleted");
            queryClient.invalidateQueries({ queryKey: ["hr", "tax-rules"] });
        },
        onError: () => toast.error("Failed to delete tax rule"),
    });

    const saveMut = useMutation({
        mutationFn: (data: Partial<TaxRule>) =>
            editingId ? hrApi.taxRules.update(editingId, data) : hrApi.taxRules.create(data),
        onSuccess: () => {
            toast.success(editingId ? "Tax rule updated" : "Tax rule created");
            queryClient.invalidateQueries({ queryKey: ["hr", "tax-rules"] });
            setIsFormOpen(false);
            setEditingId(null);
            setFormData({});
        },
        onError: () => toast.error("Failed to save tax rule"),
    });

    const handleEdit = (rule: TaxRule) => {
        setEditingId(rule.id);
        setFormData(rule);
        setIsFormOpen(true);
    };

    const handleAddNew = () => {
        setEditingId(null);
        setFormData({
            name: "",
            min_income: "0",
            max_income: null,
            rate: "0",
            excess_amount: "0",
        });
        setIsFormOpen(true);
    };

    const formatCurrency = (amount: string | number | null) => {
        if (amount === null || amount === undefined) return "∞";
        const val = typeof amount === 'string' ? parseFloat(amount) : amount;
        return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Tax Rules Configuration</DialogTitle>
                    <DialogDescription>
                        Define progressive tax brackets. Logic: (Taxable Income - Min Income) * Rate + Excess Amount.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-auto py-4 space-y-4">
                    {isFormOpen ? (
                        <Card>
                            <CardContent className="pt-6 space-y-4">
                                <h3 className="text-sm font-semibold mb-2">{editingId ? "Edit Rule" : "New Rule"}</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Rule Name</Label>
                                        <Input
                                            placeholder="e.g. Band 1"
                                            value={formData.name || ""}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Rate (%)</Label>
                                        <Input
                                            type="number" step="0.01"
                                            value={formData.rate || ""}
                                            onChange={e => setFormData({ ...formData, rate: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <Label>Min Income</Label>
                                        <Input
                                            type="number" step="0.01"
                                            value={formData.min_income || ""}
                                            onChange={e => setFormData({ ...formData, min_income: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Max Income</Label>
                                        <Input
                                            type="number" step="0.01" placeholder="Leave empty for infinity"
                                            value={formData.max_income || ""}
                                            onChange={e => setFormData({ ...formData, max_income: e.target.value || null })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Excess Amount</Label>
                                        <Input
                                            type="number" step="0.01"
                                            value={formData.excess_amount || ""}
                                            onChange={e => setFormData({ ...formData, excess_amount: e.target.value })}
                                        />
                                        <p className="text-[10px] text-muted-foreground">Base tax from previous bands</p>
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                    <Button variant="outline" size="sm" onClick={() => setIsFormOpen(false)}>Cancel</Button>
                                    <Button size="sm" onClick={() => saveMut.mutate(formData)} disabled={!formData.name || saveMut.isPending}>
                                        {saveMut.isPending && <Loader2 className="h-3 w-3 animate-spin mr-2" />}
                                        Save Rule
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="flex justify-between items-center bg-muted/30 p-2 rounded-md">
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                                <AlertCircle className="h-3 w-3" />
                                Rules are applied in order of Min Income.
                            </div>
                            <Button size="sm" onClick={handleAddNew}><Plus className="h-3.5 w-3.5 mr-1" /> Add Rule</Button>
                        </div>
                    )}

                    <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead className="text-right">Range</TableHead>
                                    <TableHead className="text-right">Rate (%)</TableHead>
                                    <TableHead className="text-right">Excess</TableHead>
                                    <TableHead className="text-right w-[100px]">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow><TableCell colSpan={5} className="text-center h-24">Loading...</TableCell></TableRow>
                                ) : rules.length === 0 ? (
                                    <TableRow><TableCell colSpan={5} className="text-center h-24 text-muted-foreground">No tax rules defined</TableCell></TableRow>
                                ) : (
                                    rules.map(rule => (
                                        <TableRow key={rule.id}>
                                            <TableCell className="font-medium">{rule.name}</TableCell>
                                            <TableCell className="text-right font-mono text-xs">
                                                {formatCurrency(rule.min_income)} - {formatCurrency(rule.max_income)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono">{rule.rate}%</TableCell>
                                            <TableCell className="text-right font-mono">{formatCurrency(rule.excess_amount)}</TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-1">
                                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(rule)}>
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => deleteMut.mutate(rule.id)} disabled={deleteMut.isPending}>
                                                        {deleteMut.isPending && deleteMut.variables === rule.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
