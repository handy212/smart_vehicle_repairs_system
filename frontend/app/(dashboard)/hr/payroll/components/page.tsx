"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrApi, SalaryComponent } from "@/lib/api/hr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Filter, Pencil, Trash2, DollarSign, Percent } from "lucide-react";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export default function SalaryComponentsPage() {
    return (
        <PermissionGuard permission="view_payroll">
            <DynamicPageTitle title="Salary Components" />
            <SalaryComponentsContent />
        </PermissionGuard>
    );
}

function SalaryComponentsContent() {
    const queryClient = useQueryClient();
    const [typeFilter, setTypeFilter] = useState<string | undefined>();
    const [showCreate, setShowCreate] = useState(false);
    const [editItem, setEditItem] = useState<SalaryComponent | null>(null);

    const { data, isLoading } = useQuery({
        queryKey: ["hr", "salary-components", typeFilter],
        queryFn: async () => (await hrApi.salaryComponents.list({ component_type: typeFilter })).data,
    });

    const deleteMut = useMutation({
        mutationFn: (id: number) => hrApi.salaryComponents.delete(id),
        onSuccess: () => { toast.success("Deleted"); queryClient.invalidateQueries({ queryKey: ["hr", "salary-components"] }); },
        onError: () => toast.error("Failed to delete"),
    });

    const components = data?.results ?? [];

    return (
        <div className="space-y-4">
            <StaffPageHeader
                title="Salary Components"
                breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "HR", href: "/hr" }, { label: "Payroll", href: "/hr/payroll" }, { label: "Components" }]}
                actions={<PermissionGuard permission="manage_payroll"><CompDialog open={showCreate} onOpenChange={setShowCreate} onSaved={() => { queryClient.invalidateQueries({ queryKey: ["hr", "salary-components"] }); setShowCreate(false); }} /></PermissionGuard>}
            />

            {!isLoading && (
                <div className="grid grid-cols-3 gap-3">
                    <Card className="shadow-sm border"><CardContent className="p-3 flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</span><span className="text-lg font-bold">{components.length}</span></CardContent></Card>
                    <Card className="shadow-sm border"><CardContent className="p-3 flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Allowances</span><span className="text-lg font-bold text-green-600">{components.filter(c => c.component_type === "allowance").length}</span></CardContent></Card>
                    <Card className="shadow-sm border"><CardContent className="p-3 flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Deductions</span><span className="text-lg font-bold text-red-600">{components.filter(c => c.component_type === "deduction").length}</span></CardContent></Card>
                </div>
            )}

            <Card className="border-none shadow-sm bg-muted/50">
                <CardContent className="p-3">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="h-8"><Filter className="h-4 w-4 mr-2" />{typeFilter ? (typeFilter === "allowance" ? "Allowances" : "Deductions") : "All Types"}</Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                            <DropdownMenuLabel>Filter by Type</DropdownMenuLabel><DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setTypeFilter(undefined)}>All Types</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setTypeFilter("allowance")}>Allowances</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setTypeFilter("deduction")}>Deductions</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </CardContent>
            </Card>

            <Card className="border-t shadow-sm">
                <CardHeader className="py-3 px-4 border-b bg-muted/30"><CardTitle className="text-sm font-semibold">All Components ({components.length})</CardTitle></CardHeader>
                <CardContent className="p-0">
                    {isLoading ? <div className="p-4 space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />)}</div> : (
                        <Table>
                            <TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50">
                                <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Name</TableHead>
                                <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Type</TableHead>
                                <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Calculation</TableHead>
                                <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Value</TableHead>
                                <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Taxable</TableHead>
                                <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Status</TableHead>
                                <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Actions</TableHead>
                            </TableRow></TableHeader>
                            <TableBody>
                                {components.length > 0 ? components.map(comp => (
                                    <TableRow key={comp.id} className="hover:bg-muted/50 border-b">
                                        <TableCell className="px-4 py-2"><div className="flex items-center gap-2"><div className={cn("h-7 w-7 rounded-md flex items-center justify-center", comp.component_type === "allowance" ? "bg-green-50 dark:bg-green-900/20" : "bg-red-50 dark:bg-red-900/20")}>{comp.component_type === "allowance" ? <DollarSign className="h-3.5 w-3.5 text-green-600" /> : <Percent className="h-3.5 w-3.5 text-red-600" />}</div><span className="text-sm font-medium">{comp.name}</span></div></TableCell>
                                        <TableCell className="px-4 py-2"><Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 capitalize border shadow-none", comp.component_type === "allowance" ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400" : "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400")}>{comp.component_type}</Badge></TableCell>
                                        <TableCell className="px-4 py-2 text-sm capitalize">{comp.calculation_type}</TableCell>
                                        <TableCell className="px-4 py-2 text-sm text-right font-mono">{comp.calculation_type === "fixed" ? parseFloat(comp.amount || "0").toLocaleString(undefined, { minimumFractionDigits: 2 }) : `${comp.percentage}%`}</TableCell>
                                        <TableCell className="px-4 py-2"><Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 border shadow-none", comp.is_taxable ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-gray-100 text-gray-600 border-gray-200")}>{comp.is_taxable ? "Taxable" : "Non-taxable"}</Badge></TableCell>
                                        <TableCell className="px-4 py-2"><Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 border shadow-none", comp.is_active ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-100 text-gray-600 border-gray-200")}>{comp.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                                        <TableCell className="px-4 py-2 text-right"><PermissionGuard permission="manage_payroll"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditItem(comp)}><Pencil className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600 hover:bg-red-50" onClick={() => deleteMut.mutate(comp.id)} disabled={deleteMut.isPending}><Trash2 className="h-3.5 w-3.5" /></Button></div></PermissionGuard></TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow><TableCell colSpan={7} className="h-32 text-center"><div className="flex flex-col items-center text-muted-foreground"><DollarSign className="h-8 w-8 mb-2 opacity-50" /><p className="text-sm">No salary components configured</p></div></TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {editItem && <CompDialog open={!!editItem} onOpenChange={(o) => { if (!o) setEditItem(null); }} existing={editItem} onSaved={() => { queryClient.invalidateQueries({ queryKey: ["hr", "salary-components"] }); setEditItem(null); }} />}
        </div>
    );
}

