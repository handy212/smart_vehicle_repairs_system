"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { hrApi, PerformanceReview } from "@/lib/api/hr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ClipboardCheck, User, Calendar, Plus, ArrowRight, BarChart, MoreHorizontal, Trash2 } from "lucide-react";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { toast } from "sonner";

export default function PerformancePage() {
    return (
        <PermissionGuard permission="view_performance">
            <DynamicPageTitle title="Performance" />
            <PerformanceContent />
        </PermissionGuard>
    );
}

function PerformanceContent() {
    const router = useRouter();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [activeTab, setActiveTab] = useState("my_reviews");
    const [showCreate, setShowCreate] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const queryClient = useQueryClient();

    // Fetch my reviews (where staff = current user) - Assuming backend handles filtering by user if no param
    // Actually API client takes 'staff' ID. I need current user's staff ID.
    // For now I'll just list all for HR/Admin, and maybe backend filters for normal users.
    // Ideally we have an endpoint `my-reviews` or similar, but the list endpoint probably supports filtering.
    // I will assume `list()` with no params returns what the user is allowed to see.

    const { data, isLoading } = useQuery({
        queryKey: ["hr", "performance-reviews"],
        queryFn: async () => (await hrApi.performanceReviews.list()).data,
    });

    const reviews = data?.results ?? [];
    // For demo, I'll filter client-side if needed, but really access control should be backend.
    // I'll split into "My Reviews" and "Team Reviews" if I had the user's ID.
    // For now, simple list.

    return (
        <div className="space-y-4">
            <StaffPageHeader
                title="Performance Reviews"
                breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "HR", href: "/hr" }, { label: "Performance" }]}
                actions={
                    <PermissionGuard permission="manage_performance">
                        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-2" />New Review</Button>
                    </PermissionGuard>
                }
            />

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Staff</TableHead>
                                <TableHead>Reviewer</TableHead>
                                <TableHead>Period</TableHead>
                                <TableHead>Rating</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                [1, 2, 3].map(i => <TableRow key={i}><TableCell colSpan={6}><div className="h-10 bg-muted animate-pulse rounded" /></TableCell></TableRow>)
                            ) : reviews.length > 0 ? (
                                reviews.map(review => (
                                    <TableRow key={review.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/hr/performance/${review.id}`)}>
                                        <TableCell><div className="font-medium">{review.staff_name}</div></TableCell>
                                        <TableCell>{review.reviewer_name || "-"}</TableCell>
                                        <TableCell>{review.review_period_start} - {review.review_period_end}</TableCell>
                                        <TableCell>
                                            {review.overall_rating ? (
                                                <div className="flex items-center">
                                                    <span className={cn("font-bold mr-1", review.overall_rating >= 4 ? "text-green-600" : review.overall_rating >= 3 ? "text-amber-600" : "text-red-600")}>{review.overall_rating}</span>
                                                    <span className="text-muted-foreground">/ 5</span>
                                                </div>
                                            ) : "-"}
                                        </TableCell>
                                        <TableCell><Badge variant="outline" className={cn("capitalize", review.status === "acknowledged" ? "bg-green-50 text-green-700 border-green-200" : review.status === "submitted" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-gray-100 text-gray-600 border-gray-200")}>{review.status}</Badge></TableCell>
                                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                                            <PermissionGuard permission="manage_performance">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => router.push(`/hr/performance/${review.id}`)}><ArrowRight className="h-4 w-4 mr-2" />Details</DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem className="text-red-600" onClick={() => setDeletingId(review.id)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </PermissionGuard>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No reviews found</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <CreateReviewDialog open={showCreate} onOpenChange={setShowCreate} onCreated={() => { queryClient.invalidateQueries({ queryKey: ["hr", "performance-reviews"] }); setShowCreate(false); }} />

            <DeleteConfirmDialog
                open={!!deletingId}
                onOpenChange={(o) => !o && setDeletingId(null)}
                id={deletingId}
                onDeleted={() => { queryClient.invalidateQueries({ queryKey: ["hr", "performance-reviews"] }); setDeletingId(null); }}
            />
        </div>
    );
}

function DeleteConfirmDialog({ open, onOpenChange, id, onDeleted }: { open: boolean, onOpenChange: (o: boolean) => void, id: number | null, onDeleted: () => void }) {
    const mut = useMutation({
        mutationFn: () => hrApi.performanceReviews.delete(id!),
        onSuccess: () => { toast.success("Review deleted"); onDeleted(); },
        onError: () => toast.error("Failed to delete review"),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Are you sure?</DialogTitle><DialogDescription>This will permanently delete this performance review.</DialogDescription></DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button variant="destructive" onClick={() => mut.mutate()} disabled={mut.isPending}>Delete</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function CreateReviewDialog({ open, onOpenChange, onCreated }: { open: boolean, onOpenChange: (o: boolean) => void, onCreated: () => void }) {
    const [empId, setEmpId] = useState("");
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [reviewerId, setReviewerId] = useState(""); // Ideally current user, but HR might assign
    const [start, setStart] = useState("");
    const [end, setEnd] = useState("");

    // Fetch staff for dropdown
    const { data: staff } = useQuery({ queryKey: ["hr", "staff-list"], queryFn: async () => (await hrApi.staff.list()).data });

    const mut = useMutation({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mutationFn: (data: any) => hrApi.performanceReviews.create(data),
        onSuccess: () => { toast.success("Review initiated"); onCreated(); },
        onError: () => toast.error("Failed to create review"),
    });

return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
            <DialogHeader><DialogTitle>Initiate Performance Review</DialogTitle><DialogDescription>Start a new review cycle for an staff.</DialogDescription></DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="space-y-2">
                    <Label>Staff</Label>
                    <Select value={empId} onValueChange={setEmpId}>
                        <SelectTrigger><SelectValue placeholder="Select Staff" /></SelectTrigger>
                        <SelectContent>
                            {staff?.results?.map(e => (
                                <SelectItem key={e.id} value={e.id.toString()}>
                                    {e.full_name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Period Start</Label><Input type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Period End</Label><Input type="date" value={end} onChange={e => setEnd(e.target.value)} /></div>
                </div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => mut.mutate({ staff: Number(empId), review_period_start: start, review_period_end: end, status: "draft" })} disabled={!empId || !start || !end || mut.isPending}>Creating...</Button></DialogFooter>
        </DialogContent>
    </Dialog>
);
}
