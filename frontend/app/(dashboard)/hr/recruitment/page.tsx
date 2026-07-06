"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { hrApi, JobOpening, Applicant } from "@/lib/api/hr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Plus, Filter, Briefcase, Users, Calendar, ArrowRight, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SortableHeader, SortConfig } from "@/components/ui/sortable-header";
import { sortOrderingParam, toggleSortConfig } from "@/lib/utils/table-sort";

export default function RecruitmentPage() {
    return (
        <PermissionPageGuard permission="view_recruitment">
            <DynamicPageTitle title="Recruitment" />
            <RecruitmentContent />
        </PermissionPageGuard>
    );
}

function RecruitmentContent() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const router = useRouter();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState("openings");

    return (
        <div className="space-y-4">
            <StaffPageHeader
                title="Recruitment"
                breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "HR", href: "/hr" }, { label: "Recruitment" }]}
                actions={
                    <div className="flex gap-2">
                        <PermissionGuard permission="manage_recruitment">
                            <Button asChild>
                                <Link href="/hr/recruitment/new"><Plus className="h-4 w-4 mr-2" />Post Job</Link>
                            </Button>
                        </PermissionGuard>
                    </div>
                }
            />

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList>
                    <TabsTrigger value="openings">Job Openings</TabsTrigger>
                    <TabsTrigger value="applicants">All Applicants</TabsTrigger>
                </TabsList>

                <TabsContent value="openings" className="space-y-4">
                    <JobOpeningsList />
                </TabsContent>

                <TabsContent value="applicants" className="space-y-4">
                    <ApplicantsList />
                </TabsContent>
            </Tabs>
        </div>
    );
}

function JobOpeningsList() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [editingJob, setEditingJob] = useState<JobOpening | null>(null);
    const [deletingJobId, setDeletingJobId] = useState<number | null>(null);

    const { data, isLoading } = useQuery({
        queryKey: ["hr", "job-openings"],
        queryFn: async () => (await hrApi.jobOpenings.list()).data,
    });

    const openings = data?.results ?? [];

    const getStatusColor = (status: string) => {
        switch (status) {
            case "draft": return "bg-gray-100 text-gray-700 border-gray-200";
            case "open": return "bg-success/10 text-green-700 border-green-200";
            case "on_hold": return "bg-warning/10 text-amber-700 border-warning/20";
            case "closed": return "bg-destructive/10 text-destructive border-destructive/20";
            default: return "";
        }
    };

    if (isLoading) return <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />)}</div>;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {openings.map(job => (
                <Card key={job.id} className="relative cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push(`/hr/recruitment/${job.id}`)}>
                    <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                            <div className="pr-6">
                                <CardTitle className="text-lg font-semibold line-clamp-1">{job.title}</CardTitle>
                                <CardDescription className="line-clamp-1">{job.department_name}</CardDescription>
                            </div>
                            <Badge variant="outline" className={cn("capitalize border shadow-none", getStatusColor(job.status))}>{job.status.replace("_", " ")}</Badge>
                        </div>
                        <div className="absolute top-2 right-2" onClick={e => e.stopPropagation()}>
                            <PermissionGuard permission="manage_recruitment">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={`Actions for job ${job.title}`}><MoreHorizontal className="h-4 w-4" /></Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => setEditingJob(job)}>Edit</DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem className="text-destructive" onClick={() => setDeletingJobId(job.id)}>Delete</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </PermissionGuard>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="flex justify-between items-center text-sm text-muted-foreground mt-2">
                            <div className="flex items-center gap-1"><Users className="h-4 w-4" /> {job.applicant_count} Applicants</div>
                            <div className="flex items-center gap-1"><Calendar className="h-4 w-4" /> Posted {job.posted_date || "Not posted"}</div>
                        </div>
                    </CardContent>
                </Card>
            ))}
            <Card className="flex flex-col items-center justify-center border-dashed cursor-pointer hover:bg-muted/50 transition-colors py-12" onClick={() => router.push("/hr/recruitment/new")}>
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-3"><Plus className="h-5 w-5 text-muted-foreground" /></div>
                <p className="font-medium text-muted-foreground">Post New Job</p>
            </Card>

            <EditJobDialog
                job={editingJob}
                open={!!editingJob}
                onOpenChange={(o) => !o && setEditingJob(null)}
                onUpdated={() => { queryClient.invalidateQueries({ queryKey: ["hr", "job-openings"] }); setEditingJob(null); }}
            />

            <DeleteConfirmDialog
                open={!!deletingJobId}
                onOpenChange={(o) => !o && setDeletingJobId(null)}
                type="job"
                id={deletingJobId}
                onDeleted={() => { queryClient.invalidateQueries({ queryKey: ["hr", "job-openings"] }); setDeletingJobId(null); }}
            />
        </div>
    );
}

