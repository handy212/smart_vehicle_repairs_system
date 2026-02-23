"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrApi, TrainingProgram, StaffTraining } from "@/lib/api/hr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { GraduationCap, Calendar, Users, CheckCircle, UserPlus, ArrowLeft, MoreHorizontal, Trash2, Pencil } from "lucide-react";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { useParams, useRouter } from "next/navigation";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { cn } from "@/lib/utils/cn";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useState, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store/authStore";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function TrainingDetailPage() {
    return (
        <PermissionGuard permission="view_training">
            <TrainingDetailContent />
        </PermissionGuard>
    );
}

function TrainingDetailContent() {
    const params = useParams();
    const queryClient = useQueryClient();
    const router = useRouter();
    const id = Number(params.id);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { user } = useAuthStore();
    const [showEnroll, setShowEnroll] = useState(false);
    const [showEdit, setShowEdit] = useState(false);
    const [showDelete, setShowDelete] = useState(false);
    const [editingEnrollment, setEditingEnrollment] = useState<StaffTraining | null>(null);
    const [deletingEnrollmentId, setDeletingEnrollmentId] = useState<number | null>(null);

    const { data: program, isLoading } = useQuery({
        queryKey: ["hr", "training-program", id],
        queryFn: async () => (await hrApi.trainingPrograms.get(id)).data,
    });

    // Fetch enrollments (for admin view)
    const { data: enrollmentsData } = useQuery({
        queryKey: ["hr", "program-enrollments", id],
        queryFn: async () => (await hrApi.staffTraining.list({ training: id })).data,
        enabled: !!program, // only fetch if program loads
    });

    const enrollments = enrollmentsData?.results ?? [];

    // Assuming I can get current staff ID. 
    // For now I'll use a placeholder or check if user has staff data.
    // In a real app, useAuth would provide staffId.

    if (isLoading) return <div className="p-8"><div className="h-64 bg-muted rounded animate-pulse" /></div>;
    if (!program) return <div className="p-8">Program not found</div>;

    return (
        <div className="space-y-4">
            <DynamicPageTitle title={program.name} />
            <StaffPageHeader
                title={program.name}
                breadcrumbs={[{ label: "Training", href: "/hr/training" }, { label: "Program Details" }]}
                actions={
                    <div className="flex gap-2">
                        <PermissionGuard permission="manage_training">
                            <Button onClick={() => setShowEnroll(true)}><UserPlus className="h-4 w-4 mr-2" /> Enroll Staff</Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-9 w-9 p-0 border"><MoreHorizontal className="h-4 w-4" /></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => setShowEdit(true)}><Pencil className="h-4 w-4 mr-2" />Edit Program</DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-red-600" onClick={() => setShowDelete(true)}><Trash2 className="h-4 w-4 mr-2" />Delete Program</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </PermissionGuard>
                    </div>
                }
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="md:col-span-2 space-y-4">
                    <CardHeader><CardTitle>About this Program</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-muted-foreground whitespace-pre-wrap">{program.description}</p>
                        <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                            <div className="flex items-center gap-3"><Users className="h-5 w-5 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Enrolled</p><p className="font-medium">{program.enrolled_count} Students</p></div></div>
                            <div className="flex items-center gap-3"><Calendar className="h-5 w-5 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Start Date</p><p className="font-medium">{program.start_date || "Flexible"}</p></div></div>
                            <div className="flex items-center gap-3"><GraduationCap className="h-5 w-5 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Trainer</p><p className="font-medium">{program.trainer || "Self-Paced"}</p></div></div>
                            <div className="flex items-center gap-3"><CheckCircle className="h-5 w-5 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Type</p><p className="font-medium">{program.is_mandatory ? "Mandatory" : "Elective"}</p></div></div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="md:col-span-1 h-fit bg-primary/5 border-primary/20">
                    <CardHeader><CardTitle className="text-primary">Quick Enroll</CardTitle><CardDescription>Join this course today.</CardDescription></CardHeader>
                    <CardContent>
                        <Button className="w-full font-bold" size="lg" onClick={() => setShowEnroll(true)}>Enroll Now</Button>
                        <p className="text-xs text-muted-foreground text-center mt-2">Approval may be required.</p>
                    </CardContent>
                </Card>

                {/* Enrollments List (Admin Only) */}
                <PermissionGuard permission="manage_training">
                    <Card className="col-span-full mt-4">
                        <CardHeader><CardTitle>Enrolled Staff ({enrollments.length})</CardTitle></CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader><TableRow><TableHead>Staff</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead><TableHead>Score</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {enrollments.map(rec => (
                                        <TableRow key={rec.id}>
                                            <TableCell className="font-medium">{rec.staff_name}</TableCell>
                                            <TableCell><Badge variant="outline" className="capitalize">{rec.status.replace("_", " ")}</Badge></TableCell>
                                            <TableCell>{rec.enrolled_date}</TableCell>
                                            <TableCell>{rec.score ? `${rec.score}%` : "-"}</TableCell>
                                            <TableCell className="text-right">
                                                <PermissionGuard permission="manage_training">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem onClick={() => setEditingEnrollment(rec)}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem className="text-red-600" onClick={() => setDeletingEnrollmentId(rec.id)}><Trash2 className="h-4 w-4 mr-2" />Unenroll</DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </PermissionGuard>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {enrollments.length === 0 && <TableRow><TableCell colSpan={4} className="h-16 text-center text-muted-foreground">No enrollments yet</TableCell></TableRow>}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </PermissionGuard>
            </div>

            <EnrollDialog open={showEnroll} onOpenChange={setShowEnroll} programId={program.id} onEnrolled={() => { queryClient.invalidateQueries({ queryKey: ["hr", "program-enrollments", id] }); setShowEnroll(false); }} />

            <EditProgramDialog
                program={program}
                open={showEdit}
                onOpenChange={setShowEdit}
                onUpdated={() => { queryClient.invalidateQueries({ queryKey: ["hr", "training-program", id] }); setShowEdit(false); }}
            />

            <DeleteConfirmDialog
                open={showDelete}
                onOpenChange={setShowDelete}
                id={program.id}
                onDeleted={() => { router.push("/hr/training"); }}
            />

            <EditEnrollmentDialog
                enrollment={editingEnrollment}
                open={!!editingEnrollment}
                onOpenChange={(o) => !o && setEditingEnrollment(null)}
                onUpdated={() => { queryClient.invalidateQueries({ queryKey: ["hr", "program-enrollments", id] }); setEditingEnrollment(null); }}
            />

            <UnenrollDialog
                open={!!deletingEnrollmentId}
                onOpenChange={(o) => !o && setDeletingEnrollmentId(null)}
                id={deletingEnrollmentId}
                onDeleted={() => { queryClient.invalidateQueries({ queryKey: ["hr", "program-enrollments", id] }); setDeletingEnrollmentId(null); }}
            />
        </div>
    );
}

function EditProgramDialog({ program, open, onOpenChange, onUpdated }: { program: TrainingProgram, open: boolean, onOpenChange: (o: boolean) => void, onUpdated: () => void }) {
    const [name, setName] = useState("");
    const [trainer, setTrainer] = useState("");
    const [desc, setDesc] = useState("");
    const [mandatory, setMandatory] = useState(false);
    const [start, setStart] = useState("");

    useEffect(() => {
        if (program) {
            setName(program.name);
            setTrainer(program.trainer || "");
            setDesc(program.description || "");
            setMandatory(program.is_mandatory);
            setStart(program.start_date || "");
        }
    }, [program]);

    const mut = useMutation({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mutationFn: (data: any) => hrApi.trainingPrograms.update(program.id, data),
        onSuccess: () => { toast.success("Program updated"); onUpdated(); },
        onError: () => toast.error("Failed to update"),
    });

return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
            <DialogHeader><DialogTitle>Edit training Program</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
                <div className="space-y-2"><Label>Program Name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
                <div className="space-y-2"><Label>Trainer</Label><Input value={trainer} onChange={e => setTrainer(e.target.value)} /></div>
                <div className="space-y-2"><Label>Description</Label><Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} /></div>
                <div className="space-y-2"><Label>Start Date</Label><Input type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
                <div className="flex items-center justify-between border p-3 rounded-lg">
                    <div><Label>Mandatory</Label><p className="text-xs text-muted-foreground">Required for all staff?</p></div>
                    <Switch checked={mandatory} onCheckedChange={setMandatory} />
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button onClick={() => mut.mutate({ name, trainer, description: desc, is_mandatory: mandatory, start_date: start || null })} disabled={mut.isPending}>Save Changes</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
);
}

function DeleteConfirmDialog({ open, onOpenChange, id, onDeleted }: { open: boolean, onOpenChange: (o: boolean) => void, id: number, onDeleted: () => void }) {
    const mut = useMutation({
        mutationFn: () => hrApi.trainingPrograms.delete(id),
        onSuccess: () => { toast.success("Program deleted"); onDeleted(); },
        onError: () => toast.error("Failed to delete program"),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Are you sure?</DialogTitle><DialogDescription>This will permanently delete this training program and all enrollments.</DialogDescription></DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button variant="destructive" onClick={() => mut.mutate()} disabled={mut.isPending}>Delete</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function EditEnrollmentDialog({ enrollment, open, onOpenChange, onUpdated }: { enrollment: StaffTraining | null, open: boolean, onOpenChange: (o: boolean) => void, onUpdated: () => void }) {
    const [status, setStatus] = useState("");
    const [score, setScore] = useState("");

    useEffect(() => {
        if (enrollment) {
            setStatus(enrollment.status);
            setScore(enrollment.score?.toString() || "");
        }
    }, [enrollment]);

    const mut = useMutation({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mutationFn: (data: any) => hrApi.staffTraining.update(enrollment!.id, data),
        onSuccess: () => { toast.success("Enrollment updated"); onUpdated(); },
        onError: () => toast.error("Failed to update"),
    });

return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
            <DialogHeader><DialogTitle>Edit Enrollment</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
                <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="enrolled">Enrolled</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="failed">Failed</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2"><Label>Score (%)</Label><Input type="number" value={score} onChange={e => setScore(e.target.value)} min="0" max="100" /></div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button onClick={() => mut.mutate({ status, score: score ? Number(score) : null })} disabled={mut.isPending}>Save Changes</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
);
}

function UnenrollDialog({ open, onOpenChange, id, onDeleted }: { open: boolean, onOpenChange: (o: boolean) => void, id: number | null, onDeleted: () => void }) {
    const mut = useMutation({
        mutationFn: () => hrApi.staffTraining.delete(id!),
        onSuccess: () => { toast.success("Staff unenrolled"); onDeleted(); },
        onError: () => toast.error("Failed to unenroll"),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Are you sure?</DialogTitle><DialogDescription>This will remove the staff from this training program.</DialogDescription></DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button variant="destructive" onClick={() => mut.mutate()} disabled={mut.isPending}>Unenroll</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function EnrollDialog({ open, onOpenChange, programId, onEnrolled }: { open: boolean, onOpenChange: (o: boolean) => void, programId: number, onEnrolled: () => void }) {
    const [empId, setEmpId] = useState("");

    // Fetch staff
    const { data: staff } = useQuery({ queryKey: ["hr", "staff-list"], queryFn: async () => (await hrApi.staff.list()).data });

    const mut = useMutation({
        mutationFn: () => hrApi.trainingPrograms.enroll(programId, Number(empId)),
        onSuccess: () => { toast.success("Staff enrolled"); onEnrolled(); },
        onError: () => toast.error("Failed to enroll"),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Enroll Staff</DialogTitle><DialogDescription>Select an staff to enroll in this course.</DialogDescription></DialogHeader>
                <div className="py-4">
                    <div className="space-y-2">
                        <Label>Staff</Label>
                        <Select value={empId} onValueChange={setEmpId}>
                            <SelectTrigger><SelectValue placeholder="Select Staff" /></SelectTrigger>
                            <SelectContent>
                                {staff?.results.map(e => <SelectItem key={e.id} value={e.id.toString()}>{e.full_name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => mut.mutate()} disabled={!empId || mut.isPending}>{mut.isPending ? "Enrolling..." : "Enroll"}</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
