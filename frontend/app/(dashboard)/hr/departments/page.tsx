"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrApi, Department, Position } from "@/lib/api/hr";
import { branchesApi } from "@/lib/api/branches";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Plus, Building2, Briefcase, Pencil, Trash2 } from "lucide-react";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useRouter } from "next/navigation";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { cn } from "@/lib/utils/cn";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableHeader, SortConfig } from "@/components/ui/sortable-header";
import { sortOrderingParam, toggleSortConfig } from "@/lib/utils/table-sort";

export default function DepartmentsPage() {
    return (
        <PermissionPageGuard permission="view_departments">
            <DynamicPageTitle title="Departments & Positions" />
            <DepartmentsContent />
        </PermissionPageGuard>
    );
}

function DepartmentsContent() {
    const [activeTab, setActiveTab] = useState("departments");
    const [showCreateDept, setShowCreateDept] = useState(false);
    const [showCreatePos, setShowCreatePos] = useState(false);
    const [editingDept, setEditingDept] = useState<Department | null>(null);
    const [editingPos, setEditingPos] = useState<Position | null>(null);
    const [deletingType, setDeletingType] = useState<"department" | "position" | null>(null);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const queryClient = useQueryClient();

    return (
        <div className="space-y-4">
            <StaffPageHeader
                title="Departments & Positions"
                breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "HR", href: "/hr" }, { label: "Departments" }]}
                actions={
                    <div className="flex gap-2">
                        {activeTab === "departments" && (
                            <PermissionGuard permission="manage_departments">
                                <Button onClick={() => setShowCreateDept(true)}><Plus className="h-4 w-4 mr-2" />New Department</Button>
                            </PermissionGuard>
                        )}
                        {activeTab === "positions" && (
                            <PermissionGuard permission="manage_departments">
                                <Button onClick={() => setShowCreatePos(true)}><Plus className="h-4 w-4 mr-2" />New Position</Button>
                            </PermissionGuard>
                        )}
                    </div>
                }
            />

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList>
                    <TabsTrigger value="departments">Departments</TabsTrigger>
                    <TabsTrigger value="positions">Positions</TabsTrigger>
                </TabsList>

                <TabsContent value="departments">
                    <DepartmentsList onEdit={setEditingDept} onDelete={(id) => { setDeletingType("department"); setDeletingId(id); }} />
                </TabsContent>
                <TabsContent value="positions">
                    <PositionsList onEdit={setEditingPos} onDelete={(id) => { setDeletingType("position"); setDeletingId(id); }} />
                </TabsContent>
            </Tabs>

            <CreateDepartmentDialog open={showCreateDept} onOpenChange={setShowCreateDept} onCreated={() => { queryClient.invalidateQueries({ queryKey: ["hr", "departments"] }); setShowCreateDept(false); }} />
            <CreatePositionDialog open={showCreatePos} onOpenChange={setShowCreatePos} onCreated={() => { queryClient.invalidateQueries({ queryKey: ["hr", "positions"] }); setShowCreatePos(false); }} />

            <EditDepartmentDialog
                dept={editingDept}
                open={!!editingDept}
                onOpenChange={(o) => !o && setEditingDept(null)}
                onUpdated={() => { queryClient.invalidateQueries({ queryKey: ["hr", "departments"] }); setEditingDept(null); }}
            />

            <EditPositionDialog
                pos={editingPos}
                open={!!editingPos}
                onOpenChange={(o) => !o && setEditingPos(null)}
                onUpdated={() => { queryClient.invalidateQueries({ queryKey: ["hr", "positions"] }); setEditingPos(null); }}
            />

            <DeleteConfirmDialog
                open={!!deletingType}
                onOpenChange={(o) => !o && setDeletingType(null)}
                type={deletingType || "department"}
                id={deletingId}
                onDeleted={() => {
                    queryClient.invalidateQueries({ queryKey: ["hr", deletingType === "department" ? "departments" : "positions"] });
                    setDeletingType(null);
                    setDeletingId(null);
                }}
            />
        </div>
    );
}

function DepartmentsList({ onEdit, onDelete }: { onEdit: (d: Department) => void, onDelete: (id: number) => void }) {
    const { data, isLoading } = useQuery({
        queryKey: ["hr", "departments"],
        queryFn: async () => (await hrApi.departments.list()).data,
    });

    const departments = data?.results ?? [];

    if (isLoading) return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{[1, 2, 3].map(i => <div key={i} className="h-40 bg-muted animate-pulse rounded-xl" />)}</div>;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {departments.map(dept => (
                <Card key={dept.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                            <CardTitle className="text-lg flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /> {dept.name}</CardTitle>
                            {dept.is_active ? <Badge variant="secondary" className="bg-success/15 text-success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                        </div>
                        <CardDescription className="line-clamp-2 min-h-[2.5rem]">{dept.description || "No description"}</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground pb-2">
                        <div className="flex justify-between py-1 border-b">
                            <span>Head:</span>
                            <span className="font-medium text-foreground">{dept.head_name || "Unassigned"}</span>
                        </div>
                        <div className="flex justify-between py-1">
                            <span>Staff:</span>
                            <span className="font-medium text-foreground">{dept.staff_count}</span>
                        </div>
                    </CardContent>
                    <CardFooter className="pt-2">
                        <PermissionGuard permission="manage_departments">
                            <div className="flex gap-2">
                                <Button variant="ghost" size="sm" className="flex-1 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); onEdit(dept); }}><Pencil className="h-3 w-3 mr-2" />Edit</Button>
                                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); onDelete(dept.id); }}><Trash2 className="h-3 w-3" /></Button>
                            </div>
                        </PermissionGuard>
                    </CardFooter>
                </Card>
            ))}
            {departments.length === 0 && <div className="col-span-full h-32 flex items-center justify-center text-muted-foreground border-2 border-dashed rounded-xl">No available departments. Create one to get started.</div>}
        </div>
    );
}

