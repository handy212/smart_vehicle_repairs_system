"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { workordersApi } from "@/lib/api/workorders";
import { workOrderTasksApi } from "@/lib/api/workorder-tasks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/lib/hooks/useToast";
import {
    Play, Pause, CheckCircle, Clock, AlertCircle, Camera,
    FileText, ListTodo, Wrench, ArrowRight
} from "lucide-react";
import { format } from "date-fns";

export default function TechnicianWorkOrderPage() {
    const params = useParams();
    const workOrderId = parseInt(params.id as string);
    const router = useRouter();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState("jobs");

    // Fetch Work Order
    const { data: workOrder, isLoading: woLoading } = useQuery({
        queryKey: ["workorder", workOrderId],
        queryFn: () => workordersApi.get(workOrderId),
    });

    // Fetch Tasks
    const { data: tasks, isLoading: tasksLoading } = useQuery({
        queryKey: ["workorder-tasks", workOrderId],
        queryFn: () => workOrderTasksApi.list({ work_order: workOrderId }),
        enabled: !!workOrderId,
    });

    // Mutations
    const updateStatusMutation = useMutation({
        mutationFn: (action: 'start' | 'pause' | 'complete') => {
            if (action === 'start') return workordersApi.startWork(workOrderId);
            if (action === 'pause') return workordersApi.pause(workOrderId);
            if (action === 'complete') return workordersApi.complete(workOrderId);
            throw new Error("Invalid action");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["workorder", workOrderId] });
            toast({ title: "Status updated", variant: "default" });
        },
        onError: (error: any) => {
            toast({
                title: "Action failed",
                description: error.response?.data?.message || "Could not update status",
                variant: "destructive"
            });
        }
    });

    if (woLoading || !workOrder) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    // Helper to determine status color
    const getStatusColor = (status: string) => {
        switch (status) {
            case "in_progress": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
            case "assigned": return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
            case "paused": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
            case "completed": return "bg-gray-100 text-foreground bg-background/30 text-foreground";
            default: return "bg-gray-100 text-foreground";
        }
    };

    const isWorking = workOrder.status === "in_progress";
    const isPaused = workOrder.status === "paused";
    const isCompleted = workOrder.status === "completed" || workOrder.status === "invoiced";

    return (
        <div className="space-y-6 pb-20">
            {/* Overview Card */}
            <Card className="border-none shadow-md bg-card">
                <CardContent className="p-5">
                    <div className="flex flex-col md:flex-row justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="font-mono text-xs">#{workOrder.work_order_number}</Badge>
                                <Badge className={`${getStatusColor(workOrder.status)} border-none`}>
                                    {workOrder.status.replace("_", " ").toUpperCase()}
                                </Badge>
                            </div>
                            <h2 className="text-xl md:text-2xl font-bold text-foreground">
                                {workOrder.vehicle_info || "Vehicle Info Unavailable"}
                            </h2>
                            <p className="text-muted-foreground mt-1">
                                {workOrder.customer_name}
                            </p>
                        </div>

                        <div className="flex items-center gap-3">
                            {!isCompleted && (
                                <>
                                    {isWorking ? (
                                        <Button
                                            size="lg"
                                            className="bg-warning/100 hover:bg-yellow-600 text-white w-full md:w-auto h-12 text-lg shadow-yellow-200 dark:shadow-none"
                                            onClick={() => updateStatusMutation.mutate('pause')}
                                            disabled={updateStatusMutation.isPending}
                                        >
                                            <Pause className="mr-2 h-5 w-5 md:h-6 md:w-6" />
                                            Pause Job
                                        </Button>
                                    ) : (
                                        <Button
                                            size="lg"
                                            className="bg-success hover:bg-green-700 text-white w-full md:w-auto h-12 text-lg shadow-green-200 dark:shadow-none animate-pulse hover:animate-none"
                                            onClick={() => updateStatusMutation.mutate('start')}
                                            disabled={updateStatusMutation.isPending}
                                        >
                                            <Play className="mr-2 h-5 w-5 md:h-6 md:w-6" />
                                            Start Job
                                        </Button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {workOrder.customer_concerns && (
                        <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-lg">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400 mb-1">Customer Concern</h3>
                            <p className="text-sm text-foreground">{workOrder.customer_concerns}</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Main Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-4 h-12 bg-border p-1 rounded-xl">
                    <TabsTrigger value="jobs" className="rounded-lg data-[state=active]:bg-card dark:data-[state=active]:bg-gray-700 data-[state=active]:shadow-sm">
                        <ListTodo className="h-4 w-4 mr-2" />
                        <span className="hidden sm:inline">Tasks</span>
                    </TabsTrigger>
                    <TabsTrigger value="info" className="rounded-lg data-[state=active]:bg-card dark:data-[state=active]:bg-gray-700 data-[state=active]:shadow-sm">
                        <FileText className="h-4 w-4 mr-2" />
                        <span className="hidden sm:inline">Details</span>
                    </TabsTrigger>
                    <TabsTrigger value="photos" className="rounded-lg data-[state=active]:bg-card dark:data-[state=active]:bg-gray-700 data-[state=active]:shadow-sm">
                        <Camera className="h-4 w-4 mr-2" />
                        <span className="hidden sm:inline">Photos</span>
                    </TabsTrigger>
                    <TabsTrigger value="parts" className="rounded-lg data-[state=active]:bg-card dark:data-[state=active]:bg-gray-700 data-[state=active]:shadow-sm">
                        <Wrench className="h-4 w-4 mr-2" />
                        <span className="hidden sm:inline">Parts</span>
                    </TabsTrigger>
                </TabsList>

                {/* Tasks Tab */}
                <TabsContent value="jobs" className="mt-4 space-y-4">
                    <div className="space-y-3">
                        {tasksLoading ? (
                            <div className="text-center py-8 text-muted-foreground">Loading tasks...</div>
                        ) : tasks && tasks.length > 0 ? (
                            tasks.map((task: any) => (
                                <Card key={task.id} className="border border-border shadow-sm overflow-hidden">
                                    <div className="flex border-l-4 border-primary">
                                        <div className="flex-1 p-4">
                                            <div className="flex justify-between items-start mb-2">
                                                <h3 className="font-semibold text-foreground">{task.name}</h3>
                                                <Badge variant={task.status === "completed" ? "success" : "secondary"}>
                                                    {task.status}
                                                </Badge>
                                            </div>
                                            <p className="text-sm text-muted-foreground">{task.description || "No description provided."}</p>
                                        </div>
                                    </div>
                                </Card>
                            ))
                        ) : (
                            <div className="text-center py-12 bg-muted/50 rounded-lg border border-dashed border-border">
                                <CheckCircle className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                                <h3 className="text-lg font-medium text-foreground">All Caught Up</h3>
                                <p className="text-muted-foreground">No tasks assigned to this work order yet.</p>
                            </div>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="info">
                    <Card>
                        <CardHeader>
                            <CardTitle>Job Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <h4 className="font-semibold text-sm text-muted-foreground uppercase">Special Instructions</h4>
                                <p className="mt-1">{workOrder.special_instructions || "None"}</p>
                            </div>
                            <div>
                                <h4 className="font-semibold text-sm text-muted-foreground uppercase">Vehicle Info</h4>
                                <p className="mt-1">{workOrder.vehicle_info}</p>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
                {/* Photos & Parts Placeholder */}
                <TabsContent value="photos">
                    <div className="flex flex-col items-center justify-center py-12 bg-muted/50 rounded-lg border border-dashed">
                        <Camera className="h-12 w-12 text-gray-300 mb-3" />
                        <p className="text-muted-foreground">Photo upload coming soon.</p>
                    </div>
                </TabsContent>
                <TabsContent value="parts">
                    <div className="flex flex-col items-center justify-center py-12 bg-muted/50 rounded-lg border border-dashed">
                        <Wrench className="h-12 w-12 text-gray-300 mb-3" />
                        <p className="text-muted-foreground">Parts list coming soon.</p>
                    </div>
                </TabsContent>
            </Tabs>

            {/* Floating Action Button for Completion */}
            {!isCompleted && (
                <div className="fixed bottom-6 right-6">
                    <Button
                        size="lg"
                        className={`h-14 px-8 rounded-full shadow-lg transition-all ${isWorking
                            ? "bg-primary hover:bg-primary/90 text-white"
                            : "bg-gray-200 text-muted-foreground cursor-not-allowed hidden"
                            }`}
                        onClick={() => {
                            if (confirm("Are you sure you want to complete this job?")) {
                                updateStatusMutation.mutate('complete');
                            }
                        }}
                        disabled={!isWorking}
                    >
                        <CheckCircle className="mr-2 h-5 w-5" />
                        Complete Job
                    </Button>
                </div>
            )}
        </div>
    );
}
