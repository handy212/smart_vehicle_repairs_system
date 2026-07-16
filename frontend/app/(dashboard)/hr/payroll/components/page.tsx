"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { hrApi, SalaryComponent, EmployeeSalaryComponent, EmployeeProfile } from "@/lib/api/hr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Plus, Filter, Pencil, Trash2, DollarSign, Percent, User, Building2 } from "lucide-react";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard"
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/lib/toast";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Check } from "lucide-react";

export default function SalaryComponentsPage() {
    return (
        <PermissionPageGuard permission="view_payroll">
            <DynamicPageTitle title="Salary Components" />
            <Tabs defaultValue="components">
                <div className="space-y-4">
                    <StaffPageHeader
                        title="Salary Components"
                        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "HR", href: "/hr" }, { label: "Payroll", href: "/hr/payroll" }, { label: "Components" }]}
                        actions={
                            <TabsList>
                                <TabsTrigger value="components">Components</TabsTrigger>
                                <TabsTrigger value="assignments">Employee Assignments</TabsTrigger>
                            </TabsList>
                        }
                    />

                    <TabsContent value="components" className="mt-0">
                        <SalaryComponentsContent />
                    </TabsContent>

                    <TabsContent value="assignments" className="mt-0">
                        <AssignmentsContent />
                    </TabsContent>
                </div>
            </Tabs>
        </PermissionPageGuard>
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
            <div className="flex justify-between items-center bg-card p-4 rounded-lg border shadow-sm">
                <div className="flex items-center gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="h-8"><Filter className="h-4 w-4 mr-2" />{typeFilter ? (typeFilter === "allowance" ? "Allowances" : "Deductions") : "All Types"}</Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                            <DropdownMenuLabel>Filter by Type</DropdownMenuLabel><DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setTypeFilter(undefined)}>All Types</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setTypeFilter("allowance")}>Allowances</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setTypeFilter("deduction")}>Deductions</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                <PermissionGuard permission="manage_payroll">
                    <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-2" />Add Component</Button>
                </PermissionGuard>
            </div>

            <Card className="border shadow-sm">
                <CardHeader className="py-3 px-4 border-b bg-muted/30"><CardTitle className="text-sm font-semibold">All Components ({components.length})</CardTitle></CardHeader>
                <CardContent className="p-0">
                    {isLoading ? <div className="p-4 space-y-2 text-center text-sm text-muted-foreground">Loading...</div> : (
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
                                        <TableCell className="px-4 py-2"><div className="flex items-center gap-2"><div className={cn("h-7 w-7 rounded-md flex items-center justify-center", comp.component_type === "allowance" ? "bg-success/10 dark:bg-success/20" : "bg-destructive/10 dark:bg-destructive/20")}>{comp.component_type === "allowance" ? <DollarSign className="h-3.5 w-3.5 text-success" /> : <Percent className="h-3.5 w-3.5 text-destructive" />}</div><span className="text-sm font-medium">{comp.name}</span></div></TableCell>
                                        <TableCell className="px-4 py-2"><Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 capitalize border shadow-none", comp.component_type === "allowance" ? "bg-success/15 text-success border-success/20 dark:bg-success/20 dark:text-success" : "bg-destructive/10 text-destructive border-destructive/20 dark:bg-destructive/20 dark:text-destructive")}>{comp.component_type}</Badge></TableCell>
                                        <TableCell className="px-4 py-2 text-sm capitalize">{comp.calculation_type}</TableCell>
                                        <TableCell className="px-4 py-2 text-sm text-right font-mono">{comp.calculation_type === "fixed" ? parseFloat(comp.amount || "0").toLocaleString(undefined, { minimumFractionDigits: 2 }) : `${comp.percentage}%`}</TableCell>
                                        <TableCell className="px-4 py-2"><Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 border shadow-none", comp.is_taxable ? "bg-warning/10 text-warning border-warning/20" : "bg-muted text-muted-foreground border-border")}>{comp.is_taxable ? "Taxable" : "Non-taxable"}</Badge></TableCell>
                                        <TableCell className="px-4 py-2"><Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 border shadow-none", comp.is_active ? "bg-success/15 text-success border-success/20" : "bg-muted text-muted-foreground border-border")}>{comp.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                                        <TableCell className="px-4 py-2 text-right"><PermissionGuard permission="manage_payroll"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditItem(comp)} aria-label={`Edit ${comp.name}`}><Pencil className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10" onClick={() => deleteMut.mutate(comp.id)} disabled={deleteMut.isPending} aria-label={`Delete ${comp.name}`}><Trash2 className="h-3.5 w-3.5" /></Button></div></PermissionGuard></TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">No salary components configured</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <CompDialog open={showCreate} onOpenChange={setShowCreate} onSaved={() => { queryClient.invalidateQueries({ queryKey: ["hr", "salary-components"] }); setShowCreate(false); }} />
            {editItem && <CompDialog open={!!editItem} onOpenChange={(o) => { if (!o) setEditItem(null); }} existing={editItem} onSaved={() => { queryClient.invalidateQueries({ queryKey: ["hr", "salary-components"] }); setEditItem(null); }} />}
        </div>
    );
}

