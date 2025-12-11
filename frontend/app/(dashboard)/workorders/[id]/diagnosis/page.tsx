"use client";

import { useState } from "react";
import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { diagnosisApi, Diagnosis, DiagnosticCode, DiagnosticTest, DiagnosisPhoto } from "@/lib/api/diagnosis";
import { workordersApi } from "@/lib/api/workorders";
import { inventoryApi } from "@/lib/api/inventory";
import { billingApi } from "@/lib/api/billing";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { computeGhanaTaxBreakdown } from "@/lib/utils/tax";
import { useToast } from "@/lib/hooks/useToast";
import {
  ArrowLeft,
  AlertCircle,
  CheckCircle,
  Clock,
  DollarSign,
  Edit,
  Plus,
  Wrench,
  FileText,
  Settings,
  ListChecks,
  MessageSquare,
  Code,
  TestTube,
  Camera,
  Trash2,
  X,
  Search,
  RefreshCw,
  Receipt,
  Package,
  Play,
  Pause,
  PlayCircle,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { CodesTab } from "./components/CodesTab";

export default function DiagnosisPage() {
  const params = useParams();
  const router = useRouter();
  const workOrderId = parseInt(params.id as string);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("complaint");
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [pauseReason, setPauseReason] = useState("");

  // Fetch work order
  const { data: workOrder } = useQuery({
    queryKey: ["workorder", workOrderId],
    queryFn: () => workordersApi.get(workOrderId),
  });

  // Fetch or create diagnosis
  const { data: diagnosis, isLoading, error: diagnosisError } = useQuery({
    queryKey: ["diagnosis", "workorder", workOrderId],
    queryFn: async () => {
      try {
        console.log("Fetching diagnosis for work order:", workOrderId);
        let existing = await diagnosisApi.getByWorkOrder(workOrderId);
        console.log("Existing diagnosis:", existing);
        
        if (!existing && workOrder) {
          // Auto-create diagnosis if it doesn't exist
          console.log("No diagnosis found, creating new one...");
          try {
            existing = await diagnosisApi.create({
              work_order: workOrderId,
              customer_complaint: workOrder.customer_concerns || "",
            });
            console.log("Diagnosis created:", existing);
          } catch (error: any) {
            console.error("Failed to create diagnosis:", error);
            console.error("Error details:", error.response?.data || error.message);
            throw error;
          }
        }
        
        // If diagnosis exists but has no customer_complaint, update it from work order
        if (existing && !existing.customer_complaint && workOrder?.customer_concerns) {
          try {
            existing = await diagnosisApi.update(existing.id, {
              customer_complaint: workOrder.customer_concerns,
            });
          } catch (error: any) {
            console.error("Failed to update customer complaint:", error);
          }
        }
        
        return existing;
      } catch (error: any) {
        console.error("Error in diagnosis query:", error);
        console.error("Error response:", error.response?.data);
        console.error("Error status:", error.response?.status);
        throw error;
      }
    },
    enabled: !!workOrderId && !!workOrder,
    retry: 1,
    retryDelay: 1000,
  });

  // Get counts from diagnosis object (nested arrays included in detail serializer)
  const codesCount = Array.isArray(diagnosis?.diagnostic_codes) ? diagnosis.diagnostic_codes.length : 0;
  const testsCount = Array.isArray(diagnosis?.diagnostic_tests) ? diagnosis.diagnostic_tests.length : 0;
  const photosCount = Array.isArray(diagnosis?.photos) ? diagnosis.photos.length : 0;
  const recommendationsCount = Array.isArray(diagnosis?.repair_recommendations) ? diagnosis.repair_recommendations.length : 0;

  const updateDiagnosisMutation = useMutation({
    mutationFn: (data: Partial<Diagnosis>) => {
      if (!diagnosis) throw new Error("Diagnosis not found");
      return diagnosisApi.update(diagnosis.id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
      toast({ title: "Diagnosis updated", variant: "default" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update diagnosis",
        description: error.response?.data?.message || error.message,
        variant: "destructive",
      });
    },
  });

  // Workflow transition mutations
  const startDiagnosisMutation = useMutation({
    mutationFn: () => {
      if (!diagnosis) throw new Error("Diagnosis not found");
      return diagnosisApi.start(diagnosis.id);
    },
    onSuccess: () => {
      toast({ 
        title: "Diagnosis started", 
        description: "Diagnosis workflow has been started.",
        variant: "default" 
      });
      queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to start diagnosis",
        description: error.response?.data?.error || error.response?.data?.message || error.message,
        variant: "destructive",
      });
    },
  });

  const pauseDiagnosisMutation = useMutation({
    mutationFn: (reason?: string) => {
      if (!diagnosis) throw new Error("Diagnosis not found");
      return diagnosisApi.pause(diagnosis.id, reason);
    },
    onSuccess: () => {
      toast({ 
        title: "Diagnosis paused", 
        description: "Diagnosis has been paused. Time has been logged.",
        variant: "default" 
      });
      queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to pause diagnosis",
        description: error.response?.data?.error || error.response?.data?.message || error.message,
        variant: "destructive",
      });
    },
  });

  const resumeDiagnosisMutation = useMutation({
    mutationFn: () => {
      if (!diagnosis) throw new Error("Diagnosis not found");
      return diagnosisApi.resume(diagnosis.id);
    },
    onSuccess: () => {
      toast({ 
        title: "Diagnosis resumed", 
        description: "Diagnosis has been resumed. Time tracking continues.",
        variant: "default" 
      });
      queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to resume diagnosis",
        description: error.response?.data?.error || error.response?.data?.message || error.message,
        variant: "destructive",
      });
    },
  });

  const completeDiagnosisMutation = useMutation({
    mutationFn: () => {
      if (!diagnosis) throw new Error("Diagnosis not found");
      // Pass requires_approval from diagnosis if available
      return diagnosisApi.complete(diagnosis.id, diagnosis.requires_approval);
    },
    onSuccess: (response) => {
      const workOrderUpdate = response.work_order;
      let message = "Diagnosis completed successfully.";
      
      if (workOrderUpdate) {
        if (workOrderUpdate.requires_approval) {
          message += ` Work order is now awaiting customer approval.`;
        } else {
          message += ` Work order has been approved and ready to proceed.`;
        }
      }
      
      toast({ 
        title: "Diagnosis completed", 
        description: message,
        variant: "default" 
      });
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
      queryClient.invalidateQueries({ queryKey: ["workorder", workOrderId] });
      queryClient.invalidateQueries({ queryKey: ["diagnosis"] });
      
      // Redirect to work order page to see updated status
      router.push(`/workorders/${workOrderId}`);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to complete diagnosis",
        description: error.response?.data?.error || error.response?.data?.message || error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!workOrder) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Card>
          <CardContent className="pt-6">
            <p className="text-red-600">Error loading work order. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (diagnosisError) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <p className="text-red-600 font-semibold">Error loading diagnosis</p>
              <p className="text-sm text-gray-600">
                {(diagnosisError as any)?.response?.data?.detail ||
                  (diagnosisError as any)?.message ||
                  "Please try again or contact support."}
              </p>
              <Button
                variant="secondary"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] })}
                className="mt-4"
              >
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!diagnosis) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Card>
          <CardContent className="pt-6">
            <p className="text-gray-600">No diagnosis found. This should be created automatically.</p>
            <Button
              variant="secondary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] })}
              className="mt-4"
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Block actions if diagnosis hasn't been started yet (timesheet integrity)
  // Check if diagnosis is active for editing (only while in progress)
  const diagnosisActive = diagnosis.status === "in_progress";

  // Get status color and icon
  const getStatusConfig = (status: string) => {
    switch (status) {
      case "not_started":
        return { color: "secondary", icon: Clock, label: "Not Started" };
      case "in_progress":
        return { color: "info", icon: PlayCircle, label: "In Progress" };
      case "paused":
        return { color: "warning", icon: Pause, label: "Paused" };
      case "completed":
        return { color: "default", icon: CheckCircle2, label: "Completed" };
      case "on_hold":
        return { color: "secondary", icon: Clock, label: "On Hold" };
      default:
        return { color: "secondary", icon: Clock, label: status };
    }
  };

  const statusConfig = getStatusConfig(diagnosis.status);
  const StatusIcon = statusConfig.icon;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center space-x-4 flex-1">
          <Link href={`/workorders/${workOrderId}`}>
            <Button variant="secondary" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Work Order
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Diagnosis</h1>
            <p className="text-sm text-gray-500">
              Work Order #{workOrder.work_order_number}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2 flex-wrap">
          {/* Workflow Action Buttons */}
          {diagnosis.status === "not_started" && (
            <Button
              onClick={() => startDiagnosisMutation.mutate()}
              disabled={startDiagnosisMutation.isPending}
              size="sm"
              variant="default"
            >
              <Play className="w-4 h-4 mr-2" />
              {startDiagnosisMutation.isPending ? "Starting..." : "Start Diagnosis"}
            </Button>
          )}
          {diagnosis.status === "in_progress" && (
            <>
              <Button
                onClick={() => setShowPauseDialog(true)}
                disabled={pauseDiagnosisMutation.isPending}
                size="sm"
                variant="secondary"
              >
                <Pause className="w-4 h-4 mr-2" />
                Pause
              </Button>
              <Button
                onClick={() => completeDiagnosisMutation.mutate()}
                disabled={completeDiagnosisMutation.isPending}
                size="sm"
                variant="default"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {completeDiagnosisMutation.isPending ? "Completing..." : "Complete"}
              </Button>
            </>
          )}
          {diagnosis.status === "paused" && (
            <>
              <Button
                onClick={() => resumeDiagnosisMutation.mutate()}
                disabled={resumeDiagnosisMutation.isPending}
                size="sm"
                variant="default"
              >
                <PlayCircle className="w-4 h-4 mr-2" />
                {resumeDiagnosisMutation.isPending ? "Resuming..." : "Resume"}
              </Button>
              <Button
                onClick={() => completeDiagnosisMutation.mutate()}
                disabled={completeDiagnosisMutation.isPending}
                size="sm"
                variant="default"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {completeDiagnosisMutation.isPending ? "Completing..." : "Complete"}
              </Button>
            </>
          )}
          {diagnosis.status === "completed" && (
            <Badge variant="default" className="text-sm px-3 py-1">
              <CheckCircle2 className="w-4 h-4 mr-1" />
              Completed
            </Badge>
          )}
        </div>
      </div>

      {/* Workflow Status & Info */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center space-x-3">
              <Badge
                variant={statusConfig.color as any}
                className="text-sm px-3 py-1"
              >
                <StatusIcon className="w-4 h-4 mr-1" />
                {statusConfig.label}
              </Badge>
              {diagnosis.technician_name && (
                <span className="text-sm text-gray-500">
                  Technician: {diagnosis.technician_name}
                </span>
              )}
              {diagnosis.diagnostic_time_formatted && (
                <span className="text-sm text-gray-500">
                  Time: {diagnosis.diagnostic_time_formatted}
                </span>
              )}
            </div>
            {/* Workflow Stages Indicator */}
            <div className="flex items-center space-x-2 text-xs text-gray-500">
              <div className={`flex items-center ${diagnosis.status === "not_started" || diagnosis.status === "in_progress" || diagnosis.status === "paused" || diagnosis.status === "completed" ? "text-blue-600 font-medium" : ""}`}>
                <div className={`w-2 h-2 rounded-full mr-1 ${diagnosis.status !== "not_started" ? "bg-blue-600" : "bg-gray-300"}`} />
                Start
              </div>
              <div className="w-4 h-px bg-gray-300" />
              <div className={`flex items-center ${diagnosis.status === "in_progress" || diagnosis.status === "paused" || diagnosis.status === "completed" ? "text-blue-600 font-medium" : ""}`}>
                <div className={`w-2 h-2 rounded-full mr-1 ${diagnosis.status === "in_progress" || diagnosis.status === "paused" || diagnosis.status === "completed" ? "bg-blue-600" : "bg-gray-300"}`} />
                In Progress
              </div>
              <div className="w-4 h-px bg-gray-300" />
              <div className={`flex items-center ${diagnosis.status === "paused" ? "text-orange-600 font-medium" : diagnosis.status === "completed" ? "text-blue-600 font-medium" : ""}`}>
                <div className={`w-2 h-2 rounded-full mr-1 ${diagnosis.status === "paused" ? "bg-orange-600" : diagnosis.status === "completed" ? "bg-blue-600" : "bg-gray-300"}`} />
                Paused
              </div>
              <div className="w-4 h-px bg-gray-300" />
              <div className={`flex items-center ${diagnosis.status === "completed" ? "text-green-600 font-medium" : ""}`}>
                <div className={`w-2 h-2 rounded-full mr-1 ${diagnosis.status === "completed" ? "bg-green-600" : "bg-gray-300"}`} />
                Completed
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pause Dialog */}
      <Dialog open={showPauseDialog} onOpenChange={setShowPauseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pause Diagnosis</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="pause-reason">Reason for pausing (optional)</Label>
              <Textarea
                id="pause-reason"
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                placeholder="e.g., Waiting for parts, Customer needs to approve, etc."
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setShowPauseDialog(false);
                setPauseReason("");
              }}
              disabled={pauseDiagnosisMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                pauseDiagnosisMutation.mutate(pauseReason || undefined);
                setShowPauseDialog(false);
                setPauseReason("");
              }}
              disabled={pauseDiagnosisMutation.isPending}
            >
              {pauseDiagnosisMutation.isPending ? "Pausing..." : "Pause Diagnosis"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <Code className="w-5 h-5 text-blue-600" />
          <div>
            <div className="text-2xl font-bold text-blue-900">{codesCount}</div>
            <div className="text-xs text-blue-700">Codes</div>
          </div>
        </div>
        <div className="flex items-center gap-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
          <TestTube className="w-5 h-5 text-purple-600" />
          <div>
            <div className="text-2xl font-bold text-purple-900">{testsCount}</div>
            <div className="text-xs text-purple-700">Tests</div>
          </div>
        </div>
        <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
          <Camera className="w-5 h-5 text-orange-600" />
          <div>
            <div className="text-2xl font-bold text-orange-900">{photosCount}</div>
            <div className="text-xs text-orange-700">Photos</div>
          </div>
        </div>
        <div className="flex items-center gap-2 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
          <Wrench className="w-5 h-5 text-indigo-600" />
          <div>
            <div className="text-2xl font-bold text-indigo-900">{recommendationsCount}</div>
            <div className="text-xs text-indigo-700">Recommendations</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-8 h-auto p-1">
          <TabsTrigger value="complaint" className="text-xs">
            <MessageSquare className="w-3 h-3 mr-1.5" />
            Complaint
          </TabsTrigger>
          <TabsTrigger value="codes" className="text-xs">
            <Code className="w-3 h-3 mr-1.5" />
            Codes <span className="ml-1">({codesCount})</span>
          </TabsTrigger>
          <TabsTrigger value="tests" className="text-xs">
            <TestTube className="w-3 h-3 mr-1.5" />
            Tests <span className="ml-1">({testsCount})</span>
          </TabsTrigger>
          <TabsTrigger value="photos" className="text-xs">
            <Camera className="w-3 h-3 mr-1.5" />
            Photos <span className="ml-1">({photosCount})</span>
          </TabsTrigger>
          <TabsTrigger value="parts" className="text-xs">
            <Package className="w-3 h-3 mr-1.5" />
            Estimate
          </TabsTrigger>
          <TabsTrigger value="recommendations" className="text-xs">
            <Wrench className="w-3 h-3 mr-1.5" />
            Recs <span className="ml-1">({recommendationsCount})</span>
          </TabsTrigger>
          <TabsTrigger value="summary" className="text-xs">
            <FileText className="w-3 h-3 mr-1.5" />
            Summary
          </TabsTrigger>
        </TabsList>

        {/* Complaint Tab */}
        <TabsContent value="complaint" className="mt-6">
          <ComplaintTab
            diagnosis={diagnosis}
            workOrder={workOrder}
            onUpdate={(data) => updateDiagnosisMutation.mutate(data)}
            isUpdating={updateDiagnosisMutation.isPending}
            isDisabled={!diagnosisActive}
          />
        </TabsContent>

        {/* Codes Tab */}
        <TabsContent value="codes" className="mt-6">
          <CodesTab
            diagnosisId={diagnosis.id}
            onRefresh={() => {
              queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
            }}
            isDisabled={!diagnosisActive}
          />
        </TabsContent>

        {/* Tests Tab */}
        <TabsContent value="tests" className="mt-6">
          <TestsTab
            diagnosisId={diagnosis.id}
            onRefresh={() => {
              queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
            }}
            isDisabled={!diagnosisActive}
          />
        </TabsContent>

        {/* Photos Tab */}
        <TabsContent value="photos" className="mt-6">
          <PhotosTab
            diagnosisId={diagnosis.id}
            onRefresh={() => {
              queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
            }}
            isDisabled={!diagnosisActive}
          />
        </TabsContent>

        {/* Parts Tab */}
        <TabsContent value="parts" className="mt-6">
          <PartsTab
            diagnosis={diagnosis}
            workOrder={workOrder}
            onRefresh={() => {
              queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
              queryClient.invalidateQueries({ queryKey: ["workorder", workOrderId] });
            }}
            isDisabled={!diagnosisActive}
          />
        </TabsContent>

        {/* Recommendations Tab */}
        <TabsContent value="recommendations" className="mt-6">
          <RecommendationsTab
            diagnosis={diagnosis}
            workOrderId={workOrderId}
            onRefresh={() => {
              queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
            }}
            isDisabled={!diagnosisActive}
          />
        </TabsContent>

        {/* Summary Tab */}
        <TabsContent value="summary" className="mt-6">
          <SummaryTab 
            diagnosis={diagnosis} 
            workOrder={workOrder}
            onUpdate={(data) => updateDiagnosisMutation.mutate(data)}
            isUpdating={updateDiagnosisMutation.isPending}
            isDisabled={!diagnosisActive}
          />
        </TabsContent>
      </Tabs>

      {/* Timesheet Summary - At Bottom */}
      {diagnosis.time_logs && diagnosis.time_logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <Clock className="w-5 h-5 mr-2" />
              Timesheet
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {diagnosis.time_logs.map((log: any, index: number) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-md border"
                >
                  <div className="flex items-center space-x-3">
                    <Badge variant="secondary" className="text-xs">
                      {log.stage_display || log.stage}
                    </Badge>
                    <span className="text-sm text-gray-600">
                      {format(new Date(log.started_at), "MMM dd, yyyy h:mm a")}
                    </span>
                    {log.ended_at && (
                      <>
                        <span className="text-gray-400">→</span>
                        <span className="text-sm text-gray-600">
                          {format(new Date(log.ended_at), "MMM dd, yyyy h:mm a")}
                        </span>
                      </>
                    )}
                    {log.technician_name && (
                      <span className="text-xs text-gray-500">
                        by {log.technician_name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    {log.duration_formatted && (
                      <Badge variant="secondary" className="text-xs">
                        {log.duration_formatted}
                      </Badge>
                    )}
                    {log.notes && (
                      <span className="text-xs text-gray-500 italic">
                        {log.notes}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Complaint Tab Component
function ComplaintTab({
  diagnosis,
  workOrder,
  onUpdate,
  isUpdating,
  isDisabled = false,
}: {
  diagnosis: Diagnosis;
  workOrder: any;
  onUpdate: (data: Partial<Diagnosis>) => void;
  isUpdating: boolean;
  isDisabled?: boolean;
}) {
  // Use work order customer_concerns if diagnosis complaint is empty
  const initialComplaint = diagnosis.customer_complaint || workOrder?.customer_concerns || "";
  const [customerComplaint, setCustomerComplaint] = useState(initialComplaint);
  const [initialObservations, setInitialObservations] = useState(diagnosis.initial_observations || "");

  // Update when diagnosis or work order changes
  React.useEffect(() => {
    const newComplaint = diagnosis.customer_complaint || workOrder?.customer_concerns || "";
    if (newComplaint && !customerComplaint) {
      setCustomerComplaint(newComplaint);
    }
  }, [diagnosis.customer_complaint, workOrder?.customer_concerns]);

  const handleSave = () => {
    onUpdate({
      customer_complaint: customerComplaint,
      initial_observations: initialObservations,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Customer Complaint</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            className="min-h-32"
            value={customerComplaint}
            onChange={(e) => setCustomerComplaint(e.target.value)}
            placeholder="What the customer reported..."
            disabled={isDisabled}
          />
          <Button onClick={handleSave} disabled={isUpdating || isDisabled} size="sm" className="w-full">
            {isUpdating ? "Saving..." : "Save"}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Initial Observations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            className="min-h-32"
            value={initialObservations}
            onChange={(e) => setInitialObservations(e.target.value)}
            placeholder="Visual observations during intake..."
            disabled={isDisabled}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// Tests Tab Component
function TestsTab({
  diagnosisId,
  onRefresh,
  isDisabled = false,
}: {
  diagnosisId: number;
  onRefresh: () => void;
  isDisabled?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingTest, setEditingTest] = useState<DiagnosticTest | null>(null);

  const { data: tests = [], isLoading, error } = useQuery({
    queryKey: ["diagnosis-tests", diagnosisId],
    queryFn: () => diagnosisApi.tests.list({ diagnosis: diagnosisId }),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<DiagnosticTest>) => diagnosisApi.tests.create(diagnosisId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diagnosis-tests", diagnosisId] });
      onRefresh();
      setShowAddDialog(false);
      toast({ title: "Test added", variant: "default" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add test",
        description: error.response?.data?.message || error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<DiagnosticTest> }) =>
      diagnosisApi.tests.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diagnosis-tests", diagnosisId] });
      onRefresh();
      setEditingTest(null);
      toast({ title: "Test updated", variant: "default" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update test",
        description: error.response?.data?.message || error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => diagnosisApi.tests.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diagnosis-tests", diagnosisId] });
      onRefresh();
      toast({ title: "Test deleted", variant: "default" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete test",
        description: error.response?.data?.message || error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-lg">Diagnostic Tests</CardTitle>
          <Button onClick={() => setShowAddDialog(true)} size="sm" disabled={isDisabled}>
            <Plus className="w-4 h-4 mr-2" />
            Add Test
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-600 text-center py-8">
              Failed to load tests. Please try again.
            </p>
          ) : tests.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <TestTube className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <p className="text-sm">No tests recorded yet.</p>
              <Button onClick={() => setShowAddDialog(true)} variant="secondary" size="sm" className="mt-4" disabled={isDisabled}>
                <Plus className="w-4 h-4 mr-2" />
                Add First Test
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {tests.map((test) => (
                <div
                  key={test.id}
                  className="p-3 border rounded-lg hover:shadow-sm transition-shadow space-y-2"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{test.test_name}</p>
                      <p className="text-xs text-gray-500">{test.category_display || test.category}</p>
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      <Badge
                        variant={
                          test.status === "pass"
                            ? "default"
                            : test.status === "fail"
                            ? "danger"
                            : "secondary"
                        }
                        className="text-xs"
                      >
                        {test.status_display || test.status}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setEditingTest(test)}
                        disabled={isDisabled}
                      >
                        <Edit className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => {
                          if (confirm("Delete this test?")) {
                            deleteMutation.mutate(test.id);
                          }
                        }}
                        disabled={isDisabled}
                      >
                        <Trash2 className="w-3 h-3 text-red-500" />
                      </Button>
                    </div>
                  </div>
                  {test.test_procedure && (
                    <p className="text-xs text-gray-600 line-clamp-1">{test.test_procedure}</p>
                  )}
                  {test.actual_result && (
                    <p className="text-xs text-gray-700 line-clamp-2">{test.actual_result}</p>
                  )}
                  {test.performed_at && (
                    <p className="text-xs text-gray-500">
                      {format(new Date(test.performed_at), "MMM d, yyyy HH:mm")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <TestDialog
        open={showAddDialog || editingTest !== null}
        onOpenChange={(open) => {
          if (!open) {
            setShowAddDialog(false);
            setEditingTest(null);
          }
        }}
        test={editingTest}
        onSave={(data) => {
          if (editingTest) {
            updateMutation.mutate({ id: editingTest.id, data });
          } else {
            createMutation.mutate(data);
          }
        }}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </>
  );
}

// Test Dialog Component with Template Selection
function TestDialog({
  open,
  onOpenChange,
  test,
  onSave,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  test: DiagnosticTest | null;
  onSave: (data: Partial<DiagnosticTest>) => void;
  isLoading: boolean;
}) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    test_name: test?.test_name || "",
    category: test?.category || "electrical",
    test_procedure: test?.test_procedure || "",
    expected_result: test?.expected_result || "",
    actual_result: test?.actual_result || "",
    measurements: test?.measurements || {},
    tools_used: test?.tools_used || "",
    status: test?.status || "pass",
  });
  const [templateSearchQuery, setTemplateSearchQuery] = useState("");
  const [templateResults, setTemplateResults] = useState<any[]>([]);
  const [isSearchingTemplates, setIsSearchingTemplates] = useState(false);

  React.useEffect(() => {
    if (test) {
      setFormData({
        test_name: test.test_name || "",
        category: test.category || "electrical",
        test_procedure: test.test_procedure || "",
        expected_result: test.expected_result || "",
        actual_result: test.actual_result || "",
        measurements: test.measurements || {},
        tools_used: test.tools_used || "",
        status: test.status || "pass",
      });
      setTemplateResults([]);
    } else {
      setFormData({
        test_name: "",
        category: "electrical",
        test_procedure: "",
        expected_result: "",
        actual_result: "",
        measurements: {},
        tools_used: "",
        status: "pass",
      });
      setTemplateResults([]);
    }
  }, [test]);

  // Search templates when name or category changes
  React.useEffect(() => {
    if (open && !test && (formData.test_name.length >= 2 || templateSearchQuery.length >= 2)) {
      const searchTimer = setTimeout(async () => {
        setIsSearchingTemplates(true);
        try {
          const query = templateSearchQuery || formData.test_name;
          const results = await diagnosisApi.testProcedureLibrary.search(query, formData.category);
          setTemplateResults(results.slice(0, 5)); // Show top 5 results
        } catch (error) {
          setTemplateResults([]);
        } finally {
          setIsSearchingTemplates(false);
        }
      }, 500); // Debounce 500ms

      return () => clearTimeout(searchTimer);
    } else {
      setTemplateResults([]);
    }
  }, [formData.test_name, formData.category, templateSearchQuery, open, test]);

  const handleSelectTemplate = async (template: any) => {
    try {
      // Mark template as used
      await diagnosisApi.testProcedureLibrary.use(template.id);
      
      // Populate form with template data
      setFormData({
        test_name: template.name || formData.test_name,
        category: template.category || formData.category,
        test_procedure: template.test_procedure || "",
        expected_result: template.expected_result || "",
        actual_result: formData.actual_result || "",
        measurements: template.measurement_fields || {},
        tools_used: template.tools_needed || "",
        status: formData.status || "pass",
      });
      setTemplateResults([]);
      toast({
        title: "Template loaded",
        description: `Loaded procedure: ${template.name}`,
        variant: "default",
      });
    } catch (error: any) {
      toast({
        title: "Failed to load template",
        description: error.response?.data?.error || "Could not load template",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...formData,
      performed_at: test?.performed_at || new Date().toISOString(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{test ? "Edit Diagnostic Test" : "Add Diagnostic Test"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="px-6 pb-6">
          <div className="space-y-6">
            {/* Template Selection */}
            {!test && (
              <div className="border rounded-lg p-4 bg-blue-50/50">
                <Label className="text-sm font-medium mb-2 block">Search Templates</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      placeholder="Search test procedure templates..."
                      value={templateSearchQuery || formData.test_name}
                      onChange={(e) => {
                        setTemplateSearchQuery(e.target.value);
                        if (!templateSearchQuery) {
                          setFormData({ ...formData, test_name: e.target.value });
                        }
                      }}
                      className="pl-8"
                    />
                  </div>
                </div>
                {templateResults.length > 0 && (
                  <div className="mt-2 border rounded-lg bg-white max-h-48 overflow-y-auto">
                    <div className="p-2 text-xs font-medium text-gray-600 border-b">
                      Matching templates from library:
                    </div>
                    {templateResults.map((template: any) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => handleSelectTemplate(template)}
                        className="w-full text-left p-2 hover:bg-blue-50 border-b last:border-b-0 transition-colors"
                      >
                        <div className="font-semibold text-sm">{template.name}</div>
                        <div className="text-xs text-gray-600 line-clamp-1">
                          {template.description || template.test_procedure}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Category: {template.category_display || template.category}
                          {template.tools_needed && ` • Tools: ${template.tools_needed}`}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="test_name">Test Name *</Label>
                <Input
                  id="test_name"
                  value={formData.test_name}
                  onChange={(e) => setFormData({ ...formData, test_name: e.target.value })}
                  placeholder="e.g., Battery Voltage Test"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select
                  id="category"
                  value={formData.category}
                  onChange={(e) => {
                    setFormData({ ...formData, category: e.target.value as any });
                    setTemplateResults([]);
                  }}
                  required
                >
                  <option value="electrical">Electrical</option>
                  <option value="mechanical">Mechanical</option>
                  <option value="performance">Performance</option>
                  <option value="fluid">Fluid</option>
                  <option value="pressure">Pressure</option>
                  <option value="temperature">Temperature</option>
                  <option value="visual">Visual</option>
                  <option value="road_test">Road Test</option>
                  <option value="other">Other</option>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="test_procedure">Test Procedure</Label>
              <Textarea
                id="test_procedure"
                value={formData.test_procedure}
                onChange={(e) => setFormData({ ...formData, test_procedure: e.target.value })}
                placeholder="Step-by-step procedure..."
                rows={4}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="expected_result">Expected Result</Label>
                <Textarea
                  id="expected_result"
                  value={formData.expected_result}
                  onChange={(e) => setFormData({ ...formData, expected_result: e.target.value })}
                  placeholder="What should happen..."
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="actual_result">Actual Result</Label>
                <Textarea
                  id="actual_result"
                  value={formData.actual_result}
                  onChange={(e) => setFormData({ ...formData, actual_result: e.target.value })}
                  placeholder="What actually happened..."
                  rows={2}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tools_used">Tools Used</Label>
                <Input
                  id="tools_used"
                  value={formData.tools_used}
                  onChange={(e) => setFormData({ ...formData, tools_used: e.target.value })}
                  placeholder="e.g., Multimeter, Scanner"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status *</Label>
                <Select
                  id="status"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  required
                >
                  <option value="pass">Pass</option>
                  <option value="fail">Fail</option>
                  <option value="inconclusive">Inconclusive</option>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : test ? "Update Test" : "Add Test"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Recommendations Tab Component
function RecommendationsTab({
  diagnosis,
  workOrderId,
  onRefresh,
  isDisabled = false,
}: {
  diagnosis: Diagnosis;
  workOrderId: number;
  onRefresh: () => void;
  isDisabled?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingRecommendation, setEditingRecommendation] = useState<any>(null);
  const [selectedRecommendations, setSelectedRecommendations] = useState<Set<number>>(new Set());
  
  // Load line items from localStorage to check for linked items
  const [lineItems, setLineItems] = React.useState<any[]>([]);
  React.useEffect(() => {
    const loadLineItems = () => {
      try {
        const key = `diagnosis_line_items_${diagnosis.id}`;
        const stored = localStorage.getItem(key);
        if (stored) {
          setLineItems(JSON.parse(stored));
        } else {
          setLineItems([]);
        }
      } catch (error) {
        console.error("Failed to load line items from storage:", error);
        setLineItems([]);
      }
    };
    
    loadLineItems();
    // Check for updates periodically (since storage event doesn't fire in same tab)
    const interval = setInterval(loadLineItems, 1000);
    return () => clearInterval(interval);
  }, [diagnosis.id]);

  const createMutation = useMutation({
    mutationFn: (data: any) => diagnosisApi.addRecommendation(diagnosis.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
      onRefresh();
      setShowAddDialog(false);
      setEditingRecommendation(null);
      toast({ title: "Recommendation added", variant: "default" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add recommendation",
        description: error.response?.data?.message || error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => diagnosisApi.updateRecommendation(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
      onRefresh();
      setShowAddDialog(false);
      setEditingRecommendation(null);
      toast({ title: "Recommendation updated", variant: "default" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update recommendation",
        description: error.response?.data?.message || error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => diagnosisApi.deleteRecommendation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
      onRefresh();
      toast({ title: "Recommendation deleted", variant: "default" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete recommendation",
        description: error.response?.data?.message || error.message,
        variant: "destructive",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: ({ recommendationIds, approved }: { recommendationIds: number[]; approved: boolean }) =>
      diagnosisApi.approveRecommendations(diagnosis.id, {
        recommendation_ids: recommendationIds,
        approved,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
      onRefresh();
      setSelectedRecommendations(new Set());
      toast({
        title: `Recommendations ${variables.approved ? "approved" : "declined"}`,
        variant: "default",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update recommendations",
        description: error.response?.data?.message || error.message,
        variant: "destructive",
      });
    },
  });

  const convertToTasksMutation = useMutation({
    mutationFn: (recommendationIds?: number[]) =>
      diagnosisApi.convertRecommendationsToTasks(diagnosis.id, {
        recommendation_ids: recommendationIds,
        assign_to_technician: true,
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
      queryClient.invalidateQueries({ queryKey: ["workorder", workOrderId] });
      onRefresh();
      setSelectedRecommendations(new Set());
      toast({
        title: "Recommendations converted to tasks",
        description: response.message,
        variant: "default",
      });
      // Navigate to work order tasks
      router.push(`/workorders/${workOrderId}`);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to convert recommendations",
        description: error.response?.data?.message || error.response?.data?.error || error.message,
        variant: "destructive",
      });
    },
  });

  const recommendations = diagnosis.repair_recommendations || [];
  const approvedRecommendations = recommendations.filter((r: any) => r.customer_approved);

  // Inventory parts for part line items (active parts)
  const { data: inventoryParts } = useQuery({
    queryKey: ["inventory", "parts", "active"],
    queryFn: () => inventoryApi.list({ is_active: true }),
  });
  const unapprovedRecommendations = recommendations.filter((r: any) => !r.customer_approved);
  const convertedRecommendations = recommendations.filter((r: any) => r.converted_to_task_id);

  const handleToggleSelection = (recId: number) => {
    const newSelection = new Set(selectedRecommendations);
    if (newSelection.has(recId)) {
      newSelection.delete(recId);
    } else {
      newSelection.add(recId);
    }
    setSelectedRecommendations(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedRecommendations.size === unapprovedRecommendations.length) {
      setSelectedRecommendations(new Set());
    } else {
      setSelectedRecommendations(new Set(unapprovedRecommendations.map((r: any) => r.id)));
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-lg">Repair Recommendations</CardTitle>
            <CardDescription className="mt-1">
              {recommendations.length} total • {approvedRecommendations.length} approved • {convertedRecommendations.length} converted to tasks
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {unapprovedRecommendations.length > 0 && selectedRecommendations.size > 0 && (
              <>
                <Button
                  onClick={() => approveMutation.mutate({
                    recommendationIds: Array.from(selectedRecommendations),
                    approved: true,
                  })}
                  size="sm"
                  variant="default"
                  disabled={approveMutation.isPending}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Approve Selected ({selectedRecommendations.size})
                </Button>
                <Button
                  onClick={() => approveMutation.mutate({
                    recommendationIds: Array.from(selectedRecommendations),
                    approved: false,
                  })}
                  size="sm"
                  variant="secondary"
                  disabled={approveMutation.isPending}
                >
                  <X className="w-4 h-4 mr-2" />
                  Decline Selected
                </Button>
              </>
            )}
            {approvedRecommendations.length > 0 && (
              <Button
                onClick={() => convertToTasksMutation.mutate(undefined)}
                size="sm"
                variant="default"
                disabled={convertToTasksMutation.isPending || convertedRecommendations.length === approvedRecommendations.length}
              >
                <ListChecks className="w-4 h-4 mr-2" />
                Convert to Tasks
              </Button>
            )}
            <Button onClick={() => setShowAddDialog(true)} size="sm" disabled={isDisabled}>
              <Plus className="w-4 h-4 mr-2" />
              Add
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {recommendations.length > 0 ? (
            <div className="space-y-4">
              {/* Unapproved Recommendations */}
              {unapprovedRecommendations.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h3 className="font-medium text-sm text-gray-700">Pending Approval ({unapprovedRecommendations.length})</h3>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedRecommendations.size === unapprovedRecommendations.length && unapprovedRecommendations.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                      <span className="text-xs text-gray-500">Select All</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {unapprovedRecommendations.map((rec: any) => (
                      <div
                        key={rec.id}
                        className={`p-3 border rounded-lg hover:shadow-sm transition-shadow space-y-2 ${
                          selectedRecommendations.has(rec.id) ? "border-blue-500 bg-blue-50/50" : ""
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <Checkbox
                            checked={selectedRecommendations.has(rec.id)}
                            onCheckedChange={() => handleToggleSelection(rec.id)}
                            className="mt-1"
                          />
                          <div className="flex-1 space-y-2">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="default" className="text-xs">
                                  {rec.priority_display || rec.priority}
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                  {rec.recommendation_type_display || rec.recommendation_type}
                                </Badge>
                              </div>
                              {rec.estimated_total_cost && Number(rec.estimated_total_cost) > 0 && (
                                <span className="text-base font-bold">
                                  ${Number(rec.estimated_total_cost).toFixed(2)}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-700 mb-2 line-clamp-2">{rec.description}</p>
                            {/* Parts and Labor Details */}
                            {(() => {
                              // Check for linked line items from Estimate tab
                              const linkedItems = lineItems.filter((item: any) => item.recommendation_id === rec.id);
                              const linkedParts = linkedItems.filter((item: any) => item.item_type === 'part');
                              const linkedLabor = linkedItems.filter((item: any) => item.item_type === 'labor');
                              const linkedPartsTotal = linkedParts.reduce((sum: number, item: any) => sum + ((item.quantity || 0) * (item.unit_price || 0)), 0);
                              const linkedLaborTotal = linkedLabor.reduce((sum: number, item: any) => {
                                if (item.labor_hours && item.labor_rate) {
                                  return sum + (item.labor_hours * item.labor_rate);
                                }
                                return sum + ((item.quantity || 0) * (item.unit_price || 0));
                              }, 0);
                              const linkedLaborHours = linkedLabor.reduce((sum: number, item: any) => sum + (item.labor_hours || item.quantity || 0), 0);
                              
                              const hasOldData = (rec.parts_needed && Array.isArray(rec.parts_needed) && rec.parts_needed.length > 0) || 
                                                 (rec.estimated_labor_hours && parseFloat(rec.estimated_labor_hours) > 0);
                              const hasLinkedData = linkedItems.length > 0;
                              
                              if (hasOldData || hasLinkedData) {
                                return (
                                  <div className="text-xs text-gray-600 space-y-1 pt-2 border-t border-gray-200">
                                    {/* Old parts_needed data */}
                                    {rec.parts_needed && Array.isArray(rec.parts_needed) && rec.parts_needed.length > 0 && (
                                      <div className="flex items-center gap-1">
                                        <Package className="w-3 h-3" />
                                        <span>{rec.parts_needed.length} part(s) - ${Number(rec.estimated_parts_cost || 0).toFixed(2)}</span>
                                      </div>
                                    )}
                                    {/* Linked parts from Estimate tab */}
                                    {linkedParts.length > 0 && (
                                      <div className="flex items-center gap-1">
                                        <Package className="w-3 h-3" />
                                        <span>{linkedParts.length} part(s) from estimate - ${linkedPartsTotal.toFixed(2)}</span>
                                      </div>
                                    )}
                                    {/* Old labor data */}
                                    {rec.estimated_labor_hours && parseFloat(rec.estimated_labor_hours) > 0 && (
                                      <div className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        <span>{parseFloat(rec.estimated_labor_hours).toFixed(1)}h labor - ${Number(rec.estimated_labor_cost || 0).toFixed(2)}</span>
                                      </div>
                                    )}
                                    {/* Linked labor from Estimate tab */}
                                    {linkedLabor.length > 0 && (
                                      <div className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        <span>{linkedLaborHours.toFixed(1)}h labor from estimate - ${linkedLaborTotal.toFixed(2)}</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              } else {
                                return (
                                  <p className="text-xs text-gray-500 italic pt-2 border-t border-gray-200">No estimate details</p>
                                );
                              }
                            })()}
                            <div className="flex gap-2 pt-1 flex-wrap">
                              <Button
                                size="sm"
                                variant="default"
                                className="h-7 text-xs"
                                onClick={() => approveMutation.mutate({
                                  recommendationIds: [rec.id],
                                  approved: true,
                                })}
                                disabled={approveMutation.isPending}
                              >
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-7 text-xs"
                                onClick={() => approveMutation.mutate({
                                  recommendationIds: [rec.id],
                                  approved: false,
                                })}
                                disabled={approveMutation.isPending}
                              >
                                <X className="w-3 h-3 mr-1" />
                                Decline
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => {
                                  setEditingRecommendation(rec);
                                  setShowAddDialog(true);
                                }}
                                disabled={rec.customer_approved || !!rec.converted_to_task_id || isDisabled}
                              >
                                <Edit className="w-3 h-3 mr-1" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => {
                                  if (confirm(`Delete recommendation: "${rec.description}"?`)) {
                                    deleteMutation.mutate(rec.id);
                                  }
                                }}
                                disabled={deleteMutation.isPending || !!rec.converted_to_task_id || isDisabled}
                              >
                                <Trash2 className="w-3 h-3 mr-1" />
                                Delete
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Approved but not converted */}
              {approvedRecommendations.filter((r: any) => !r.converted_to_task_id).length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-medium text-sm text-gray-700 border-b pb-2">
                    Approved - Ready to Convert ({approvedRecommendations.filter((r: any) => !r.converted_to_task_id).length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {approvedRecommendations
                      .filter((r: any) => !r.converted_to_task_id)
                      .map((rec: any) => (
                        <div key={rec.id} className="p-3 border border-green-200 bg-green-50/50 rounded-lg space-y-2">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="default" className="text-xs bg-green-600">
                                  {rec.priority_display || rec.priority}
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                  {rec.recommendation_type_display || rec.recommendation_type}
                                </Badge>
                                <Badge variant="success" className="text-xs">
                                  ✓ Approved
                                </Badge>
                              </div>
                              {rec.estimated_total_cost && Number(rec.estimated_total_cost) > 0 && (
                                <span className="text-base font-bold">
                                  ${Number(rec.estimated_total_cost).toFixed(2)}
                                </span>
                              )}
                            </div>
                          <p className="text-sm text-gray-700 mb-2 line-clamp-2">{rec.description}</p>
                          {/* Parts and Labor Details */}
                          {(rec.parts_needed && Array.isArray(rec.parts_needed) && rec.parts_needed.length > 0) || 
                           (rec.estimated_labor_hours && parseFloat(rec.estimated_labor_hours) > 0) ? (
                            <div className="text-xs text-gray-600 space-y-1 pt-2 border-t border-gray-200">
                              {rec.parts_needed && Array.isArray(rec.parts_needed) && rec.parts_needed.length > 0 && (
                                <div className="flex items-center gap-1">
                                  <Package className="w-3 h-3" />
                                  <span>{rec.parts_needed.length} part(s) - ${Number(rec.estimated_parts_cost || 0).toFixed(2)}</span>
                                </div>
                              )}
                              {rec.estimated_labor_hours && parseFloat(rec.estimated_labor_hours) > 0 && (
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  <span>{parseFloat(rec.estimated_labor_hours).toFixed(1)}h labor - ${Number(rec.estimated_labor_cost || 0).toFixed(2)}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-500 italic pt-2 border-t border-gray-200">No parts or labor estimates</p>
                          )}
                          <div className="flex gap-2 pt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => {
                                setEditingRecommendation(rec);
                                setShowAddDialog(true);
                              }}
                              disabled={!!rec.converted_to_task_id || isDisabled}
                            >
                              <Edit className="w-3 h-3 mr-1" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => {
                                if (confirm(`Delete recommendation: "${rec.description}"?`)) {
                                  deleteMutation.mutate(rec.id);
                                }
                              }}
                              disabled={deleteMutation.isPending || !!rec.converted_to_task_id || isDisabled}
                            >
                              <Trash2 className="w-3 h-3 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Converted to Tasks */}
              {convertedRecommendations.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-medium text-sm text-gray-700 border-b pb-2">
                    Converted to Tasks ({convertedRecommendations.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {convertedRecommendations.map((rec: any) => (
                      <div key={rec.id} className="p-3 border border-blue-200 bg-blue-50/50 rounded-lg space-y-2">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="default" className="text-xs">
                              {rec.priority_display || rec.priority}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {rec.recommendation_type_display || rec.recommendation_type}
                            </Badge>
                            <Badge variant="info" className="text-xs">
                              ✓ Task Created
                            </Badge>
                          </div>
                          {rec.estimated_total_cost && Number(rec.estimated_total_cost) > 0 && (
                            <span className="text-base font-bold">
                              ${Number(rec.estimated_total_cost).toFixed(2)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-700 mb-2 line-clamp-2">{rec.description}</p>
                        {/* Parts and Labor Details */}
                        {(() => {
                          // Check for linked line items from Estimate tab
                          const linkedItems = lineItems.filter((item: any) => item.recommendation_id === rec.id);
                          const linkedParts = linkedItems.filter((item: any) => item.item_type === 'part');
                          const linkedLabor = linkedItems.filter((item: any) => item.item_type === 'labor');
                          const linkedPartsTotal = linkedParts.reduce((sum: number, item: any) => sum + ((item.quantity || 0) * (item.unit_price || 0)), 0);
                          const linkedLaborTotal = linkedLabor.reduce((sum: number, item: any) => {
                            if (item.labor_hours && item.labor_rate) {
                              return sum + (item.labor_hours * item.labor_rate);
                            }
                            return sum + ((item.quantity || 0) * (item.unit_price || 0));
                          }, 0);
                          const linkedLaborHours = linkedLabor.reduce((sum: number, item: any) => sum + (item.labor_hours || item.quantity || 0), 0);
                          
                          const hasOldData = (rec.parts_needed && Array.isArray(rec.parts_needed) && rec.parts_needed.length > 0) || 
                                             (rec.estimated_labor_hours && parseFloat(rec.estimated_labor_hours) > 0);
                          const hasLinkedData = linkedItems.length > 0;
                          
                          if (hasOldData || hasLinkedData) {
                            return (
                              <div className="text-xs text-gray-600 space-y-1 pt-2 border-t border-gray-200">
                                {rec.parts_needed && Array.isArray(rec.parts_needed) && rec.parts_needed.length > 0 && (
                                  <div className="flex items-center gap-1">
                                    <Package className="w-3 h-3" />
                                    <span>{rec.parts_needed.length} part(s) - ${Number(rec.estimated_parts_cost || 0).toFixed(2)}</span>
                                  </div>
                                )}
                                {linkedParts.length > 0 && (
                                  <div className="flex items-center gap-1">
                                    <Package className="w-3 h-3" />
                                    <span>{linkedParts.length} part(s) from estimate - ${linkedPartsTotal.toFixed(2)}</span>
                                  </div>
                                )}
                                {rec.estimated_labor_hours && parseFloat(rec.estimated_labor_hours) > 0 && (
                                  <div className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    <span>{parseFloat(rec.estimated_labor_hours).toFixed(1)}h labor - ${Number(rec.estimated_labor_cost || 0).toFixed(2)}</span>
                                  </div>
                                )}
                                {linkedLabor.length > 0 && (
                                  <div className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    <span>{linkedLaborHours.toFixed(1)}h labor from estimate - ${linkedLaborTotal.toFixed(2)}</span>
                                  </div>
                                )}
                              </div>
                            );
                          } else {
                            return (
                              <p className="text-xs text-gray-500 italic pt-2 border-t border-gray-200">No parts or labor estimates</p>
                            );
                          }
                        })()}
                        {rec.converted_to_task_id && (
                          <Link href={`/workorders/${workOrderId}`} className="text-xs text-blue-600 hover:underline">
                            View Task #{rec.converted_to_task_id}
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Wrench className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <Button onClick={() => setShowAddDialog(true)} variant="secondary" size="sm" className="mt-4">
                <Plus className="w-4 h-4 mr-2" />
                Add First Recommendation
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Recommendation Dialog */}
      <RecommendationDialog
        open={showAddDialog}
        onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) {
            setEditingRecommendation(null);
          }
        }}
        recommendation={editingRecommendation}
        onSave={(data) => {
          if (editingRecommendation) {
            updateMutation.mutate({ id: editingRecommendation.id, data });
          } else {
            createMutation.mutate(data);
          }
        }}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

    </>
  );
}

// Recommendation Dialog Component
function RecommendationDialog({
  open,
  onOpenChange,
  onSave,
  recommendation,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: {
    recommendation_type: "repair" | "replace" | "service" | "adjust" | "clean" | "inspect";
    description: string;
    priority: "critical" | "necessary" | "recommended" | "advisory";
    order?: number;
  }) => void;
  recommendation?: any;
  isLoading: boolean;
}) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    recommendation_type: "repair" as const,
    description: "",
    priority: "necessary" as const,
  });

  React.useEffect(() => {
    if (recommendation) {
      // Edit mode - populate form with existing data
      setFormData({
        recommendation_type: recommendation.recommendation_type || "repair",
        description: recommendation.description || "",
        priority: recommendation.priority || "necessary",
      });
    } else if (!open) {
      // Reset form when dialog closes (and not editing)
      setFormData({
        recommendation_type: "repair",
        description: "",
        priority: "necessary",
      });
    }
  }, [open, recommendation]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      recommendation_type: formData.recommendation_type,
      description: formData.description.trim(),
      priority: formData.priority,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{recommendation ? "Edit Repair Recommendation" : "Add Repair Recommendation"}</DialogTitle>
          <DialogDescription>
            {recommendation ? "Update the recommendation details below." : "Add parts and labor estimates to help create accurate estimates."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="px-6 pb-6">
          <div className="space-y-6">
            {/* Basic Information */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="recommendation_type">Recommendation Type *</Label>
                <Select
                  id="recommendation_type"
                  value={formData.recommendation_type}
                  onChange={(e) => setFormData({ ...formData, recommendation_type: e.target.value as any })}
                  required
                >
                  <option value="repair">Repair</option>
                  <option value="replace">Replace</option>
                  <option value="service">Service</option>
                  <option value="adjust">Adjust</option>
                  <option value="clean">Clean</option>
                  <option value="inspect">Inspect</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">Priority *</Label>
                <Select
                  id="priority"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                  required
                >
                  <option value="critical">Critical</option>
                  <option value="necessary">Necessary</option>
                  <option value="recommended">Recommended</option>
                  <option value="advisory">Advisory</option>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe what needs to be done..."
                required
                rows={3}
              />
            </div>

            {/* Parts and labor moved to Estimate tab */}
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading 
                ? (recommendation ? "Updating..." : "Adding...") 
                : (recommendation ? "Update Recommendation" : "Add Recommendation")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Photos Tab Component
function PhotosTab({
  diagnosisId,
  onRefresh,
  isDisabled = false,
}: {
  diagnosisId: number;
  onRefresh: () => void;
  isDisabled?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddDialog, setShowAddDialog] = useState(false);
  
  const { data: photos = [], isLoading, error } = useQuery({
    queryKey: ["diagnosis-photos", diagnosisId],
    queryFn: () => diagnosisApi.photos.list({ diagnosis: diagnosisId }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => diagnosisApi.photos.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diagnosis-photos", diagnosisId] });
      onRefresh();
      toast({ title: "Photo deleted", variant: "default" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete photo",
        description: error.response?.data?.message || error.message,
        variant: "destructive",
      });
    },
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["diagnosis-photos", diagnosisId] });
    onRefresh();
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-lg">Diagnosis Photos</CardTitle>
          <div className="flex items-center space-x-2">
            <Button onClick={() => setShowAddDialog(true)} size="sm" disabled={isDisabled}>
              <Plus className="w-4 h-4 mr-2" />
              Add Photo
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">
              Failed to load photos. Please try again.
            </p>
          ) : photos.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Camera className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <p>No photos uploaded yet.</p>
              <Button
                variant="secondary"
                className="mt-4"
                onClick={() => setShowAddDialog(true)}
                disabled={isDisabled}
              >
                <Plus className="w-4 h-4 mr-2" />
                Upload Your First Photo
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="border rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900 hover:shadow-md transition-shadow"
                >
                  {photo.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo.photo_url}
                      alt={photo.caption || "Diagnosis photo"}
                      className="w-full h-48 object-cover cursor-pointer"
                      onClick={() => window.open(photo.photo_url, '_blank')}
                    />
                  ) : (
                    <div className="h-48 flex items-center justify-center bg-gray-200 text-gray-500">
                      No preview available
                    </div>
                  )}
                  <div className="p-2 relative group">
                    <p className="text-xs font-medium truncate">{photo.caption || "Untitled"}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 hover:bg-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Delete this photo?")) {
                          deleteMutation.mutate(photo.id);
                        }
                      }}
                      disabled={isDisabled}
                    >
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Photo Dialog */}
      <PhotoUploadDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        diagnosisId={diagnosisId}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["diagnosis-photos", diagnosisId] });
          onRefresh();
        }}
      />
    </>
  );
}

// Photo Upload Dialog Component
function PhotoUploadDialog({
  open,
  onOpenChange,
  diagnosisId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  diagnosisId: number;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    caption: "",
    photo_type: "evidence" as const,
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      return diagnosisApi.photos.create(diagnosisId, data);
    },
    onSuccess: () => {
      toast({ title: "Photo uploaded successfully", variant: "default" });
      onSuccess();
      handleClose();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to upload photo",
        description: error.response?.data?.message || error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please select an image smaller than 10MB",
          variant: "destructive",
        });
        return;
      }
      if (!file.type.startsWith("image/")) {
        toast({
          title: "Invalid file type",
          description: "Please select an image file",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      toast({
        title: "No file selected",
        description: "Please select a photo to upload",
        variant: "destructive",
      });
      return;
    }

    const formDataToSend = new FormData();
    formDataToSend.append("photo", selectedFile);
    formDataToSend.append("diagnosis", diagnosisId.toString());
    formDataToSend.append("caption", formData.caption);
    formDataToSend.append("photo_type", formData.photo_type);

    createMutation.mutate(formDataToSend);
  };

  const handleClose = () => {
    setSelectedFile(null);
    setPreview(null);
    setFormData({
      caption: "",
      photo_type: "evidence",
    });
    onOpenChange(false);
  };

  React.useEffect(() => {
    if (!open) {
      handleClose();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Diagnosis Photo</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="px-6 pb-6">
          <div className="space-y-4">
            {/* File Upload */}
            <div className="space-y-2">
              <Label htmlFor="photo">Photo *</Label>
              <input
                id="photo"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                required
              />
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 transition-colors"
                onClick={() => document.getElementById("photo")?.click()}
              >
                {preview ? (
                  <div className="space-y-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={preview}
                      alt="Preview"
                      className="max-h-48 mx-auto rounded-lg"
                    />
                    <p className="text-sm text-gray-600">{selectedFile?.name}</p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                        setPreview(null);
                      }}
                    >
                      Change Photo
                    </Button>
                  </div>
                ) : (
                  <div>
                    <Camera className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                    <div className="cursor-pointer">
                      <span className="text-blue-600 hover:text-blue-700">
                        Click to upload
                      </span>
                      <span className="text-gray-500"> or drag and drop</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      PNG, JPG, GIF up to 10MB
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Caption */}
            <div className="space-y-2">
              <Label htmlFor="caption">Caption</Label>
              <Input
                id="caption"
                value={formData.caption}
                onChange={(e) => setFormData({ ...formData, caption: e.target.value })}
                placeholder="Describe what this photo shows..."
              />
            </div>

            {/* Photo Type */}
            <div className="space-y-2">
              <Label htmlFor="photo_type">Photo Type *</Label>
              <Select
                id="photo_type"
                value={formData.photo_type}
                onChange={(e) =>
                  setFormData({ ...formData, photo_type: e.target.value as any })
                }
                required
              >
                <option value="problem">Problem</option>
                <option value="evidence">Evidence</option>
                <option value="component">Component</option>
                <option value="before">Before</option>
                <option value="after">After</option>
                <option value="damage">Damage</option>
                <option value="test_result">Test Result</option>
                <option value="other">Other</option>
              </Select>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending || !selectedFile}>
              {createMutation.isPending ? "Uploading..." : "Upload Photo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Parts Tab Component - Estimate Line Items
function PartsTab({
  diagnosis,
  workOrder,
  onRefresh,
  isDisabled = false,
}: {
  diagnosis: Diagnosis;
  workOrder: any;
  onRefresh: () => void;
  isDisabled?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [showCreateEstimateDialog, setShowCreateEstimateDialog] = useState(false);
  
  // Line items type
  type LineItem = {
    item_type: "labor" | "part" | "fee" | "sublet" | "other";
    description: string;
    quantity?: number;
    unit_price?: number;
    labor_hours?: number;
    labor_rate?: number;
    part?: number;
    part_number?: string;
    recommendation_id?: number; // Track which recommendation this came from
    part_source?: "rec" | "inv" | "manual"; // Track where part selection came from
    manual_entry?: boolean; // For part items: manual description instead of select
    is_taxable: boolean;
    notes?: string;
  };
  
  // Load line items from localStorage on mount
  const loadLineItemsFromStorage = (): LineItem[] => {
    try {
      const key = `diagnosis_line_items_${diagnosis.id}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error("Failed to load line items from storage:", error);
    }
    return [];
  };
  
  // Save line items to localStorage
  const saveLineItemsToStorage = (items: LineItem[]) => {
    try {
      const key = `diagnosis_line_items_${diagnosis.id}`;
      localStorage.setItem(key, JSON.stringify(items));
    } catch (error) {
      console.error("Failed to save line items to storage:", error);
    }
  };
  
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [itemsLoadedFromStorage, setItemsLoadedFromStorage] = React.useState(false);
  
  // Check if an estimate already exists for this work order (declared early for use in useEffect)
  // Since Estimate has OneToOne relationship with WorkOrder, check workOrder.estimate
  const hasExistingEstimate = !!(workOrder?.estimate);
  
  // Load line items from localStorage when component mounts or diagnosis ID changes
  React.useEffect(() => {
    const stored = loadLineItemsFromStorage();
    if (stored.length > 0) {
      setLineItems(stored);
      setItemsLoadedFromStorage(true);
      // Show toast notification when items are restored
      setTimeout(() => {
        toast({
          title: "Line items restored",
          description: `Loaded ${stored.length} saved line item(s) from previous session`,
          variant: "default",
        });
      }, 500); // Small delay to avoid showing immediately on page load
    } else {
      setItemsLoadedFromStorage(true); // Mark as loaded even if empty
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagnosis.id]);
  
  // Save line items to localStorage whenever they change (but only after initial load)
  // BUT: Don't clear if an estimate exists (preserve line items after estimate creation)
  React.useEffect(() => {
    if (itemsLoadedFromStorage) {
      if (lineItems.length > 0) {
        saveLineItemsToStorage(lineItems);
      } else {
        // Only clear storage if items array is empty AND no estimate exists
        // This prevents clearing after estimate creation
        if (!hasExistingEstimate) {
          try {
            const key = `diagnosis_line_items_${diagnosis.id}`;
            localStorage.removeItem(key);
          } catch (error) {
            console.error("Failed to clear line items from storage:", error);
          }
        }
      }
    }
  }, [lineItems, diagnosis.id, itemsLoadedFromStorage, hasExistingEstimate]);

  // Recommendations data is already available from diagnosis

  // Inventory parts for part line items (active parts) used in line-item dropdown
  const { data: inventoryParts } = useQuery({
    queryKey: ["inventory", "parts", "active", diagnosis.id],
    queryFn: () => inventoryApi.list({ is_active: true }),
  });

  // Fetch tax config for summary
  const { data: taxConfig } = useQuery({
    queryKey: ["tax", "config"],
    queryFn: () => billingApi.taxes.config(),
  });

  // Allow creating estimate when diagnosis is in progress OR completed
  // But prevent if estimate already exists
  const canCreateEstimate = (diagnosis.status === "in_progress" || diagnosis.status === "completed") && !hasExistingEstimate;
  
  // Line items editing should be disabled when diagnosis is not active
  // Use isDisabled for line items, but allow Create Estimate button when completed
  const canEditLineItems = isDisabled ? false : diagnosis.status === "in_progress";


  const addLineItem = () => {
    setLineItems([...lineItems, {
      item_type: "labor",
      description: "",
      quantity: 1,
      unit_price: 0,
      manual_entry: false,
      is_taxable: true,
    }]);
  };

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const updateLineItem = (index: number, field: string, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };

  const updateLineItemFields = (index: number, updates: Record<string, any>) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], ...updates };
    setLineItems(updated);
  };

  const calculateLineItemTotal = (item: typeof lineItems[0]): number => {
    if (item.item_type === "labor" && item.labor_hours && item.labor_rate) {
      return item.labor_hours * item.labor_rate;
    }
    return (item.quantity || 0) * (item.unit_price || 0);
  };

  const subtotal = lineItems.reduce((sum, item) => sum + calculateLineItemTotal(item), 0);
  const taxableSubtotal = lineItems
    .filter(item => item.is_taxable)
    .reduce((sum, item) => sum + calculateLineItemTotal(item), 0);
  
  const taxSummary = computeGhanaTaxBreakdown({
    taxableTotal: taxableSubtotal,
    subtotal,
    discountAmount: 0,
    config: taxConfig,
  });

  const total = subtotal + taxSummary.totalTax;

  const createEstimateMutation = useMutation({
    mutationFn: async () => {
      if (!workOrder) {
        throw new Error("Work order data not available");
      }
      
      const customerId = typeof workOrder.customer === 'object' ? workOrder.customer.id : workOrder.customer;
      const vehicleId = workOrder.vehicle 
        ? (typeof workOrder.vehicle === 'object' ? workOrder.vehicle.id : workOrder.vehicle)
        : undefined;
      const workOrderId = workOrder.id;
      
      // Validate line items
      if (lineItems.length === 0) {
        throw new Error("At least one line item is required");
      }

      // Validate each line item
      for (const item of lineItems) {
        if (!item.description || item.description.trim() === '') {
          throw new Error("All line items must have a description");
        }
        if (item.item_type === 'labor') {
          if (!item.labor_hours || item.labor_hours <= 0) {
            throw new Error("Labor items must have hours greater than 0");
          }
          if (!item.labor_rate || item.labor_rate <= 0) {
            throw new Error("Labor items must have a rate greater than 0");
          }
        } else {
          if (!item.quantity || item.quantity <= 0) {
            throw new Error("All items must have quantity greater than 0");
          }
          if (item.unit_price === undefined || item.unit_price < 0) {
            throw new Error("All items must have a valid unit price");
          }
        }
      }

      // Prepare line items for API
      const lineItemsForApi = lineItems.map((item) => {
        const lineItem: any = {
          item_type: item.item_type,
          description: item.description.trim(),
          is_taxable: item.is_taxable ?? true,
        };
        
        if (item.item_type === 'labor') {
          lineItem.labor_hours = item.labor_hours || 1;
          lineItem.labor_rate = (item.labor_rate || 0).toString();
          lineItem.quantity = item.labor_hours || 1;
          lineItem.unit_price = (item.labor_rate || 0).toString();
        } else {
          lineItem.quantity = item.quantity && item.quantity > 0 ? item.quantity : 1;
          lineItem.unit_price = (item.unit_price || 0).toString();
        }
        
        if (item.part) lineItem.part = item.part;
        if (item.part_number) lineItem.part_number = item.part_number;
        if (item.notes) lineItem.notes = item.notes;
        
        return lineItem;
      });

      // Get vehicle info for title
      const vehicleYear = workOrder.vehicle?.year || '';
      const vehicleMake = workOrder.vehicle?.make || '';
      const vehicleModel = workOrder.vehicle?.model || '';

      // Create estimate directly with line items, including work_order link
      const estimateData: any = {
        customer: customerId,
        title: vehicleYear && vehicleMake && vehicleModel 
          ? `Repair Estimate - ${vehicleYear} ${vehicleMake} ${vehicleModel}`
          : `Repair Estimate - Work Order #${workOrder.work_order_number || workOrderId}`,
        description: diagnosis.root_cause || diagnosis.customer_complaint || "Repair estimate based on diagnosis",
        estimate_date: new Date().toISOString().split('T')[0],
        valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        notes: `Estimate prepared from diagnosis. Work Order: #${workOrder.work_order_number || workOrderId}`,
        customer_notes: '',
        line_items: lineItemsForApi,
      };
      
      // Only include vehicle if it exists (optional field)
      if (vehicleId !== undefined && vehicleId !== null) {
        estimateData.vehicle = vehicleId;
      }
      
      // Only include work_order if it exists
      if (workOrderId !== undefined && workOrderId !== null) {
        estimateData.work_order = workOrderId;
      }

      console.log("Creating estimate with data:", estimateData);
      const estimate = await billingApi.estimates.create(estimateData);
      console.log("Estimate created, response:", estimate);
      
      // Parts should now be automatically synced to work order during estimate creation
      
      return estimate;
    },
    onSuccess: (response) => {
      console.log("onSuccess called with response:", response);
      
      const estimateId = response?.id;
      const estimateNumber = response?.estimate_number;
      
      // Keep line items visible after estimate creation (read-only) so users can see what was used
      // Save line items to localStorage before any refresh happens
      // This ensures they persist even if component remounts
      try {
        const key = `diagnosis_line_items_${diagnosis.id}`;
        const currentItems = lineItems.length > 0 ? lineItems : loadLineItemsFromStorage();
        if (currentItems.length > 0) {
          localStorage.setItem(key, JSON.stringify(currentItems));
        }
      } catch (error) {
        console.error("Failed to save line items after estimate creation:", error);
      }
      
      // Invalidate work order query to refresh estimated_total and parts
      const woId = workOrder?.id;
      if (woId) {
        queryClient.invalidateQueries({ queryKey: ["workorder", woId] });
        queryClient.invalidateQueries({ queryKey: ["workorder-parts", woId] });
        
        // Also refresh diagnosis data in case it needs updating
        queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", woId] });
      }
      
      toast({
        title: "Estimate created successfully",
        description: estimateNumber 
          ? `Estimate ${estimateNumber} has been created. Parts and totals have been synced to the work order.`
          : "Estimate has been created. Parts and totals have been synced to the work order.",
        variant: "default",
      });
      
      setShowCreateEstimateDialog(false);
      
      // Refresh the parent component's data if callback exists
      if (onRefresh) {
        onRefresh();
      }
      
      if (estimateId) {
        console.log("Redirecting to estimate edit page:", estimateId);
        // Delay redirect slightly to allow query invalidation to complete
        setTimeout(() => {
          router.push(`/billing/estimates/${estimateId}/edit`);
        }, 500);
      } else {
        console.error("No estimate ID in response:", response);
        toast({
          title: "Warning",
          description: "Estimate was created but could not retrieve ID. Please check estimates list.",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      console.error("Estimate creation error:", error);
      console.error("Error response data:", error.response?.data);
      
      // Try to extract detailed validation errors from Django REST Framework response
      let errorMessage = "Failed to create estimate. Please try again.";
      
      if (error.response?.data) {
        const data = error.response.data;
        
        // Handle Django REST Framework validation errors
        if (data.detail) {
          errorMessage = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
        } else if (data.error) {
          errorMessage = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
        } else if (data.message) {
          errorMessage = typeof data.message === 'string' ? data.message : JSON.stringify(data.message);
        } else if (typeof data === 'object') {
          // Build error message from field errors
          const fieldErrors: string[] = [];
          for (const [field, errors] of Object.entries(data)) {
            if (Array.isArray(errors)) {
              fieldErrors.push(`${field}: ${errors.join(', ')}`);
            } else if (typeof errors === 'object') {
              // Handle nested errors (e.g., line_items)
              for (const [nestedField, nestedErrors] of Object.entries(errors as any)) {
                if (Array.isArray(nestedErrors)) {
                  fieldErrors.push(`${field}[${nestedField}]: ${nestedErrors.join(', ')}`);
                } else {
                  fieldErrors.push(`${field}[${nestedField}]: ${nestedErrors}`);
                }
              }
            } else {
              fieldErrors.push(`${field}: ${errors}`);
            }
          }
          if (fieldErrors.length > 0) {
            errorMessage = fieldErrors.join('; ');
          }
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Failed to create estimate",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Helper: Get recommendations for quick-add
  const recommendations = diagnosis.repair_recommendations || [];
  const approvedRecommendations = recommendations.filter((r: any) => r.customer_approved);
  
  // Auto-populate from recommendations on mount if no line items (and not loaded from storage)
  React.useEffect(() => {
    // Only auto-populate if items have been loaded from storage and are still empty
    // This prevents auto-populating when items were restored from localStorage
    if (!itemsLoadedFromStorage) return; // Wait for storage load to complete
    
    if (lineItems.length === 0 && approvedRecommendations.length > 0) {
      const shouldAutoPopulate = confirm(
        `You have ${approvedRecommendations.length} approved recommendation(s). Would you like to auto-populate the estimate line items?`
      );
      
      if (shouldAutoPopulate) {
        const newLineItems: typeof lineItems = [];
        
        approvedRecommendations.forEach((rec: any) => {
          // Add parts from parts_needed
          if (rec.parts_needed && Array.isArray(rec.parts_needed) && rec.parts_needed.length > 0) {
            rec.parts_needed.forEach((part: any) => {
              newLineItems.push({
                item_type: "part" as const,
                description: part.part_name || "Part",
                quantity: part.quantity || 1,
                unit_price: parseFloat(part.unit_cost || '0'),
                part: part.part_id || undefined,
                part_number: part.part_number || "",
                part_source: "rec",
                is_taxable: true,
                notes: `From recommendation: ${rec.description}`,
              });
            });
          }
          
          // Add labor if estimated_labor_hours exists
          if (rec.estimated_labor_hours && parseFloat(rec.estimated_labor_hours) > 0) {
            const laborHours = parseFloat(rec.estimated_labor_hours);
            const laborRate = rec.estimated_labor_cost && laborHours > 0
              ? parseFloat(rec.estimated_labor_cost) / laborHours
              : 75; // Default rate
            
            newLineItems.push({
              item_type: "labor" as const,
              description: rec.description,
              labor_hours: laborHours,
              labor_rate: laborRate,
              quantity: laborHours,
              unit_price: laborRate,
              part_source: undefined,
              recommendation_id: rec.id,
              is_taxable: true,
              notes: `From recommendation: ${rec.description}`,
            });
          }
        });
        
        if (newLineItems.length > 0) {
          setLineItems(newLineItems);
          toast({
            title: "Line items auto-populated",
            description: `Added ${newLineItems.length} item(s) from ${approvedRecommendations.length} recommendation(s)`,
            variant: "default",
          });
        }
      }
    }
  }, [itemsLoadedFromStorage, lineItems.length, approvedRecommendations.length]); // Run when storage is loaded

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-4 space-y-6">
          {/* Recommendations Helper (disabled in Estimate tab) */}
          {false && recommendations.length > 0 && (
            <Card className="border-blue-200 bg-blue-50/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Wrench className="w-5 h-5" />
                      Repair Recommendations
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Select recommendations to add parts and labor to the estimate
                      {approvedRecommendations.length > 0 && (
                        <Badge variant="secondary" className="ml-2">
                          {approvedRecommendations.length} approved
                        </Badge>
                      )}
                    </CardDescription>
                  </div>
                  {approvedRecommendations.length > 0 && (
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={() => {
                        const newLineItems: typeof lineItems = [];
                        
                        approvedRecommendations.forEach((rec: any) => {
                          // Add parts
                          if (rec.parts_needed && Array.isArray(rec.parts_needed) && rec.parts_needed.length > 0) {
                            rec.parts_needed.forEach((part: any) => {
                              newLineItems.push({
                                item_type: "part" as const,
                                description: part.part_name || "Part",
                                quantity: part.quantity || 1,
                                unit_price: parseFloat(part.unit_cost || '0'),
                                part: part.part_id || undefined,
                                part_number: part.part_number || "",
                                recommendation_id: rec.id,
                                is_taxable: true,
                                notes: `From: ${rec.description}`,
                              });
                            });
                          }
                          
                          // Add labor
                          if (rec.estimated_labor_hours && parseFloat(rec.estimated_labor_hours) > 0) {
                            const laborHours = parseFloat(rec.estimated_labor_hours);
                            const laborRate = rec.estimated_labor_cost && laborHours > 0
                              ? parseFloat(rec.estimated_labor_cost) / laborHours
                              : 75;
                            
                            newLineItems.push({
                              item_type: "labor" as const,
                              description: rec.description,
                              labor_hours: laborHours,
                              labor_rate: laborRate,
                                  quantity: laborHours,
                                  unit_price: laborRate,
                                  recommendation_id: rec.id,
                                  is_taxable: true,
                                  notes: `From: ${rec.description}`,
                            });
                          }
                        });
                        
                        if (newLineItems.length > 0) {
                          setLineItems(newLineItems);
                          toast({
                            title: "Items added from recommendations",
                            description: `Added ${newLineItems.length} item(s) to estimate`,
                            variant: "default",
                          });
                        } else {
                          toast({
                            title: "No items to add",
                            description: "Recommendations don't have parts or labor estimates",
                            variant: "default",
                          });
                        }
                      }}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add All Approved
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recommendations.map((rec: any) => {
                    const hasParts = rec.parts_needed && Array.isArray(rec.parts_needed) && rec.parts_needed.length > 0;
                    const hasLabor = rec.estimated_labor_hours && parseFloat(rec.estimated_labor_hours) > 0;
                    const isApproved = rec.customer_approved;
                    const totalPartsCost = hasParts 
                      ? rec.parts_needed.reduce((sum: number, part: any) => sum + (parseFloat(part.unit_cost || '0') * (part.quantity || 1)), 0)
                      : 0;
                    const totalLaborCost = hasLabor && rec.estimated_labor_cost ? parseFloat(rec.estimated_labor_cost) : 0;
                    const totalCost = totalPartsCost + totalLaborCost;
                    
                    return (
                      <div 
                        key={rec.id} 
                        className={`p-4 bg-white rounded-lg border-2 transition-all ${
                          isApproved 
                            ? 'border-green-300 bg-green-50/50 hover:border-green-400' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <h4 className="font-semibold text-base text-gray-900">{rec.description}</h4>
                              {isApproved ? (
                                <Badge className="bg-green-600 text-white">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Approved
                                </Badge>
                              ) : (
                                <Badge variant="secondary">Pending Approval</Badge>
                              )}
                              <Badge variant="secondary" className="text-xs">
                                {rec.priority_display || rec.priority}
                              </Badge>
                              {rec.recommendation_type && (
                                <Badge variant="secondary" className="text-xs">
                                  {rec.recommendation_type_display || rec.recommendation_type}
                                </Badge>
                              )}
                            </div>
                            
                            {(hasParts || hasLabor) && (
                              <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-200">
                                {hasParts && (
                                  <div>
                                    <p className="text-xs font-medium text-gray-500 mb-1">Parts Required</p>
                                    <div className="space-y-1">
                                      {rec.parts_needed.map((part: any, idx: number) => (
                                        <div key={idx} className="flex items-center justify-between text-sm">
                                          <span className="text-gray-700">
                                            {part.part_name || part.part_number || `Part ${idx + 1}`}
                                            {part.quantity > 1 && ` (x${part.quantity})`}
                                          </span>
                                          <span className="font-medium text-gray-900">
                                            ${(parseFloat(part.unit_cost || '0') * (part.quantity || 1)).toFixed(2)}
                                          </span>
                                        </div>
                                      ))}
                                      {rec.parts_needed.length > 1 && (
                                        <div className="flex items-center justify-between text-sm font-semibold pt-1 border-t border-gray-100">
                                          <span className="text-gray-700">Parts Total</span>
                                          <span className="text-gray-900">${totalPartsCost.toFixed(2)}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                                
                                {hasLabor && (
                                  <div>
                                    <p className="text-xs font-medium text-gray-500 mb-1">Labor</p>
                                    <div className="space-y-1 text-sm">
                                      <div className="flex items-center justify-between">
                                        <span className="text-gray-700">
                                          {parseFloat(rec.estimated_labor_hours).toFixed(1)} hours
                                        </span>
                                        <span className="font-medium text-gray-900">
                                          ${totalLaborCost > 0 ? totalLaborCost.toFixed(2) : 'TBD'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                )}
                                
                                {(hasParts && hasLabor) && (
                                  <div className="col-span-2 pt-2 border-t border-gray-200">
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm font-semibold text-gray-700">Total Estimated</span>
                                      <span className="text-lg font-bold text-blue-600">${totalCost.toFixed(2)}</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {!hasParts && !hasLabor && (
                              <p className="text-sm text-gray-500 italic mt-2">No parts or labor estimates specified</p>
                            )}
                          </div>
                          
                          <div className="flex flex-col gap-2 flex-shrink-0">
                            {hasParts && (
                              <Button
                                type="button"
                                variant={isApproved ? "default" : "outline"}
                                size="sm"
                                onClick={() => {
                                  rec.parts_needed.forEach((part: any) => {
                                    const newItem = {
                                      item_type: "part" as const,
                                      description: part.part_name || "Part",
                                      quantity: part.quantity || 1,
                                      unit_price: parseFloat(part.unit_cost || '0'),
                                      part: part.part_id || undefined,
                                      part_number: part.part_number || "",
                                      recommendation_id: rec.id,
                                      is_taxable: true,
                                      notes: `From: ${rec.description}`,
                                    };
                                    setLineItems([...lineItems, newItem]);
                                  });
                                  toast({
                                    title: "Parts added",
                                    description: `Added ${rec.parts_needed.length} part(s) to line items`,
                                    variant: "default",
                                  });
                                }}
                                disabled={!isApproved}
                                className="whitespace-nowrap"
                              >
                                <Package className="w-4 h-4 mr-1" />
                                Add {rec.parts_needed.length} Part{rec.parts_needed.length > 1 ? 's' : ''}
                              </Button>
                            )}
                            {hasLabor && (
                              <Button
                                type="button"
                                variant={isApproved ? "default" : "outline"}
                                size="sm"
                                onClick={() => {
                                  const laborHours = parseFloat(rec.estimated_labor_hours);
                                  const laborRate = rec.estimated_labor_cost && laborHours > 0
                                    ? parseFloat(rec.estimated_labor_cost) / laborHours
                                    : 75;
                                  const newItem = {
                                    item_type: "labor" as const,
                                    description: rec.description,
                                    labor_hours: laborHours,
                                    labor_rate: laborRate,
                                    quantity: laborHours,
                                    unit_price: laborRate,
                                    recommendation_id: rec.id,
                                    is_taxable: true,
                                    notes: `From: ${rec.description}`,
                                  };
                                  setLineItems([...lineItems, newItem]);
                                  toast({
                                    title: "Labor added",
                                    description: `Added ${laborHours.toFixed(1)} hours of labor to line items`,
                                    variant: "default",
                                  });
                                }}
                                disabled={!isApproved}
                                className="whitespace-nowrap"
                              >
                                <Clock className="w-4 h-4 mr-1" />
                                Add Labor ({parseFloat(rec.estimated_labor_hours).toFixed(1)}h)
                              </Button>
                            )}
                            {(hasParts || hasLabor) && (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  const newItems: typeof lineItems = [];
                                  
                                  if (hasParts) {
                                    rec.parts_needed.forEach((part: any) => {
                                      newItems.push({
                                        item_type: "part" as const,
                                        description: part.part_name || "Part",
                                        quantity: part.quantity || 1,
                                        unit_price: parseFloat(part.unit_cost || '0'),
                                        part: part.part_id || undefined,
                                        part_number: part.part_number || "",
                                        recommendation_id: rec.id,
                                        is_taxable: true,
                                        notes: `From: ${rec.description}`,
                                      });
                                    });
                                  }
                                  
                                  if (hasLabor) {
                                    const laborHours = parseFloat(rec.estimated_labor_hours);
                                    const laborRate = rec.estimated_labor_cost && laborHours > 0
                                      ? parseFloat(rec.estimated_labor_cost) / laborHours
                                      : 75;
                                    newItems.push({
                                      item_type: "labor" as const,
                                      description: rec.description,
                                      labor_hours: laborHours,
                                      labor_rate: laborRate,
                                      quantity: laborHours,
                                      unit_price: laborRate,
                                      recommendation_id: rec.id,
                                      is_taxable: true,
                                      notes: `From: ${rec.description}`,
                                    });
                                  }
                                  
                                  setLineItems([...lineItems, ...newItems]);
                                  toast({
                                    title: "All items added",
                                    description: `Added ${newItems.length} item(s) from this recommendation`,
                                    variant: "default",
                                  });
                                }}
                                disabled={!isApproved}
                                className="whitespace-nowrap"
                              >
                                <Plus className="w-4 h-4 mr-1" />
                                Add All
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Line Items</CardTitle>
                  <CardDescription>Add parts, labor, and fees for the estimate</CardDescription>
                </div>
                <Button type="button" onClick={addLineItem} size="sm" disabled={isDisabled}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Item
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {lineItems.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Package className="w-12 h-12 mx-auto mb-3 text-gray-400" />

                  <Button onClick={addLineItem} variant="secondary" size="sm" className="mt-4" disabled={isDisabled}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add First Item
                  </Button>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[120px]">Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-[150px]">Recommendation</TableHead>
                        <TableHead className="w-[100px]">Qty</TableHead>
                        <TableHead className="w-[120px]">Rate</TableHead>
                        <TableHead className="w-[80px]">Tax</TableHead>
                        <TableHead className="w-[120px] text-right">Total</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineItems.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <Select
                              value={item.item_type}
                              onChange={(e) => updateLineItem(index, "item_type", e.target.value)}
                              className="text-sm"
                              disabled={isDisabled}
                            >
                              <option value="labor">Labor</option>
                              <option value="part">Part</option>
                              <option value="sublet">Sublet</option>
                              <option value="fee">Fee</option>
                              <option value="other">Other</option>
                            </Select>
                          </TableCell>

                          <TableCell>
                            {item.item_type === "part" ? (
                              <div className="space-y-1">
                                {item.manual_entry ? (
                                  <>
                                    <Input
                                      value={item.description}
                                      onChange={(e) => updateLineItem(index, "description", e.target.value)}
                                      placeholder="Enter part description..."
                                      className="text-sm"
                                      disabled={isDisabled}
                                    />
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        const currentRecommendationId = item.recommendation_id;
                                        updateLineItemFields(index, {
                                          manual_entry: false,
                                          recommendation_id: currentRecommendationId, // Preserve recommendation link
                                          part: undefined,
                                          part_number: "",
                                          description: "",
                                          unit_price: 0,
                                          quantity: 1,
                                          notes: currentRecommendationId ? item.notes : "",
                                        });
                                      }}
                                      className="h-7 px-2 text-xs"
                                      disabled={isDisabled}
                                    >
                                      Use list
                                    </Button>
                                  </>
                                ) : (
                                  <Select
                                    value={
                                      item.manual_entry
                                        ? "manual"
                                        : item.part_source === "rec" && item.recommendation_id
                                          ? `rec_${item.recommendation_id}`
                                          : item.part_source === "inv" && item.part
                                            ? `inv_${item.part}`
                                            : ""
                                    }
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      if (value.startsWith("rec_")) {
                                        const parts = value.split("_");
                                        const recId = parseInt(parts[1]);
                                        const partIndex = parts[2] ? parseInt(parts[2]) : 0;
                                        const selectedRec = recommendations.find((r: any) => r.id === recId);
                                        if (selectedRec && selectedRec.parts_needed && selectedRec.parts_needed.length > partIndex) {
                                          const selectedPart = selectedRec.parts_needed[partIndex];
                                          updateLineItemFields(index, {
                                            manual_entry: false,
                                            part_source: "rec",
                                            recommendation_id: recId,
                                            part: selectedPart.part_id || undefined,
                                            part_number: "",
                                            description: selectedPart.part_name || selectedRec.description,
                                            unit_price: Number(selectedPart.unit_cost || 0),
                                            quantity: selectedPart.quantity || 1,
                                            notes: `From recommendation: ${selectedRec.description}`,
                                          });
                                        }
                                      } else if (value.startsWith("inv_")) {
                                        const id = parseInt(value.replace("inv_", ""));
                                        const selectedPart = inventoryParts?.results?.find((p: any) => p.id === id);
                                        if (selectedPart) {
                                          const currentRecommendationId = item.recommendation_id;
                                          updateLineItemFields(index, {
                                            manual_entry: false,
                                            part_source: "inv",
                                            recommendation_id: currentRecommendationId,
                                            part: selectedPart.id,
                                            part_number: selectedPart.part_number || "",
                                            description: selectedPart.name || "Part",
                                            unit_price: parseFloat(selectedPart.cost_price || selectedPart.selling_price || '0'),
                                            quantity: 1,
                                            notes: currentRecommendationId ? item.notes : `From inventory: ${selectedPart.name}`,
                                          });
                                        }
                                      } else if (value === "manual") {
                                        const currentRecommendationId = item.recommendation_id;
                                        updateLineItemFields(index, {
                                          manual_entry: true,
                                          part_source: "manual",
                                          recommendation_id: currentRecommendationId,
                                          part: undefined,
                                          part_number: "",
                                          description: "",
                                          unit_price: 0,
                                          quantity: 1,
                                          notes: currentRecommendationId ? item.notes : "",
                                        });
                                      } else {
                                        const currentRecommendationId = item.recommendation_id;
                                        updateLineItemFields(index, {
                                          manual_entry: false,
                                          part_source: undefined,
                                          recommendation_id: currentRecommendationId,
                                          part: undefined,
                                          part_number: "",
                                          description: "",
                                          unit_price: 0,
                                          quantity: 1,
                                          notes: currentRecommendationId ? item.notes : "",
                                        });
                                      }
                                    }}
                                    className="text-sm"
                                    disabled={isDisabled}
                                  >
                                    <option value="">Select part...</option>
                                    {recommendations
                                      .filter((rec: any) => rec.parts_needed && rec.parts_needed.length > 0)
                                      .map((rec: any) => (
                                        <optgroup key={rec.id} label={rec.description}>
                                          {rec.parts_needed.map((part: any, partIndex: number) => (
                                            <option key={partIndex} value={`rec_${rec.id}_${partIndex}`}>
                                              {part.part_name || part.part_number || `Part ${partIndex + 1}`} - ${parseFloat(part.unit_cost || '0').toFixed(2)} {part.quantity > 1 ? `(x${part.quantity})` : ''}
                                            </option>
                                          ))}
                                        </optgroup>
                                      ))}
                                    <option value="">────────────</option>
                                    <option value="">Select from inventory...</option>
                                    {inventoryParts?.results?.map((p: any) => (
                                      <option key={p.id} value={`inv_${p.id}`}>
                                        {p.name} {p.part_number ? `(${p.part_number})` : ""} - ${parseFloat(p.cost_price || p.selling_price || '0').toFixed(2)}
                                      </option>
                                    ))}
                                    <option value="manual">Enter manually...</option>
                                  </Select>
                                )}
                              </div>
                            ) : (
                              <Input
                                value={item.description}
                                onChange={(e) => updateLineItem(index, "description", e.target.value)}
                                placeholder="Description..."
                                className="text-sm"
                                disabled={isDisabled}
                              />
                            )}
                          </TableCell>

                          <TableCell>
                            <select
                              value={item.recommendation_id ? String(item.recommendation_id) : ""}
                              onChange={(e) => {
                                const recId = e.target.value ? parseInt(e.target.value) : undefined;
                                const selectedRec = recId ? recommendations.find((r: any) => r.id === recId) : null;
                                // Update recommendation link without affecting part selection
                                // Preserve existing notes if they contain part info, otherwise update
                                const existingNotes = item.notes || "";
                                const hasPartInfo = existingNotes.includes("From inventory:") || existingNotes.includes("From recommendation:");
                                const newNotes = recId 
                                  ? (hasPartInfo 
                                      ? `${existingNotes} | Linked to: ${selectedRec?.description || ""}`
                                      : `Linked to: ${selectedRec?.description || ""}`)
                                  : (hasPartInfo ? existingNotes : "");
                                
                                updateLineItemFields(index, {
                                  recommendation_id: recId,
                                  notes: newNotes || "",
                                });
                              }}
                              className="text-sm w-full border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                              disabled={isDisabled}
                            >
                              <option value="">None</option>
                              {recommendations.map((rec: any) => (
                                <option key={rec.id} value={String(rec.id)}>
                                  {rec.description.length > 40 
                                    ? `${rec.description.substring(0, 40)}...` 
                                    : rec.description}
                                </option>
                              ))}
                            </select>
                          </TableCell>

                          <TableCell>
                            {item.item_type === "labor" ? (
                              <Input
                                type="number"
                                value={item.labor_hours || ""}
                                onChange={(e) => {
                                  const hours = parseFloat(e.target.value) || 0;
                                  updateLineItemFields(index, {
                                    labor_hours: hours,
                                    quantity: hours,
                                  });
                                }}
                                placeholder="Hours"
                                step="0.1"
                                min="0"
                                className="text-sm"
                                disabled={isDisabled}
                              />
                            ) : (
                              <Input
                                type="number"
                                value={item.quantity || ""}
                                onChange={(e) => updateLineItem(index, "quantity", parseFloat(e.target.value) || 0)}
                                placeholder="0"
                                step="0.01"
                                min="0"
                                className="text-sm"
                                disabled={isDisabled}
                              />
                            )}
                          </TableCell>

                          <TableCell>
                            {item.item_type === "labor" ? (
                              <Input
                                type="number"
                                value={item.labor_rate || ""}
                                onChange={(e) => {
                                  const rate = parseFloat(e.target.value) || 0;
                                  updateLineItemFields(index, {
                                    labor_rate: rate,
                                    unit_price: rate,
                                  });
                                }}
                                placeholder="Rate/hr"
                                step="0.01"
                                min="0"
                                className="text-sm"
                                disabled={isDisabled}
                              />
                            ) : (
                              <Input
                                type="number"
                                value={item.unit_price || ""}
                                onChange={(e) => updateLineItem(index, "unit_price", parseFloat(e.target.value) || 0)}
                                placeholder="0.00"
                                step="0.01"
                                min="0"
                                className="text-sm"
                                disabled={isDisabled}
                              />
                            )}
                          </TableCell>

                          <TableCell>
                            <div className="flex items-center justify-center">
                              <Checkbox
                                checked={item.is_taxable}
                                onCheckedChange={(checked) => updateLineItem(index, "is_taxable", checked)}
                                disabled={isDisabled}
                              />
                            </div>
                          </TableCell>

                          <TableCell className="text-right font-medium">
                            ${calculateLineItemTotal(item).toFixed(2)}
                          </TableCell>

                          <TableCell>
                            {lineItems.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeLineItem(index)}
                                disabled={isDisabled}
                              >
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">${subtotal.toFixed(2)}</span>
              </div>

              {taxConfig?.enabled && (
                <>
                  <div className="border-t pt-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase">Tax Breakdown</p>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">NHIL (2.5%)</span>
                      <span>${taxSummary.nhilAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">GETF (2.5%)</span>
                      <span>${taxSummary.getfundAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">COVID-19 (1%)</span>
                      <span>${taxSummary.hrlAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">VAT (15%)</span>
                      <span>${taxSummary.vatAmount.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="border-t pt-3">
                    <div className="flex justify-between text-sm font-medium">
                      <span className="text-muted-foreground">Total Tax</span>
                      <span>${taxSummary.totalTax.toFixed(2)}</span>
                    </div>
                  </div>
                </>
              )}

              <div className="border-t pt-3">
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>

              <div className="pt-4">
                <Button
                  type="button"
                  onClick={() => {
                    if (lineItems.length === 0) {
                      toast({
                        title: "No line items",
                        description: "Please add at least one line item before creating an estimate.",
                        variant: "destructive",
                      });
                      return;
                    }
                    if (!workOrder) {
                      toast({
                        title: "Work order not found",
                        description: "Unable to create estimate. Work order data is missing.",
                        variant: "destructive",
                      });
                      return;
                    }
                    setShowCreateEstimateDialog(true);
                  }}
                  className="w-full"
                  disabled={lineItems.length === 0 || createEstimateMutation.isPending || !canCreateEstimate}
                >
                  <Receipt className="w-4 h-4 mr-2" />
                  {hasExistingEstimate ? "Estimate Already Created" : "Create Estimate"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create Estimate Dialog */}
      <Dialog open={showCreateEstimateDialog} onOpenChange={setShowCreateEstimateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Estimate</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-gray-600">
              This will create a draft estimate with {lineItems.length} line item(s). You can edit it after creation.
            </p>
            {!workOrder && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                Warning: Work order data is missing. Estimate creation may fail.
              </div>
            )}
            {hasExistingEstimate && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-700">
                An estimate already exists for this work order. You cannot create another one.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowCreateEstimateDialog(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                
                if (lineItems.length === 0) {
                  toast({
                    title: "No line items",
                    description: "Please add at least one line item.",
                    variant: "destructive",
                  });
                  return;
                }

                if (!workOrder) {
                  toast({
                    title: "Work order missing",
                    description: "Work order data is not available.",
                    variant: "destructive",
                  });
                  return;
                }

                createEstimateMutation.mutate();
              }}
              disabled={createEstimateMutation.isPending || lineItems.length === 0 || !workOrder || !canCreateEstimate}
            >
              {createEstimateMutation.isPending ? "Creating..." : hasExistingEstimate ? "Estimate Already Exists" : "Create Estimate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Summary Tab Component
function SummaryTab({ 
  diagnosis, 
  workOrder,
  onUpdate,
  isUpdating,
  isDisabled = false,
}: { 
  diagnosis: Diagnosis; 
  workOrder: any;
  onUpdate: (data: Partial<Diagnosis>) => void;
  isUpdating: boolean;
  isDisabled?: boolean;
}) {
  const [notes, setNotes] = useState(diagnosis.diagnostic_notes || "");

  // Update notes when diagnosis changes
  React.useEffect(() => {
    setNotes(diagnosis.diagnostic_notes || "");
  }, [diagnosis.diagnostic_notes]);

  const handleSave = () => {
    onUpdate({
      diagnostic_notes: notes,
    });
  };
  // Calculate total time spent from time logs (only active periods: started/resumed -> paused/completed)
  const totalTimeSpent = React.useMemo(() => {
    if (!diagnosis.time_logs || !Array.isArray(diagnosis.time_logs) || diagnosis.time_logs.length === 0) {
      return null;
    }
    
    // Calculate total active time: sum periods from "started" or "resumed" to "paused" or "completed"
    // Sort logs by started_at to process chronologically
    const sortedLogs = [...diagnosis.time_logs].sort((a: any, b: any) => 
      new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
    );
    
    let totalMilliseconds = 0;
    let activeStartTime: Date | null = null;
    
    for (const log of sortedLogs) {
      const logTime = new Date(log.started_at);
      const stage = log.stage;
      
      // Start tracking active time when diagnosis starts or resumes
      if ((stage === 'started' || stage === 'resumed') && !activeStartTime) {
        activeStartTime = logTime;
      }
      
      // End tracking active time when paused or completed (and calculate duration)
      if ((stage === 'paused' || stage === 'completed') && activeStartTime && log.ended_at) {
        const endTime = new Date(log.ended_at);
        const duration = endTime.getTime() - activeStartTime.getTime();
        if (duration > 0) {
          totalMilliseconds += duration;
        }
        activeStartTime = null; // Reset for next active period
      }
      
      // Also handle duration_hours if available (backup calculation)
      if (log.duration_hours !== null && log.duration_hours !== undefined && 
          (stage === 'paused' || stage === 'completed')) {
        const hours = typeof log.duration_hours === 'string' 
          ? parseFloat(log.duration_hours) 
          : Number(log.duration_hours);
        if (!isNaN(hours) && hours > 0) {
          // Use duration_hours as backup/verification
          const msFromDuration = hours * 60 * 60 * 1000;
          // Prefer duration_hours if it's significantly different (means backend calculated it)
          if (Math.abs(msFromDuration - (log.ended_at && log.started_at ? 
              new Date(log.ended_at).getTime() - new Date(log.started_at).getTime() : 0)) < 1000) {
            // duration_hours matches calculated, use it
          }
        }
      }
    }
    
    // Handle case where diagnosis is still active (started/resumed but not paused/completed)
    // Only count ongoing time if diagnosis is NOT completed
    if (activeStartTime && diagnosis.status !== "completed") {
      const now = new Date();
      const duration = now.getTime() - activeStartTime.getTime();
      if (duration > 0) {
        totalMilliseconds += duration;
      }
    }
    
    // Convert milliseconds to hours
    const totalHours = totalMilliseconds / (1000 * 60 * 60);
    
    if (totalHours === 0 || isNaN(totalHours)) {
      return null;
    }
    
    // Format as hours and minutes if less than a day
    if (totalHours < 24) {
      const hours = Math.floor(totalHours);
      const minutes = Math.round((totalHours - hours) * 60);
      if (minutes === 0) {
        return `${hours}h`;
      }
      return `${hours}h ${minutes}m`;
    }
    
    // Format as days and hours if more than a day
    const days = Math.floor(totalHours / 24);
    const remainingHours = Math.floor(totalHours % 24);
    if (remainingHours === 0) {
      return `${days}d`;
    }
    return `${days}d ${remainingHours}h`;
  }, [diagnosis.time_logs, diagnosis.status]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <Clock className="w-5 h-5 mx-auto mb-1 text-gray-400" />
              <p className="text-xs text-gray-500 mb-1">Time Spent</p>
              <p className="font-semibold">
                {totalTimeSpent || "-"}
              </p>
            </div>
            <div className="text-center">
              <DollarSign className="w-5 h-5 mx-auto mb-1 text-gray-400" />
              <p className="text-xs text-gray-500 mb-1">Estimate Total</p>
              <p className="font-semibold">
                {diagnosis.total_estimated_cost && Number(diagnosis.total_estimated_cost) > 0 
                  ? `$${Number(diagnosis.total_estimated_cost).toFixed(2)}`
                  : "-"}
              </p>
            </div>
            <div className="text-center">
              <Wrench className="w-5 h-5 mx-auto mb-1 text-gray-400" />
              <p className="text-xs text-gray-500 mb-1">Items</p>
              <p className="font-semibold">{diagnosis.repair_recommendations?.length || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Diagnostic Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            className="min-h-48"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Enter diagnostic notes..."
            disabled={isDisabled}
          />
          <Button onClick={handleSave} disabled={isUpdating || isDisabled} size="sm">
            {isUpdating ? "Saving..." : "Save"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