function PositionsList({ onEdit, onDelete }: { onEdit: (p: Position) => void, onDelete: (id: number) => void }) {
    const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

    const handleSort = (field: string) => {
        setSortConfig((current) => toggleSortConfig(current, field));
    };

    const { data, isLoading } = useQuery({
        queryKey: ["hr", "positions", sortConfig],
        queryFn: async () => (await hrApi.positions.list({
            ordering: sortOrderingParam(sortConfig) || "title",
        })).data,
    });

    const positions = data?.results ?? [];

    if (isLoading) return <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}</div>;

    return (
        <Card>
            <Table>
                <TableHeader>
                    <TableRow>
                        <SortableHeader
                            field="title"
                            sortConfig={sortConfig}
                            onSort={handleSort}
                        >
                            Title
                        </SortableHeader>
                        <TableHead>Department</TableHead>
                        <TableHead>Salary Range</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {positions.map(pos => (
                        <TableRow key={pos.id}>
                            <TableCell className="font-medium">{pos.title}</TableCell>
                            <TableCell>{pos.department_name}</TableCell>
                            <TableCell>{pos.min_salary || "0"} - {pos.max_salary || "∞"}</TableCell>
                            <TableCell>{pos.is_active ? <Badge variant="secondary" className="bg-success/15 text-success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                            <TableCell>
                                <PermissionGuard permission="manage_departments">
                                    <div className="flex gap-1 justify-end">
                                        <Button variant="ghost" size="icon" onClick={() => onEdit(pos)} aria-label={`Edit position ${pos.title}`}><Pencil className="h-4 w-4" /></Button>
                                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => onDelete(pos.id)} aria-label={`Delete position ${pos.title}`}><Trash2 className="h-4 w-4" /></Button>
                                    </div>
                                </PermissionGuard>
                            </TableCell>
                        </TableRow>
                    ))}
                    {positions.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">No positions found.</TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </Card>
    );
}

