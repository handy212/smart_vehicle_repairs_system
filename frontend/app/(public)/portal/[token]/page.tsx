"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { workordersApi } from "@/lib/api/workorders";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Loader2, CheckCircle2, XCircle, AlertCircle, Calendar, DollarSign, Car } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";

import { useCurrency } from "@/lib/hooks/useCurrency";
export default function PortalPage() {
    const { formatCurrency } = useCurrency();
    const params = useParams();
    const token = params.token as string;
    const { toast } = useToast();


    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [processing, setProcessing] = useState(false);
    const [approveNotes, setApproveNotes] = useState("");
    const [declineReason, setDeclineReason] = useState("");
    const [showDeclineInput, setShowDeclineInput] = useState(false);

    useEffect(() => {
        if (!token) return;

        const fetchData = async () => {
            try {
                setLoading(true);
                const result = await workordersApi.public.get(token);
                setData(result);

            } catch (err: any) {
                console.error(err);
                setError("Unable to load work order details. The link may be invalid or expired.");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [token]);

    const handleApprove = async () => {
        if (!confirm("Are you sure you want to approve this estimate?")) return;

        try {
            setProcessing(true);
            await workordersApi.public.approve(token, { notes: approveNotes });
            toast({
                title: "Estimate Approved",
                description: "Thank you! We have received your approval and will proceed with the work.",
                variant: "default", // or success if available
            });
            // specific success logic - maybe reload data
            const result = await workordersApi.public.get(token);
            setData(result);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (err) {
            toast({
                title: "Error",
                description: "Failed to process approval. Please try again.",
                variant: "destructive",
            });
        } finally {
            setProcessing(false);
        }
    };

    const handleDecline = async () => {
        if (!declineReason) {
            toast({ title: "Reason Required", description: "Please provide a reason for declining.", variant: "destructive" });
            return;
        }

        if (!confirm("Are you sure you want to decline this work?")) return;

        try {
            setProcessing(true);
            await workordersApi.public.decline(token, { reason: declineReason });
            toast({
                title: "Work Declined",
                description: "We have noted your decision.",
                variant: "default",
            });
            // reload
            const result = await workordersApi.public.get(token);
            setData(result);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (err) {
            toast({
                title: "Error",
                description: "Failed to process request.",
                variant: "destructive",
            });
        } finally {
            setProcessing(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh]">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">Loading work order details...</p>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center max-w-md mx-auto">
                <div className="bg-red-100 p-4 rounded-full mb-4">
                    <XCircle className="h-10 w-10 text-red-600" />
                </div>
                <h1 className="text-2xl font-bold text-foreground mb-2">Access Denied</h1>
                <p className="text-muted-foreground">{error || "Work order not found."}</p>
                <Button className="mt-6" variant="outline" asChild>
                    <a href="/portal">Back to Portal Home</a>
                    {/* If we had a home, forcing refresh usually clears issues contextually */}
                </Button>
            </div>
        );
    }

    const { vehicle_info, work_order_number, status, estimated_total, recommendations, approved_jobs } = data;
    const isApproved = status === 'approved' || status === 'in_progress' || status === 'completed';
    const isPending = status === 'awaiting_approval';

    return (
        <div className="space-y-8 animate-in fade-in duration-500">

            {/* Header / Status Banner */}
            <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-center bg-card p-6 rounded-xl border border-border shadow-sm">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-2xl font-bold text-foreground">Work Order #{work_order_number}</h1>
                        <Badge variant={isApproved ? "default" : isPending ? "secondary" : "outline"} className="text-sm px-3 py-1 capitalize">
                            {status.replace('_', ' ')}
                        </Badge>
                    </div>
                    <div className="flex items-center text-muted-foreground gap-2">
                        <Car className="h-4 w-4" />
                        <span>{vehicle_info}</span>
                    </div>
                </div>
                <div className="flex flex-col items-end">
                    <div className="text-sm text-muted-foreground mb-1">Estimated Total</div>
                    <div className="text-3xl font-bold text-foreground">
                        {formatCurrency(parseFloat(estimated_total))}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Left Column: Details */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Recommendations / Pending Work */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <AlertCircle className="h-5 w-5 text-amber-500" />
                                Recommended Services
                            </CardTitle>
                            <CardDescription>
                                Review the recommended services for your vehicle.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {recommendations && recommendations.length > 0 ? (

                                recommendations.map((rec: any) => (
                                    <div key={rec.id} className="flex flex-col sm:flex-row justify-between p-4 bg-muted rounded-lg border border-border">
                                        <div className="mb-2 sm:mb-0">
                                            <h3 className="font-semibold text-foreground">{rec.name}</h3>
                                            <p className="text-sm text-muted-foreground mt-1">{rec.description || "No description provided."}</p>
                                        </div>
                                        <div className="text-right">
                                            <span className="font-medium block">{formatCurrency(parseFloat(rec.estimated_cost || 0))}</span>
                                            <Badge variant="outline" className="mt-1 text-xs">Pending</Badge>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-muted-foreground italic text-center py-4">No pending recommendations.</p>
                            )}
                        </CardContent>
                    </Card>

                    {/* Approved / Completed Work */}
                    {approved_jobs && approved_jobs.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                                    Approved Services
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">

                                {approved_jobs.map((job: any) => (
                                    <div key={job.id} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                                        <span className="text-foreground">{job.name}</span>
                                        <Badge variant="secondary" className="capitalize">{job.status}</Badge>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}

                </div>

                {/* Right Column: Actions */}
                <div className="space-y-6">

                    <Card className="sticky top-24 border-orange-100 shadow-md">
                        <CardHeader className="bg-primary/5 pb-4">
                            <CardTitle className="text-lg">Action Required</CardTitle>
                            <CardDescription>Please review the estimate above.</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-4">

                            {isApproved ? (
                                <div className="bg-success/10 text-green-800 p-4 rounded-lg flex items-start gap-3">
                                    <CheckCircle2 className="h-5 w-5 mt-0.5" />
                                    <div>
                                        <p className="font-medium">You have approved this work.</p>
                                        <p className="text-sm mt-1">Our technicians will begin shortly. You will be notified when the work is complete.</p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-foreground">Approval Notes (Optional)</label>
                                        <Textarea
                                            placeholder="Any special instructions or questions..."
                                            value={approveNotes}
                                            onChange={(e) => setApproveNotes(e.target.value)}
                                            className="resize-none"
                                        />
                                    </div>

                                    <Button
                                        className="w-full bg-primary hover:bg-primary/90 h-11 text-base group"
                                        onClick={handleApprove}
                                        disabled={processing}
                                    >
                                        {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform" />}
                                        Approve Estimate
                                    </Button>

                                    {!showDeclineInput ? (
                                        <Button
                                            variant="ghost"
                                            className="w-full text-muted-foreground hover:text-red-600 hover:bg-red-50"
                                            onClick={() => setShowDeclineInput(true)}
                                            disabled={processing}
                                        >
                                            Decline Work
                                        </Button>
                                    ) : (
                                        <div className="bg-red-50 p-4 rounded-lg space-y-3 mt-4 animate-in slide-in-from-top-2">
                                            <label className="text-sm font-medium text-red-800">Reason for declining</label>
                                            <Textarea
                                                placeholder="Please tell us why..."
                                                value={declineReason}
                                                onChange={(e) => setDeclineReason(e.target.value)}
                                                className="bg-card border-red-200 focus-visible:ring-red-500"
                                            />
                                            <div className="flex gap-2">
                                                <Button
                                                    variant="destructive"
                                                    size="sm"
                                                    className="flex-1"
                                                    onClick={handleDecline}
                                                    disabled={processing}
                                                >
                                                    Confirm Decline
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setShowDeclineInput(false)}
                                                    disabled={processing}
                                                >
                                                    Cancel
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            <Separator className="my-4" />

                            <div className="text-xs text-muted-foreground text-center">
                                <p>Digital approval is secure and binding.</p>
                                <p>Questions? Call us at (555) 123-4567</p>
                            </div>

                        </CardContent>
                    </Card>

                </div>
            </div>
        </div>
    );
}
