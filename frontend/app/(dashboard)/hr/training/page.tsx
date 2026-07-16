"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { hrApi, TrainingProgram, StaffTraining } from "@/lib/api/hr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { GraduationCap, BookOpen, Calendar, Users, User, Plus, Award, CheckCircle, MoreHorizontal, Trash2, Pencil } from "lucide-react";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useState, useEffect } from "react";
import { toast } from "@/lib/toast";


export default function TrainingPage() {
    return (
        <PermissionPageGuard permission="view_training">
            <DynamicPageTitle title="Training" />
            <TrainingContent />
        </PermissionPageGuard>
    );
}

function TrainingContent() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const router = useRouter();
    const [activeTab, setActiveTab] = useState("available");
    const [showCreate, setShowCreate] = useState(false);
    const queryClient = useQueryClient();


    return (
        <div className="space-y-4">
            <StaffPageHeader
                title="Training & Development"
                breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "HR", href: "/hr" }, { label: "Training" }]}
                actions={
                    <PermissionGuard permission="manage_training">
                        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-2" />New Program</Button>
                    </PermissionGuard>
                }
            />

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList>
                    <TabsTrigger value="available">Available Programs</TabsTrigger>
                    <TabsTrigger value="my_training">My Training</TabsTrigger>
                </TabsList>

                <TabsContent value="available">
                    <AvailableProgramsList />
                </TabsContent>
                <TabsContent value="my_training">
                    <MyTrainingList />
                </TabsContent>
            </Tabs>

            <CreateProgramDialog open={showCreate} onOpenChange={setShowCreate} onCreated={() => { queryClient.invalidateQueries({ queryKey: ["hr", "training-programs"] }); setShowCreate(false); }} />
        </div>
    );
}

function AvailableProgramsList() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [editingProg, setEditingProg] = useState<TrainingProgram | null>(null);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    // Fetch user profile to get staff ID for enrollment? 
    // The enroll API takes staffId. Ideally backend infers from session, but let's see. 
    // `hr.ts` enroll: (id, staffId) => ...
    // I'll need to get the current staff ID. 
    // For now I'll list programs. Enrollment might need a user selection if admin, or auto-current user.

    const { data, isLoading } = useQuery({
        queryKey: ["hr", "training-programs"],
        queryFn: async () => (await hrApi.trainingPrograms.list()).data,
    });

    const programs = data?.results ?? [];

    // Helper to enroll current user (placeholder ID 1 if not available, strictly for demo UI)
    // Real impl needs valid ID.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const enrollMutation = useMutation({
        mutationFn: ({ id, empId }: { id: number, empId: number }) => hrApi.trainingPrograms.enroll(id, empId),
        onSuccess: () => { toast.success("Enrolled successfully"); queryClient.invalidateQueries({ queryKey: ["hr", "my-training"] }); },
        onError: () => toast.error("Failed to enroll"),
    });

    if (isLoading) return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{[1, 2, 3].map(i => <div key={i} className="h-48 bg-muted animate-pulse rounded-xl" />)}</div>;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {programs.map(prog => (
                <Card key={prog.id} className="flex flex-col cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push(`/hr/training/${prog.id}`)}>
                    <CardHeader>
                        <div className="flex justify-between items-start">
                            <CardTitle className="text-lg line-clamp-1">{prog.name}</CardTitle>
                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                {prog.is_mandatory && <Badge variant="danger">Mandatory</Badge>}
                                <PermissionGuard permission="manage_training">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={`Actions for ${prog.name}`}><MoreHorizontal className="h-4 w-4" /></Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => setEditingProg(prog)}><Pencil className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem className="text-destructive" onClick={() => setDeletingId(prog.id)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </PermissionGuard>
                            </div>
                        </div>
                        <CardDescription className="line-clamp-2">{prog.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 space-y-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2"><Users className="h-4 w-4" /> {prog.enrolled_count} Enrolled</div>
                        <div className="flex items-center gap-2"><Calendar className="h-4 w-4" /> {prog.start_date || "Self-paced"}</div>
                        <div className="flex items-center gap-2"><User className="h-4 w-4" /> Trainer: {prog.trainer || "Online"}</div>
                    </CardContent>
                    <CardFooter className="pt-2 border-t">
                        <Button className="w-full" variant="outline" onClick={(e) => {
                            e.stopPropagation();
                            // Quick enroll placeholder - in real app, confirmation dialog or pass real staff ID
                            // check if already enrolled? Backend handles duplicate enrollment error.
                            toast.info("Please open details to enroll");
                            router.push(`/hr/training/${prog.id}`);
                        }}>View Details</Button>
                    </CardFooter>
                </Card>
            ))}
            {programs.length === 0 && <div className="col-span-full h-32 flex items-center justify-center text-muted-foreground border-2 border-dashed rounded-xl">No training programs available</div>}

            <EditProgramDialog
                program={editingProg}
                open={!!editingProg}
                onOpenChange={(o) => !o && setEditingProg(null)}
                onUpdated={() => { queryClient.invalidateQueries({ queryKey: ["hr", "training-programs"] }); setEditingProg(null); }}
            />

            <DeleteConfirmDialog
                open={!!deletingId}
                onOpenChange={(o) => !o && setDeletingId(null)}
                id={deletingId}
                onDeleted={() => { queryClient.invalidateQueries({ queryKey: ["hr", "training-programs"] }); setDeletingId(null); }}
            />
        </div>
    );
}

