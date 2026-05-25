"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { hrApi, Applicant, Interview } from "@/lib/api/hr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Calendar, Phone, Mail, User, Briefcase, Clock, MapPin, Video, CheckCircle, XCircle, ArrowRight, Pencil, Trash2 } from "lucide-react";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { useParams, useRouter } from "next/navigation";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { cn } from "@/lib/utils/cn";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useState, useEffect } from "react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Separator } from "@/components/ui/separator";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";

export default function ApplicantPage() {
    return (
        <PermissionPageGuard permission="view_recruitment">
            <ApplicantDetailContent />
        </PermissionPageGuard>
    );
}

function ApplicantDetailContent() {
    const params = useParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const id = Number(params.id);
    const [showSchedule, setShowSchedule] = useState(false);
    const [showEdit, setShowEdit] = useState(false);
    const [showDelete, setShowDelete] = useState(false);

    const { data: applicant, isLoading } = useQuery({
        queryKey: ["hr", "applicant", id],
        queryFn: async () => (await hrApi.applicants.get(id)).data,
    });

    const moveStageMutation = useMutation({
        mutationFn: (status: string) => hrApi.applicants.moveToStage(id, status),
        onSuccess: () => { toast.success("Stage updated"); queryClient.invalidateQueries({ queryKey: ["hr", "applicant", id] }); },
    });

    const hireMutation = useMutation({
        mutationFn: () => hrApi.applicants.hire(id),
        onSuccess: () => { toast.success("Applicant hired!"); queryClient.invalidateQueries({ queryKey: ["hr", "applicant", id] }); },
        onError: () => toast.error("Failed to hire applicant"),
    });

    if (isLoading) return <div className="p-8"><div className="h-64 bg-muted rounded animate-pulse" /></div>;
    if (!applicant) return <div className="p-8">Applicant not found</div>;

    return (
        <div className="space-y-4">
            <DynamicPageTitle title={applicant.full_name} />
            <StaffPageHeader
                title={applicant.full_name}
                breadcrumbs={[{ label: "Recruitment", href: "/hr/recruitment" }, { label: "Applicants", href: "/hr/recruitment?tab=applicants" }, { label: applicant.full_name }]}
                actions={
                    <PermissionGuard permission="manage_recruitment">
                        <div className="flex gap-2">
                            <Select value={applicant.status} onValueChange={(val) => moveStageMutation.mutate(val)}>
                                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Move Stage" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="new">New</SelectItem>
                                    <SelectItem value="screening">Screening</SelectItem>
                                    <SelectItem value="interview">Interview</SelectItem>
                                    <SelectItem value="offered">Offered</SelectItem>
                                    <SelectItem value="rejected">Rejected</SelectItem>
                                </SelectContent>
                            </Select>
                            {applicant.status === "offered" && <Button onClick={() => hireMutation.mutate()} className="bg-green-600 hover:bg-green-700">Hire Applicant</Button>}
                            <Button variant="outline" onClick={() => setShowSchedule(true)}><Calendar className="h-4 w-4 mr-2" />Schedule Interview</Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-9 w-9 p-0 border"><MoreHorizontal className="h-4 w-4" /></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => setShowEdit(true)}><Pencil className="h-4 w-4 mr-2" />Edit Applicant</DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-destructive" onClick={() => setShowDelete(true)}><Trash2 className="h-4 w-4 mr-2" />Delete Applicant</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </PermissionGuard>
                }
            />

            <div className="grid grid-cols-3 gap-4">
                <Card className="col-span-1">
                    <CardHeader><CardTitle>Contact Info</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /> <a href={`mailto:${applicant.email}`} className="text-sm underline">{applicant.email}</a></div>
                        <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> <span className="text-sm">{applicant.phone}</span></div>
                        <div className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-muted-foreground" /> <span className="text-sm"> Applied for <strong>{applicant.job_title}</strong></span></div>
                        <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" /> <span className="text-sm"> Applied on {applicant.applied_date}</span></div>
                    </CardContent>
                </Card>

                <Card className="col-span-2">
                    <CardHeader className="flex flex-row items-center justify-between"><CardTitle>Interviews</CardTitle></CardHeader>
                    <CardContent>
                        {applicant.interviews && applicant.interviews.length > 0 ? (
                            <div className="space-y-4">
                                {applicant.interviews.map(int => (
                                    <div key={int.id} className="flex items-center justify-between border p-3 rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded bg-info/10 flex items-center justify-center text-primary font-bold">
                                                {new Date(int.scheduled_at).getDate()}
                                            </div>
                                            <div>
                                                <div className="font-medium">{int.interview_type} Interview</div>
                                                <div className="text-xs text-muted-foreground">{new Date(int.scheduled_at).toLocaleTimeString()} • {int.duration_minutes} mins</div>
                                            </div>
                                        </div>
                                        <Badge variant="outline" className="capitalize">{int.status}</Badge>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-muted-foreground text-sm">No interviews scheduled yet</div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <ScheduleInterviewDialog open={showSchedule} onOpenChange={setShowSchedule} applicantId={applicant.id} onScheduled={() => { queryClient.invalidateQueries({ queryKey: ["hr", "applicant", id] }); setShowSchedule(false); }} />

            <EditApplicantDialog
                applicant={applicant}
                open={showEdit}
                onOpenChange={setShowEdit}
                onUpdated={() => { queryClient.invalidateQueries({ queryKey: ["hr", "applicant", id] }); setShowEdit(false); }}
            />

            <DeleteConfirmDialog
                open={showDelete}
                onOpenChange={setShowDelete}
                id={applicant.id}
                onDeleted={() => { router.push("/hr/recruitment?tab=applicants"); }}
            />
        </div>
    );
}

function EditApplicantDialog({ applicant, open, onOpenChange, onUpdated }: { applicant: Applicant, open: boolean, onOpenChange: (o: boolean) => void, onUpdated: () => void }) {
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [status, setStatus] = useState("");

    useEffect(() => {
        if (applicant) {
            setFirstName(applicant.first_name);
            setLastName(applicant.last_name);
            setEmail(applicant.email);
            setPhone(applicant.phone);
            setStatus(applicant.status);
        }
    }, [applicant]);

    const mut = useMutation({

        mutationFn: (data: any) => hrApi.applicants.update(applicant.id, data),
        onSuccess: () => { toast.success("Applicant updated"); onUpdated(); },
        onError: () => toast.error("Failed to update applicant"),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Edit Applicant</DialogTitle></DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>First Name</Label><Input value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
                        <div className="space-y-2"><Label>Last Name</Label><Input value={lastName} onChange={e => setLastName(e.target.value)} /></div>
                    </div>
                    <div className="space-y-2"><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Phone</Label><Input value={phone} onChange={e => setPhone(e.target.value)} /></div>
                    <div className="space-y-2">
                        <Label>Status</Label>
                        <Select value={status} onValueChange={setStatus}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="new">New</SelectItem>
                                <SelectItem value="screening">Screening</SelectItem>
                                <SelectItem value="interview">Interview</SelectItem>
                                <SelectItem value="offered">Offered</SelectItem>
                                <SelectItem value="hired">Hired</SelectItem>
                                <SelectItem value="rejected">Rejected</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={() => mut.mutate({ first_name: firstName, last_name: lastName, email, phone, status })} disabled={mut.isPending}>Save Changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DeleteConfirmDialog({ open, onOpenChange, id, onDeleted }: { open: boolean, onOpenChange: (o: boolean) => void, id: number, onDeleted: () => void }) {
    const mut = useMutation({
        mutationFn: () => hrApi.applicants.delete(id),
        onSuccess: () => { toast.success("Applicant deleted"); onDeleted(); },
        onError: () => toast.error("Failed to delete applicant"),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Are you sure?</DialogTitle><DialogDescription>This will permanently delete this applicant record.</DialogDescription></DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button variant="destructive" onClick={() => mut.mutate()} disabled={mut.isPending}>Delete</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ScheduleInterviewDialog({ open, onOpenChange, applicantId, onScheduled }: { open: boolean, onOpenChange: (o: boolean) => void, applicantId: number, onScheduled: () => void }) {
    const [date, setDate] = useState("");
    const [time, setTime] = useState("");
    const [type, setType] = useState("video");
    const [duration, setDuration] = useState("30");

    const mut = useMutation({

        mutationFn: (data: any) => hrApi.interviews.create(data),
        onSuccess: () => { toast.success("Interview scheduled"); onScheduled(); },
        onError: () => toast.error("Failed to schedule"),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Schedule Interview</DialogTitle><DialogDescription>Send an invite to the applicant.</DialogDescription></DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
                        <div className="space-y-2"><Label>Time</Label><Input type="time" value={time} onChange={e => setTime(e.target.value)} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2"><Label>Type</Label><Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="phone">Phone</SelectItem><SelectItem value="video">Video</SelectItem><SelectItem value="in_person">In Person</SelectItem></SelectContent></Select></div>
                        <div className="space-y-2"><Label>Duration (mins)</Label><Input type="number" value={duration} onChange={e => setDuration(e.target.value)} /></div>
                    </div>
                </div>
                <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => mut.mutate({ applicant: applicantId, scheduled_at: `${date}T${time}:00`, interview_type: type, duration_minutes: Number(duration), status: "scheduled" })} disabled={!date || !time || mut.isPending}>{mut.isPending ? "Scheduling..." : "Schedule"}</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