function AssignmentsContent() {
    const queryClient = useQueryClient();
    const [showCreate, setShowCreate] = useState(false);
    const [editItem, setEditItem] = useState<EmployeeSalaryComponent | null>(null);

    const { data, isLoading } = useQuery({
        queryKey: ["hr", "employee-salary-components"],
        queryFn: async () => (await hrApi.employeeSalaryComponents.list()).data,
    });

    const deleteMut = useMutation({
        mutationFn: (id: number) => hrApi.employeeSalaryComponents.delete(id),
        onSuccess: () => { toast.success("Assignment removed"); queryClient.invalidateQueries({ queryKey: ["hr", "employee-salary-components"] }); },
        onError: () => toast.error("Failed to remove assignment"),
    });

    const assignments = data?.results ?? [];

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-card p-4 rounded-lg border shadow-sm">
                <div />
                <PermissionGuard permission="manage_payroll">
                    <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-2" />Assign Component</Button>
                </PermissionGuard>
            </div>

            <Card className="border shadow-sm">
                <CardHeader className="py-3 px-4 border-b bg-muted/30"><CardTitle className="text-sm font-semibold">Assignments ({assignments.length})</CardTitle></CardHeader>
                <CardContent className="p-0">
                    {isLoading ? <div className="p-4 space-y-2 text-center text-sm text-muted-foreground">Loading...</div> : (
                        <Table>
                            <TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50">
                                <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Employee</TableHead>
                                <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Component</TableHead>
                                <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Type</TableHead>
                                <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Amount</TableHead>
                                <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Status</TableHead>
                                <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Actions</TableHead>
                            </TableRow></TableHeader>
                            <TableBody>
                                {assignments.length > 0 ? assignments.map(a => (
                                    <TableRow key={a.id} className="hover:bg-muted/50 border-b">
                                        <TableCell className="px-4 py-2"><div className="flex items-center gap-2"><div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center"><User className="h-3 w-3 text-primary" /></div><span className="text-sm font-medium">{a.employee_name}</span></div></TableCell>
                                        <TableCell className="px-4 py-2 font-medium">{a.component_name}</TableCell>
                                        <TableCell className="px-4 py-2"><Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 capitalize border shadow-none", a.component_type === "allowance" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>{a.component_type}</Badge></TableCell>
                                        <TableCell className="px-4 py-2 text-sm text-right font-mono">{parseFloat(a.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="px-4 py-2"><Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 border shadow-none", a.is_active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>{a.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                                        <TableCell className="px-4 py-2 text-right"><PermissionGuard permission="manage_payroll"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditItem(a)} aria-label={`Edit assignment for ${a.employee_name}`}><Pencil className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10" onClick={() => deleteMut.mutate(a.id)} disabled={deleteMut.isPending} aria-label={`Delete assignment for ${a.employee_name}`}><Trash2 className="h-3.5 w-3.5" /></Button></div></PermissionGuard></TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No assignments found</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <AssignmentDialog open={showCreate} onOpenChange={setShowCreate} onSaved={() => { queryClient.invalidateQueries({ queryKey: ["hr", "employee-salary-components"] }); setShowCreate(false); }} />
            {editItem && <AssignmentDialog open={!!editItem} onOpenChange={(o) => { if (!o) setEditItem(null); }} existing={editItem} onSaved={() => { queryClient.invalidateQueries({ queryKey: ["hr", "employee-salary-components"] }); setEditItem(null); }} />}
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

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
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
        </Dialog>
    );
}

function AssignmentDialog({ open, onOpenChange, existing, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; existing?: EmployeeSalaryComponent; onSaved: () => void }) {
    const isEdit = !!existing;
    const [empId, setEmpId] = useState<string>(existing?.employee?.toString() || "");
    const [compId, setCompId] = useState<string>(existing?.component?.toString() || "");
    const [amount, setAmount] = useState(existing?.amount || "");
    const [active, setActive] = useState(existing?.is_active ?? true);

    const { data: employees } = useQuery({ queryKey: ["hr", "staff"], queryFn: async () => (await hrApi.staff.list({ employment_status: 'active' })).data.results });
    const { data: components } = useQuery({ queryKey: ["hr", "salary-components", "active"], queryFn: async () => (await hrApi.salaryComponents.list({ is_active: true })).data.results });

    const mut = useMutation({

        mutationFn: (d: any) => isEdit ? hrApi.employeeSalaryComponents.update(existing!.id, d) : hrApi.employeeSalaryComponents.create(d),
        onSuccess: () => { toast.success(isEdit ? "Updated" : "Assigned"); onSaved(); },
        onError: () => toast.error("Failed"),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>{isEdit ? "Edit" : "New"} Assignment</DialogTitle><DialogDescription>Assign a component to an employee with a specific amount.</DialogDescription></DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Employee</Label>
                        <Select value={empId} onValueChange={setEmpId} disabled={isEdit}>
                            <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                            <SelectContent>
                                {employees?.map(e => <SelectItem key={e.id} value={e.id.toString()}>{e.full_name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Component</Label>
                        <Select value={compId} onValueChange={setCompId} disabled={isEdit}>
                            <SelectTrigger><SelectValue placeholder="Select component" /></SelectTrigger>
                            <SelectContent>
                                {components?.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name} ({c.component_type})</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Amount</Label>
                        <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
                        <p className="text-xs text-muted-foreground">Override amount for this employee</p>
                    </div>
                    <div className="flex items-center justify-between rounded-md border p-3"><div><Label>Active</Label><p className="text-xs text-muted-foreground">Include in payroll</p></div><Switch checked={active} onCheckedChange={setActive} /></div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={() => mut.mutate({ employee: parseInt(empId), component: parseInt(compId), amount, is_active: active })} disabled={!empId || !compId || !amount || mut.isPending}>
                        {mut.isPending ? "Saving..." : "Save"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