function EditJobDialog({ job, open, onOpenChange, onUpdated }: { job: JobOpening | null, open: boolean, onOpenChange: (o: boolean) => void, onUpdated: () => void }) {
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
            setDeptId(job.department.toString());
            setType(job.employment_type || "");
            setDesc(job.description || "");
            setReqs(job.requirements || "");
            setStatus(job.status);
        }
    }, [job]);

    const mut = useMutation({

        mutationFn: (data: any) => hrApi.jobOpenings.update(job!.id, data),
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
                                <SelectContent>{depts?.results?.map(d => <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>)}</SelectContent>
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

function DeleteConfirmDialog({ open, onOpenChange, type, id, onDeleted }: { open: boolean, onOpenChange: (o: boolean) => void, type: "job" | "applicant", id: number | null, onDeleted: () => void }) {
    const mut = useMutation({
        mutationFn: () => type === "job" ? hrApi.jobOpenings.delete(id!) : hrApi.applicants.delete(id!),
        onSuccess: () => { toast.success(`${type === "job" ? "Job" : "Applicant"} deleted`); onDeleted(); },
        onError: () => toast.error("Failed to delete"),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Are you sure?</DialogTitle><DialogDescription>This will permanently delete this {type}.</DialogDescription></DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button variant="destructive" onClick={() => mut.mutate()} disabled={mut.isPending}>Delete</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ApplicantsList() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [deletingAppId, setDeletingAppId] = useState<number | null>(null);
    const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

    const handleSort = (field: string) => {
        setSortConfig((current) => toggleSortConfig(current, field));
    };

    const { data, isLoading } = useQuery({
        queryKey: ["hr", "applicants", sortConfig],
        queryFn: async () => (await hrApi.applicants.list({
            ordering: sortOrderingParam(sortConfig) || "-applied_date",
        })).data,
    });

    const applicants = data?.results ?? [];

    const getStatusColor = (status: string) => {
        switch (status) {
            case "new": return "bg-info/10 text-blue-700 border-info/20";
            case "screening": return "bg-purple-50 text-purple-700 border-purple-200";
            case "interview": return "bg-warning/10 text-amber-700 border-warning/20";
            case "offered": return "bg-success/10 text-green-700 border-green-200";
            case "hired": return "bg-success/10 text-emerald-700 border-emerald-200";
            case "rejected": return "bg-destructive/10 text-destructive border-destructive/20";
            default: return "";
        }
    };

    return (
        <Card>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <SortableHeader
                                field="last_name"
                                sortConfig={sortConfig}
                                onSort={handleSort}
                            >
                                Applicant
                            </SortableHeader>
                            <TableHead>Applied For</TableHead>
                            <SortableHeader
                                field="applied_date"
                                sortConfig={sortConfig}
                                onSort={handleSort}
                            >
                                Date
                            </SortableHeader>
                            <SortableHeader
                                field="status"
                                sortConfig={sortConfig}
                                onSort={handleSort}
                            >
                                Status
                            </SortableHeader>
                            <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {applicants.map((app) => (
                            <TableRow key={app.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/hr/recruitment/applicants/${app.id}`)}>
                                <TableCell>
                                    <div className="font-medium">{app.full_name}</div>
                                    <div className="text-xs text-muted-foreground">{app.email}</div>
                                </TableCell>
                                <TableCell>{app.job_title}</TableCell>
                                <TableCell>{app.applied_date}</TableCell>
                                <TableCell><Badge variant="outline" className={cn("capitalize border shadow-none", getStatusColor(app.status))}>{app.status}</Badge></TableCell>
                                <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                                    <PermissionGuard permission="manage_recruitment">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={`Actions for applicant ${app.full_name}`}><MoreHorizontal className="h-4 w-4" /></Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => router.push(`/hr/recruitment/applicants/${app.id}`)}><ArrowRight className="h-4 w-4 mr-2" />Details</DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem className="text-destructive" onClick={() => setDeletingAppId(app.id)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </PermissionGuard>
                                </TableCell>
                            </TableRow>
                        ))}
                        {applicants.length === 0 && <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No applicants found</TableCell></TableRow>}
                    </TableBody>
                </Table>
            </CardContent>
            <DeleteConfirmDialog
                open={!!deletingAppId}
                onOpenChange={(o) => !o && setDeletingAppId(null)}
                type="applicant"
                id={deletingAppId}
                onDeleted={() => { queryClient.invalidateQueries({ queryKey: ["hr", "applicants"] }); setDeletingAppId(null); }}
            />
        </Card>
    );
}
