"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { hrApi, JobOpening, Applicant } from "@/lib/api/hr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Users, Calendar, Briefcase, Plus, MoreHorizontal, ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { useParams, useRouter } from "next/navigation";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { cn } from "@/lib/utils/cn";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/lib/toast";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import Link from "next/link";
import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function JobOpeningDetailPage() {
    return (
        <PermissionPageGuard permission="view_recruitment">
            <JobOpeningDetailContent />
        </PermissionPageGuard>
    );
}

function JobOpeningDetailContent() {
    const params = useParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const id = Number(params.id);
    const [showAddApplicant, setShowAddApplicant] = useState(false);
    const [showEdit, setShowEdit] = useState(false);
    const [showDelete, setShowDelete] = useState(false);

    const { data: job, isLoading: loadingJob } = useQuery({
        queryKey: ["hr", "job-opening", id],
        queryFn: async () => (await hrApi.jobOpenings.get(id)).data,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { data: applicantsData, isLoading: loadingApplicants } = useQuery({
        queryKey: ["hr", "applicants", { job_opening: id }],
        queryFn: async () => (await hrApi.applicants.list({ job_opening: id })).data,
    });

    const publishMutation = useMutation({
        mutationFn: () => hrApi.jobOpenings.publish(id),
        onSuccess: () => { toast.success("Job published"); queryClient.invalidateQueries({ queryKey: ["hr", "job-opening", id] }); },
    });

    const closeMutation = useMutation({
        mutationFn: () => hrApi.jobOpenings.close(id),
        onSuccess: () => { toast.success("Job closed"); queryClient.invalidateQueries({ queryKey: ["hr", "job-opening", id] }); },
    });

    if (loadingJob) return <div className="p-8 space-y-4"><div className="h-12 w-1/3 bg-muted rounded animate-pulse" /><div className="h-64 bg-muted rounded animate-pulse" /></div>;
    if (!job) return <div className="p-8">Job not found</div>;

    const applicants = applicantsData?.results ?? [];

    return (
        <div className="space-y-4">
            <DynamicPageTitle title={job.title} />
            <StaffPageHeader
                title={job.title}
                breadcrumbs={[{ label: "Recruitment", href: "/hr/recruitment" }, { label: job.title }]}
                actions={
                    <div className="flex gap-2">
                        <PermissionGuard permission="manage_recruitment">
                            {job.status === "draft" && <Button onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending}><CheckCircle2 className="h-4 w-4 mr-2" />Publish</Button>}
                            {job.status === "open" && <Button variant="destructive" onClick={() => closeMutation.mutate()} disabled={closeMutation.isPending}><XCircle className="h-4 w-4 mr-2" />Close Job</Button>}
                            <Button onClick={() => setShowAddApplicant(true)}><Plus className="h-4 w-4 mr-2" />Add Applicant</Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-9 w-9 p-0 border"><MoreHorizontal className="h-4 w-4" /></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => setShowEdit(true)}><Pencil className="h-4 w-4 mr-2" />Edit Job</DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-destructive" onClick={() => setShowDelete(true)}><Trash2 className="h-4 w-4 mr-2" />Delete Job</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </PermissionGuard>
                    </div>
                }
            />

            <div className="grid grid-cols-3 gap-4">
                <Card className="col-span-2 space-y-4 p-4">
                    <div><h3 className="font-semibold mb-1">Description</h3><p className="text-sm text-muted-foreground whitespace-pre-wrap">{job.description}</p></div>
                    <div><h3 className="font-semibold mb-1">Requirements</h3><p className="text-sm text-muted-foreground whitespace-pre-wrap">{job.requirements}</p></div>
                </Card>
                <div className="space-y-4">
                    <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Details</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between"><span>Department</span><span className="font-medium">{job.department_name}</span></div>
                        <div className="flex justify-between"><span>Employment Type</span><span className="font-medium capitalize">{job.employment_type?.replace("_", " ")}</span></div>
                        <div className="flex justify-between"><span>Status</span><Badge variant="outline" className="capitalize">{job.status}</Badge></div>
                        <div className="flex justify-between"><span>Posted</span><span>{job.posted_date || "-"}</span></div>
                    </CardContent></Card>
                </div>
            </div>

            <Card>
                <CardHeader><CardTitle>Applicants ({applicants.length})</CardTitle></CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Status</TableHead><TableHead>Applied</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {applicants.map(app => (
                                <TableRow key={app.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/hr/recruitment/applicants/${app.id}`)}>
                                    <TableCell><div className="font-medium">{app.full_name}</div><div className="text-xs text-muted-foreground">{app.email}</div></TableCell>
                                    <TableCell><Badge variant="outline" className="capitalize">{app.status}</Badge></TableCell>
                                    <TableCell>{app.applied_date}</TableCell>
                                    <TableCell className="text-right"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 rotate-180" /></Button></TableCell>
                                </TableRow>
                            ))}
                            {applicants.length === 0 && <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No applicants yet</TableCell></TableRow>}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <AddApplicantDialog open={showAddApplicant} onOpenChange={setShowAddApplicant} jobId={job.id} onAdded={() => { queryClient.invalidateQueries({ queryKey: ["hr", "applicants"] }); setShowAddApplicant(false); }} />

            <EditJobDialog
                job={job}
                open={showEdit}
                onOpenChange={setShowEdit}
                onUpdated={() => { queryClient.invalidateQueries({ queryKey: ["hr", "job-opening", id] }); setShowEdit(false); }}
            />

            <DeleteConfirmDialog
                open={showDelete}
                onOpenChange={setShowDelete}
                id={job.id}
                onDeleted={() => router.push("/hr/recruitment")}
            />
        </div>
    );
}

function EditJobDialog({ job, open, onOpenChange, onUpdated }: { job: JobOpening, open: boolean, onOpenChange: (o: boolean) => void, onUpdated: () => void }) {
    const [title, setTitle] = useState("");
    const [deptId, setDeptId] = useState("");
    const [type, setType] = useState("");
    const [desc, setDesc] = useState("");
    const [reqs, setReqs] = useState("");
    const [status, setStatus] = useState("");

    const { data: depts } = useQuery({ queryKey: ["hr", "departments"], queryFn: async () => (await hrApi.departments.list()).data });

    useEffect(() => {
        if (job) {
            setTitle(job.title);
            setDeptId(job.department?.toString() || "");
            setType(job.employment_type || "");
            setDesc(job.description || "");
            setReqs(job.requirements || "");
            setStatus(job.status);
        }
    }, [job]);

    const mut = useMutation({

        mutationFn: (data: any) => hrApi.jobOpenings.update(job.id, data),
        onSuccess: () => { toast.success("Job updated"); onUpdated(); },
        onError: () => toast.error("Failed to update job"),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle>Edit Job Opening</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Job Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} /></div>
                        <div className="space-y-2">
                            <Label>Department</Label>
                            <Select value={deptId} onValueChange={setDeptId}>
                                <SelectTrigger><SelectValue /></SelectTrigger>

                                <SelectContent>{depts?.results?.map((d: any) => <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Employment Type</Label>
                            <Select value={type} onValueChange={setType}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="full_time">Full Time</SelectItem>
                                    <SelectItem value="part_time">Part Time</SelectItem>
                                    <SelectItem value="contract">Contract</SelectItem>
                                    <SelectItem value="internship">Internship</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Status</Label>
                            <Select value={status} onValueChange={setStatus}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="draft">Draft</SelectItem>
                                    <SelectItem value="open">Open</SelectItem>
                                    <SelectItem value="on_hold">On Hold</SelectItem>
                                    <SelectItem value="closed">Closed</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-2"><Label>Description</Label><Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={4} /></div>
                    <div className="space-y-2"><Label>Requirements</Label><Textarea value={reqs} onChange={e => setReqs(e.target.value)} rows={4} /></div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={() => mut.mutate({ title, department: Number(deptId), employment_type: type, description: desc, requirements: reqs, status })} disabled={mut.isPending}>Save Changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DeleteConfirmDialog({ open, onOpenChange, id, onDeleted }: { open: boolean, onOpenChange: (o: boolean) => void, id: number, onDeleted: () => void }) {
    const mut = useMutation({
        mutationFn: () => hrApi.jobOpenings.delete(id),
        onSuccess: () => { toast.success("Job deleted"); onDeleted(); },
        onError: () => toast.error("Failed to delete job"),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Are you sure?</DialogTitle><DialogDescription>This will permanently delete this job opening and all associated data.</DialogDescription></DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button variant="destructive" onClick={() => mut.mutate()} disabled={mut.isPending}>Delete</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function AddApplicantDialog({ open, onOpenChange, jobId, onAdded }: { open: boolean, onOpenChange: (o: boolean) => void, jobId: number, onAdded: () => void }) {
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");

    const mut = useMutation({

        mutationFn: (data: any) => hrApi.applicants.create(data),
        onSuccess: () => { toast.success("Applicant added"); onAdded(); setFirstName(""); setLastName(""); setEmail(""); setPhone(""); },
        onError: () => toast.error("Failed to add applicant"),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Add Applicant</DialogTitle><DialogDescription>Manually add an applicant to this job.</DialogDescription></DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>First Name</Label><Input value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
                        <div className="space-y-2"><Label>Last Name</Label><Input value={lastName} onChange={e => setLastName(e.target.value)} /></div>
                    </div>
                    <div className="space-y-2"><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Phone</Label><Input value={phone} onChange={e => setPhone(e.target.value)} /></div>
                </div>
                <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => mut.mutate({ job_opening: jobId, first_name: firstName, last_name: lastName, email, phone, status: "new", source: "manual" })} disabled={!firstName || !lastName || !email || mut.isPending}>{mut.isPending ? "Adding..." : "Add Applicant"}</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