function CompDialog({ open, onOpenChange, existing, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; existing?: SalaryComponent; onSaved: () => void }) {
    const isEdit = !!existing;
    const [name, setName] = useState(existing?.name || "");
    const [compType, setCompType] = useState<string>(existing?.component_type || "allowance");
    const [calcType, setCalcType] = useState<string>(existing?.calculation_type || "fixed");
    const [amount, setAmount] = useState(existing?.amount || "");
    const [pct, setPct] = useState(existing?.percentage || "");
    const [taxable, setTaxable] = useState(existing?.is_taxable ?? true);
    const [active, setActive] = useState(existing?.is_active ?? true);

    const mut = useMutation({
        mutationFn: (d: Partial<SalaryComponent>) => isEdit ? hrApi.salaryComponents.update(existing!.id, d) : hrApi.salaryComponents.create(d),
        onSuccess: () => { toast.success(isEdit ? "Updated" : "Created"); onSaved(); },
        onError: () => toast.error("Failed"),
    });

    const content = (
        <DialogContent>
            <DialogHeader><DialogTitle>{isEdit ? "Edit" : "Add"} Component</DialogTitle><DialogDescription>Configure a salary allowance or deduction.</DialogDescription></DialogHeader>
            <div className="space-y-4 py-4">
                <div className="space-y-2"><Label>Name</Label><Input placeholder="e.g. Housing Allowance" value={name} onChange={e => setName(e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Type</Label><Select value={compType} onValueChange={setCompType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="allowance">Allowance</SelectItem><SelectItem value="deduction">Deduction</SelectItem></SelectContent></Select></div>
                    <div className="space-y-2"><Label>Calculation</Label><Select value={calcType} onValueChange={setCalcType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fixed">Fixed</SelectItem><SelectItem value="percentage">Percentage</SelectItem></SelectContent></Select></div>
                </div>
                {calcType === "fixed" ? <div className="space-y-2"><Label>Amount</Label><Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></div> : <div className="space-y-2"><Label>Percentage (%)</Label><Input type="number" step="0.01" value={pct} onChange={e => setPct(e.target.value)} /></div>}
                <div className="flex items-center justify-between rounded-md border p-3"><div><Label>Taxable</Label><p className="text-xs text-muted-foreground">Subject to tax</p></div><Switch checked={taxable} onCheckedChange={setTaxable} /></div>
                <div className="flex items-center justify-between rounded-md border p-3"><div><Label>Active</Label><p className="text-xs text-muted-foreground">Include in payroll</p></div><Switch checked={active} onCheckedChange={setActive} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => mut.mutate({ name, component_type: compType as any, calculation_type: calcType as any, amount: calcType === "fixed" ? amount : "0", percentage: calcType === "percentage" ? pct : "0", is_taxable: taxable, is_active: active })} disabled={!name || mut.isPending}>{mut.isPending ? "Saving..." : isEdit ? "Update" : "Create"}</Button></DialogFooter>
        </DialogContent>
    );

    if (isEdit) return <Dialog open={open} onOpenChange={onOpenChange}>{content}</Dialog>;
    return <Dialog open={open} onOpenChange={onOpenChange}><DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-2" />Add Component</Button></DialogTrigger>{content}</Dialog>;
}