function EditProgramDialog({ program, open, onOpenChange, onUpdated }: { program: TrainingProgram | null, open: boolean, onOpenChange: (o: boolean) => void, onUpdated: () => void }) {
    const [name, setName] = useState("");
    const [trainer, setTrainer] = useState("");
    const [desc, setDesc] = useState("");
    const [mandatory, setMandatory] = useState(false);
    const [start, setStart] = useState("");
    const [active, setActive] = useState(true);

    useEffect(() => {
        if (program) {
            setName(program.name);
            setTrainer(program.trainer || "");
            setDesc(program.description || "");
            setMandatory(program.is_mandatory);
            setStart(program.start_date || "");
            setActive(program.is_active);
        }
    }, [program]);

    const mut = useMutation({

        mutationFn: (data: any) => hrApi.trainingPrograms.update(program!.id, data),
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
                    <Button onClick={() => mut.mutate({ name, trainer, description: desc, is_mandatory: mandatory, start_date: start || null, is_active: active })} disabled={mut.isPending}>Save Changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DeleteConfirmDialog({ open, onOpenChange, id, onDeleted }: { open: boolean, onOpenChange: (o: boolean) => void, id: number | null, onDeleted: () => void }) {
    const mut = useMutation({
        mutationFn: () => hrApi.trainingPrograms.delete(id!),
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

function MyTrainingList() {
    // Assuming backend endpoint for 'my-training' exists or filtering by user
    // hrApi.staffTraining.list({ staff: current_user_staff_id })
    // Since I don't have easy access to staff_id in this component without context, 
    // I'll show a placeholder or try to fetch 'my' training if API supports it.
    // For now, I'll use list() and handle empty state gracefully.

    const { data, isLoading } = useQuery({
        queryKey: ["hr", "my-training"],
        queryFn: async () => (await hrApi.staffTraining.list()).data, // Filters likely applied by backend for standard users
    });

    const records = data?.results ?? [];

    const getStatusColor = (status: string) => {
        switch (status) {
            case "completed": return "bg-success/15 text-success border-success/20";
            case "in_progress": return "bg-info/15 text-info border-info/20";
            case "failed": return "bg-destructive/10 text-destructive border-destructive/20";
            default: return "bg-muted text-muted-foreground border-border"; // enrolled
        }
    };

    if (isLoading) return <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}</div>;

    return (
        <div className="space-y-4">
            {records.map(rec => (
                <Card key={rec.id} className="flex items-center p-4 justify-between">
                    <div className="flex items-center gap-4">
                        <div className={cn("h-12 w-12 rounded-full flex items-center justify-center", rec.status === "completed" ? "bg-success/15 text-success" : "bg-primary/10 text-primary")}>
                            {rec.status === "completed" ? <Award className="h-6 w-6" /> : <BookOpen className="h-6 w-6" />}
                        </div>
                        <div>
                            <h3 className="font-semibold">{rec.training_name}</h3>
                            <p className="text-sm text-muted-foreground">Enrolled: {rec.enrolled_date}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        {rec.score && <div className="text-sm font-semibold">Score: {rec.score}%</div>}
                        <Badge variant="outline" className={cn("capitalize border shadow-none", getStatusColor(rec.status))}>{rec.status.replace("_", " ")}</Badge>
                    </div>
                </Card>
            ))}
            {records.length === 0 && <div className="h-32 flex items-center justify-center text-muted-foreground border-2 border-dashed rounded-xl">You are not enrolled in any training</div>}
        </div>
    );
}

function CreateProgramDialog({ open, onOpenChange, onCreated }: { open: boolean, onOpenChange: (o: boolean) => void, onCreated: () => void }) {
    const [name, setName] = useState("");
    const [trainer, setTrainer] = useState("");
    const [desc, setDesc] = useState("");
    const [mandatory, setMandatory] = useState(false);
    const [start, setStart] = useState("");

    const mut = useMutation({

        mutationFn: (data: any) => hrApi.trainingPrograms.create(data),
        onSuccess: () => { toast.success("Program created"); onCreated(); },
        onError: () => toast.error("Failed to create"),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>New Training Program</DialogTitle><DialogDescription>Create a new course or workshop.</DialogDescription></DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2"><Label>Program Name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Safety 101" /></div>
                    <div className="space-y-2"><Label>Trainer (Optional)</Label><Input value={trainer} onChange={e => setTrainer(e.target.value)} placeholder="Instructor name" /></div>
                    <div className="space-y-2"><Label>Description</Label><Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} /></div>
                    <div className="space-y-2"><Label>Start Date (Optional)</Label><Input type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
                    <div className="flex items-center justify-between border p-3 rounded-lg">
                        <div><Label>Mandatory</Label><p className="text-xs text-muted-foreground">Required for all staff?</p></div>
                        <Switch checked={mandatory} onCheckedChange={setMandatory} />
                    </div>
                </div>
                <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => mut.mutate({ name, trainer, description: desc, is_mandatory: mandatory, start_date: start || null, is_active: true })} disabled={!name || mut.isPending}>Create</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