function CreateDepartmentDialog({ open, onOpenChange, onCreated }: { open: boolean, onOpenChange: (o: boolean) => void, onCreated: () => void }) {
    const [name, setName] = useState("");
    const [desc, setDesc] = useState("");
    const [branchId, setBranchId] = useState("");

    const { data: branches = [] } = useQuery({
        queryKey: ["branches", "list", { is_active: true }],
        queryFn: () => branchesApi.list({ is_active: true }),
    });

    const mut = useMutation({

        mutationFn: (data: any) => hrApi.departments.create(data),
        onSuccess: () => {
            toast.success("Department created");
            onCreated();
            setName("");
            setDesc("");
            setBranchId("");
        },
        onError: () => toast.error("Failed to create department"),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>New Department</DialogTitle>
                    <DialogDescription>Create a new functional unit.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Name</Label>
                        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Engineering" />
                    </div>

                    <div className="space-y-2">
                        <Label>Branch</Label>
                        <Select value={branchId} onValueChange={setBranchId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select Branch" />
                            </SelectTrigger>
                            <SelectContent>
                                {branches.map(b => (
                                    <SelectItem key={b.id} value={b.id.toString()}>
                                        {b.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            If left empty, your primary branch will be assigned.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Department responsibilities..." />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button
                        onClick={() => mut.mutate({
                            name,
                            description: desc,
                            branch: branchId ? Number(branchId) : null,
                            is_active: true
                        })}
                        disabled={!name || mut.isPending}
                    >
                        Create
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function CreatePositionDialog({ open, onOpenChange, onCreated }: { open: boolean, onOpenChange: (o: boolean) => void, onCreated: () => void }) {
    const [title, setTitle] = useState("");
    const [deptId, setDeptId] = useState("");
    const [desc, setDesc] = useState("");
    const [minSal, setMinSal] = useState("");
    const [maxSal, setMaxSal] = useState("");

    const { data: departments } = useQuery({ queryKey: ["hr", "departments", "list"], queryFn: async () => (await hrApi.departments.list()).data });

    const mut = useMutation({

        mutationFn: (data: any) => hrApi.positions.create(data),
        onSuccess: () => { toast.success("Position created"); onCreated(); setTitle(""); setDesc(""); setDeptId(""); },
        onError: () => toast.error("Failed to create position"),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>New Position</DialogTitle><DialogDescription>Define a job role.</DialogDescription></DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2"><Label>Job Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Senior Technician" /></div>
                    <div className="space-y-2">
                        <Label>Department</Label>
                        <Select value={deptId} onValueChange={setDeptId}>
                            <SelectTrigger><SelectValue placeholder="Select Department" /></SelectTrigger>
                            <SelectContent>
                                {departments?.results?.map(d => (
                                    <SelectItem key={d.id} value={d.id.toString()}>
                                        {d.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Min Salary</Label><Input type="number" value={minSal} onChange={e => setMinSal(e.target.value)} /></div>
                        <div className="space-y-2"><Label>Max Salary</Label><Input type="number" value={maxSal} onChange={e => setMaxSal(e.target.value)} /></div>
                    </div>
                    <div className="space-y-2"><Label>Description</Label><Textarea value={desc} onChange={e => setDesc(e.target.value)} /></div>
                </div>
                <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => mut.mutate({ title, department: Number(deptId), description: desc, min_salary: minSal || null, max_salary: maxSal || null, is_active: true })} disabled={!title || !deptId || mut.isPending}>Create</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function EditDepartmentDialog({ dept, open, onOpenChange, onUpdated }: { dept: Department | null, open: boolean, onOpenChange: (o: boolean) => void, onUpdated: () => void }) {
    const [name, setName] = useState("");
    const [desc, setDesc] = useState("");
    const [isActive, setIsActive] = useState(true);

    useEffect(() => {
        if (dept) {
            setName(dept.name);
            setDesc(dept.description || "");
            setIsActive(dept.is_active);
        }
    }, [dept]);

    const mut = useMutation({

        mutationFn: (data: any) => hrApi.departments.update(dept!.id, data),
        onSuccess: () => { toast.success("Department updated"); onUpdated(); },
        onError: () => toast.error("Failed to update department"),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Edit Department</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2"><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Description</Label><Textarea value={desc} onChange={e => setDesc(e.target.value)} /></div>
                    <div className="flex items-center gap-2">
                        <Switch checked={isActive} onCheckedChange={setIsActive} />
                        <Label>Active</Label>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={() => mut.mutate({ name, description: desc, is_active: isActive })} disabled={!name || mut.isPending}>Save Changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function EditPositionDialog({ pos, open, onOpenChange, onUpdated }: { pos: Position | null, open: boolean, onOpenChange: (o: boolean) => void, onUpdated: () => void }) {
    const [title, setTitle] = useState("");
    const [deptId, setDeptId] = useState("");
    const [desc, setDesc] = useState("");
    const [minSal, setMinSal] = useState("");
    const [maxSal, setMaxSal] = useState("");
    const [isActive, setIsActive] = useState(true);

    const { data: departments } = useQuery({ queryKey: ["hr", "departments", "list"], queryFn: async () => (await hrApi.departments.list()).data });

    useEffect(() => {
        if (pos) {
            setTitle(pos.title);
            setDeptId(pos.department.toString());
            setDesc(pos.description || "");
            setMinSal(pos.min_salary || "");
            setMaxSal(pos.max_salary || "");
            setIsActive(pos.is_active);
        }
    }, [pos]);

    const mut = useMutation({

        mutationFn: (data: any) => hrApi.positions.update(pos!.id, data),
        onSuccess: () => { toast.success("Position updated"); onUpdated(); },
        onError: () => toast.error("Failed to update position"),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Edit Position</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2"><Label>Job Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} /></div>
                    <div className="space-y-2">
                        <Label>Department</Label>
                        <Select value={deptId} onValueChange={setDeptId}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {departments?.results?.map(d => <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Min Salary</Label><Input type="number" value={minSal} onChange={e => setMinSal(e.target.value)} /></div>
                        <div className="space-y-2"><Label>Max Salary</Label><Input type="number" value={maxSal} onChange={e => setMaxSal(e.target.value)} /></div>
                    </div>
                    <div className="space-y-2"><Label>Description</Label><Textarea value={desc} onChange={e => setDesc(e.target.value)} /></div>
                    <div className="flex items-center gap-2">
                        <Switch checked={isActive} onCheckedChange={setIsActive} />
                        <Label>Active</Label>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={() => mut.mutate({ title, department: Number(deptId), description: desc, min_salary: minSal || null, max_salary: maxSal || null, is_active: isActive })} disabled={!title || !deptId || mut.isPending}>Save Changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DeleteConfirmDialog({ open, onOpenChange, type, id, onDeleted }: { open: boolean, onOpenChange: (o: boolean) => void, type: "department" | "position", id: number | null, onDeleted: () => void }) {
    const mut = useMutation({
        mutationFn: () => type === "department" ? hrApi.departments.delete(id!) : hrApi.positions.delete(id!),
        onSuccess: () => { toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted`); onDeleted(); },

        onError: (err: any) => toast.error(err.response?.data?.detail || `Failed to delete ${type}`),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Are you sure?</DialogTitle><DialogDescription>This action cannot be undone. This will permanently delete the {type}.</DialogDescription></DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button variant="destructive" onClick={() => mut.mutate()} disabled={mut.isPending}>{mut.isPending ? "Deleting..." : "Delete"}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
