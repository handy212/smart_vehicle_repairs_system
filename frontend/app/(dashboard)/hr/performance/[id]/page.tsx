"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { hrApi, PerformanceReview } from "@/lib/api/hr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Save, CheckCircle, Send, User, Calendar, MessageSquare, Target, Award, Trash2, MoreHorizontal } from "lucide-react";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { useParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useState, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export default function PerformanceReviewPage() {
    return (
        <PermissionGuard permission="view_performance">
            <ReviewDetailContent />
        </PermissionGuard>
    );
}

function ReviewDetailContent() {
    const params = useParams();
    const queryClient = useQueryClient();
    const id = Number(params.id);
    const router = useRouter();
    const [showDelete, setShowDelete] = useState(false);

    const { data: review, isLoading } = useQuery({
        queryKey: ["hr", "performance-review", id],
        queryFn: async () => (await hrApi.performanceReviews.get(id)).data,
    });

    const updateMutation = useMutation({
        mutationFn: (data: Partial<PerformanceReview>) => hrApi.performanceReviews.update(id, data),
        onSuccess: () => { toast.success("Saved"); queryClient.invalidateQueries({ queryKey: ["hr", "performance-review", id] }); },
        onError: () => toast.error("Failed to save"),
    });

    const submitMutation = useMutation({
        mutationFn: () => hrApi.performanceReviews.submit(id),
        onSuccess: () => { toast.success("Submitted"); queryClient.invalidateQueries({ queryKey: ["hr", "performance-review", id] }); },
    });

    const acknowledgeMutation = useMutation({
        mutationFn: (data: { comments: string }) => hrApi.performanceReviews.acknowledge(id, data.comments),
        onSuccess: () => { toast.success("Acknowledged"); queryClient.invalidateQueries({ queryKey: ["hr", "performance-review", id] }); },
    });

    if (isLoading) return <div className="p-8"><div className="h-64 bg-muted rounded animate-pulse" /></div>;
    if (!review) return <div className="p-8">Review not found</div>;

    return (
        <div className="space-y-4">
            <DynamicPageTitle title={`Review: ${review.staff_name}`} />
            <StaffPageHeader
                title={`Review: ${review.staff_name}`}
                breadcrumbs={[{ label: "Performance", href: "/hr/performance" }, { label: "Review Details" }]}
                actions={
                    <div className="flex gap-2">
                        <Badge variant="outline" className="text-sm px-3 py-1 h-9 flex items-center">{review.status}</Badge>
                        <PermissionGuard permission="manage_performance">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-9 w-9 p-0 border"><MoreHorizontal className="h-4 w-4" /></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem className="text-destructive" onClick={() => setShowDelete(true)}><Trash2 className="h-4 w-4 mr-2" />Delete Review</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </PermissionGuard>
                    </div>
                }
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="md:col-span-1 h-fit">
                    <CardHeader><CardTitle>Review Details</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-3"><User className="h-5 w-5 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Staff</p><p className="font-medium">{review.staff_name}</p></div></div>
                        <div className="flex items-center gap-3"><User className="h-5 w-5 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Reviewer</p><p className="font-medium">{review.reviewer_name}</p></div></div>
                        <div className="flex items-center gap-3"><Calendar className="h-5 w-5 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Period</p><p className="font-medium">{review.review_period_start} to {review.review_period_end}</p></div></div>
                        <Separator />
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Overall Rating</p>
                            <div className="flex items-center gap-2">
                                <div className={cn("text-3xl font-bold", review.overall_rating && review.overall_rating >= 4 ? "text-success" : review.overall_rating && review.overall_rating >= 3 ? "text-warning" : "text-destructive")}>{review.overall_rating || "-"}</div>
                                <span className="text-muted-foreground">/ 5</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="md:col-span-2">
                    <CardHeader><CardTitle>Assessment</CardTitle><CardDescription>Feedback, goals, and comments.</CardDescription></CardHeader>
                    <CardContent>
                        <ReviewForm review={review} onUpdate={(d) => updateMutation.mutate(d)} onSubmit={() => submitMutation.mutate()} onAcknowledge={(c) => acknowledgeMutation.mutate({ comments: c })} isUpdating={updateMutation.isPending || submitMutation.isPending || acknowledgeMutation.isPending} />
                    </CardContent>
                </Card>
            </div>

            <DeleteConfirmDialog open={showDelete} onOpenChange={setShowDelete} id={review.id} onDeleted={() => { router.push("/hr/performance"); }} />
        </div>
    );
}

function DeleteConfirmDialog({ open, onOpenChange, id, onDeleted }: { open: boolean, onOpenChange: (o: boolean) => void, id: number, onDeleted: () => void }) {
    const mut = useMutation({
        mutationFn: () => hrApi.performanceReviews.delete(id),
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


function ReviewForm({ review, onUpdate, onSubmit, onAcknowledge, isUpdating }: { review: PerformanceReview, onUpdate: (d: any) => void, onSubmit: () => void, onAcknowledge: (c: string) => void, isUpdating: boolean }) {
    const [strengths, setStrengths] = useState(review.strengths || "");
    const [improvements, setImprovements] = useState(review.areas_for_improvement || "");
    const [goals, setGoals] = useState(review.goals || "");
    const [rating, setRating] = useState(review.overall_rating?.toString() || "");
    const [empComments, setEmpComments] = useState(review.staff_comments || "");

    const isDraft = review.status === "draft";
    const isSubmitted = review.status === "submitted";
    const isAcknowledged = review.status === "acknowledged";

    const hasChanges = strengths !== (review.strengths || "") || improvements !== (review.areas_for_improvement || "") || goals !== (review.goals || "") || rating !== (review.overall_rating?.toString() || "");

    const handleSave = () => {
        onUpdate({ strengths, areas_for_improvement: improvements, goals, overall_rating: rating ? Number(rating) : null });
    };

    return (
        <div className="space-y-6">
            {/* Reviewer Section */}
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label className="flex items-center gap-2"><Award className="h-4 w-4" /> Strengths</Label>
                    <Textarea value={strengths} onChange={e => setStrengths(e.target.value)} disabled={!isDraft} placeholder="Highlight key achievements and strengths..." rows={4} />
                </div>
                <div className="space-y-2">
                    <Label className="flex items-center gap-2"><Target className="h-4 w-4" /> Areas for Improvement</Label>
                    <Textarea value={improvements} onChange={e => setImprovements(e.target.value)} disabled={!isDraft} placeholder="Identify areas for growth..." rows={4} />
                </div>
                <div className="space-y-2">
                    <Label className="flex items-center gap-2"><Target className="h-4 w-4" /> Goals for Next Period</Label>
                    <Textarea value={goals} onChange={e => setGoals(e.target.value)} disabled={!isDraft} placeholder="Set SMART goals..." rows={4} />
                </div>
                <div className="space-y-2 w-1/3">
                    <Label>Overall Rating (1-5)</Label>
                    <Select value={rating} onValueChange={setRating} disabled={!isDraft}>
                        <SelectTrigger><SelectValue placeholder="Rate" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1">1 - Needs Improvement</SelectItem>
                            <SelectItem value="2">2 - Below Expectations</SelectItem>
                            <SelectItem value="3">3 - Meets Expectations</SelectItem>
                            <SelectItem value="4">4 - Exceeds Expectations</SelectItem>
                            <SelectItem value="5">5 - Outstanding</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {isDraft && (
                    <div className="flex gap-2 pt-4">
                        <Button onClick={handleSave} disabled={isUpdating || !hasChanges}><Save className="h-4 w-4 mr-2" /> Save Draft</Button>
                        <Button onClick={onSubmit} disabled={isUpdating || !review.overall_rating} variant="outline"><Send className="h-4 w-4 mr-2" /> Submit Review</Button>
                    </div>
                )}
            </div>

            {(isSubmitted || isAcknowledged) && <Separator />}

            {/* Staff Section */}
            {(isSubmitted || isAcknowledged) && (
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Staff Comments</Label>
                        <Textarea value={empComments} onChange={e => setEmpComments(e.target.value)} disabled={isAcknowledged} placeholder="Add your comments..." rows={3} />
                    </div>

                    {isSubmitted && (
                        <div className="flex gap-2 pt-2">
                            <Button onClick={() => onAcknowledge(empComments)} disabled={isUpdating} className="bg-green-600 hover:bg-green-700"><CheckCircle className="h-4 w-4 mr-2" /> Acknowledge Review</Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
