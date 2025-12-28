"use client";

import { useState } from "react";
import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { diagnosisApi, Diagnosis, DiagnosticCode, DiagnosticTest, DiagnosisPhoto } from "@/lib/api/diagnosis";
import { workordersApi } from "@/lib/api/workorders";
import { inventoryApi } from "@/lib/api/inventory";
import { billingApi } from "@/lib/api/billing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
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
  ArrowRight,
  ChevronRight,
  RefreshCw,
  Receipt,
  Package,
  Play,
  Pause,
  PlayCircle,
  CheckCircle2,
  User,
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
            <Link href="/dashboard" className="hover:text-blue-600 transition-colors">
              Dashboard
            </Link>
            <span>/</span>
            <Link href={`/workorders`} className="hover:text-blue-600 transition-colors">
              Work Orders
            </Link>
            <span>/</span>
            <Link href={`/workorders/${workOrderId}`} className="hover:text-blue-600 transition-colors">
              #{workOrderId}
            </Link>
            <span>/</span>
            <span className="text-gray-900 dark:text-gray-100 font-medium">Diagnosis</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
            Diagnosis & Repair Recommendations
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Workflow Action Buttons */}
          {diagnosis.status === "not_started" && (
            <Button
              onClick={() => startDiagnosisMutation.mutate()}
              disabled={startDiagnosisMutation.isPending}
              size="sm"
              className="h-9"
              variant="default"
            >
              <Play className="w-3.5 h-3.5 mr-2" />
              {startDiagnosisMutation.isPending ? "Starting..." : "Start Diagnosis"}
            </Button>
          )}
          {diagnosis.status === "in_progress" && (
            <>
              <Button
                onClick={() => setShowPauseDialog(true)}
                disabled={pauseDiagnosisMutation.isPending}
                size="sm"
                className="h-9"
                variant="outline"
              >
                <Pause className="w-3.5 h-3.5 mr-2" />
                Pause
              </Button>
              <Button
                onClick={() => completeDiagnosisMutation.mutate()}
                disabled={completeDiagnosisMutation.isPending}
                size="sm"
                className="h-9 bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle className="w-3.5 h-3.5 mr-2" />
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
                className="h-9"
                variant="default"
              >
                <PlayCircle className="w-3.5 h-3.5 mr-2" />
                {resumeDiagnosisMutation.isPending ? "Resuming..." : "Resume"}
              </Button>
              <Button
                onClick={() => completeDiagnosisMutation.mutate()}
                disabled={completeDiagnosisMutation.isPending}
                size="sm"
                className="h-9 bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle className="w-3.5 h-3.5 mr-2" />
                {completeDiagnosisMutation.isPending ? "Completing..." : "Complete"}
              </Button>
            </>
          )}
          {diagnosis.status === "completed" && (
            <Button variant="outline" size="sm" className="h-9 cursor-default bg-green-50 text-green-700 border-green-200 hover:bg-green-50">
              <CheckCircle2 className="w-3.5 h-3.5 mr-2" />
              Completed
            </Button>
          )}
        </div>
      </div>

      {/* Workflow Status & Info Banner */}
      <Card className="border-none shadow-sm bg-gray-50/50 dark:bg-gray-800/50">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Badge
                variant="outline"
                className={`text-sm py-1 px-3 ${diagnosis.status === 'in_progress' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                  diagnosis.status === 'paused' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                    diagnosis.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200' :
                      'bg-gray-100 text-gray-700 border-gray-200'
                  }`}
              >
                <StatusIcon className="w-3.5 h-3.5 mr-1.5" />
                {statusConfig.label}
              </Badge>

              <div className="flex items-center gap-4 text-sm text-gray-500">
                {diagnosis.technician_name && (
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    <span>{diagnosis.technician_name}</span>
                  </div>
                )}
                {diagnosis.diagnostic_time_formatted && (
                  <div className="flex items-center gap-1.5 border-l pl-4 border-gray-200 dark:border-gray-700">
                    <Clock className="w-3.5 h-3.5" />
                    <span className="font-mono">{diagnosis.diagnostic_time_formatted}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Compact Workflow Stages */}
            <div className="flex items-center gap-1 text-[10px] uppercase font-semibold tracking-wider text-gray-400">
              <span className={diagnosis.status !== 'not_started' ? "text-blue-600" : ""}>Start</span>
              <span className="mx-1">→</span>
              <span className={['in_progress', 'paused', 'completed'].includes(diagnosis.status) ? "text-blue-600" : ""}>In Progress</span>
              <span className="mx-1">→</span>
              <span className={diagnosis.status === 'completed' ? "text-green-600" : ""}>Done</span>
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
              variant="ghost"
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

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-none shadow-sm bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Diagnostic Codes</span>
            <div className="flex items-end justify-between">
              <span className="text-xl font-bold text-gray-900 dark:text-gray-100">{codesCount}</span>
              <Code className="w-4 h-4 text-blue-500 mb-1" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Tests Run</span>
            <div className="flex items-end justify-between">
              <span className="text-xl font-bold text-gray-900 dark:text-gray-100">{testsCount}</span>
              <TestTube className="w-4 h-4 text-purple-500 mb-1" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Photos</span>
            <div className="flex items-end justify-between">
              <span className="text-xl font-bold text-gray-900 dark:text-gray-100">{photosCount}</span>
              <Camera className="w-4 h-4 text-orange-500 mb-1" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Recommendations</span>
            <div className="flex items-end justify-between">
              <span className="text-xl font-bold text-gray-900 dark:text-gray-100">{recommendationsCount}</span>
              <Wrench className="w-4 h-4 text-indigo-500 mb-1" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="border-b border-gray-200 dark:border-gray-800 mb-6">
          <TabsList className="flex w-full h-auto p-0 bg-transparent gap-6">
            <TabsTrigger
              value="complaint"
              className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 py-3 transition-all"
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Complaint
            </TabsTrigger>
            <TabsTrigger
              value="codes"
              className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 py-3 transition-all"
            >
              <Code className="w-4 h-4 mr-2" />
              Codes
              {codesCount > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px] min-w-5 justify-center">
                  {codesCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="tests"
              className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 py-3 transition-all"
            >
              <TestTube className="w-4 h-4 mr-2" />
              Tests
              {testsCount > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px] min-w-5 justify-center">
                  {testsCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="photos"
              className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 py-3 transition-all"
            >
              <Camera className="w-4 h-4 mr-2" />
              Photos
              {photosCount > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px] min-w-5 justify-center">
                  {photosCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="parts"
              className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 py-3 transition-all"
            >
              <Package className="w-4 h-4 mr-2" />
              Estimate
            </TabsTrigger>
            <TabsTrigger
              value="recommendations"
              className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 py-3 transition-all"
            >
              <Wrench className="w-4 h-4 mr-2" />
              Recs
              {recommendationsCount > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px] min-w-5 justify-center">
                  {recommendationsCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="summary"
              className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 py-3 transition-all"
            >
              <FileText className="w-4 h-4 mr-2" />
              Summary
            </TabsTrigger>
          </TabsList>
        </div>

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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="border-none shadow-sm bg-gray-50/50 dark:bg-gray-800/50">
        <CardHeader className="pb-3 border-b bg-gray-50/50 dark:bg-gray-800/50">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-gray-700">Customer Complaint</CardTitle>
          <CardDescription className="text-xs">What the customer reported</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="space-y-4">
            <Textarea
              className="min-h-[150px] bg-white dark:bg-gray-900 resize-none focus-visible:ring-1"
              value={customerComplaint}
              onChange={(e) => setCustomerComplaint(e.target.value)}
              placeholder="Enter details about the customer's complaint..."
              disabled={isDisabled}
            />
            <Button onClick={handleSave} disabled={isUpdating || isDisabled} size="sm" className="w-full h-9">
              {isUpdating ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card className="border-none shadow-sm bg-gray-50/50 dark:bg-gray-800/50">
        <CardHeader className="pb-3 border-b bg-gray-50/50 dark:bg-gray-800/50">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-gray-700">Initial Observations</CardTitle>
          <CardDescription className="text-xs">Technician's initial visual check</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <Textarea
            className="min-h-[150px] bg-white dark:bg-gray-900 resize-none focus-visible:ring-1"
            value={initialObservations}
            onChange={(e) => setInitialObservations(e.target.value)}
            placeholder="Record any visual observations or notes..."
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
      <Card className="border-none shadow-sm bg-gray-50/50 dark:bg-gray-800/50">
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b bg-gray-50/50 dark:bg-gray-800/50">
          <div className="space-y-1">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-gray-700">Diagnostic Tests</CardTitle>
            <CardDescription className="text-xs">Tests performed on the vehicle</CardDescription>
          </div>
          <Button onClick={() => setShowAddDialog(true)} size="sm" className="h-8" disabled={isDisabled}>
            <Plus className="w-3.5 h-3.5 mr-2" />
            Add Test
          </Button>
        </CardHeader>
        <CardContent className="pt-4">
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
              <Button onClick={() => setShowAddDialog(true)} variant="outline" size="sm" className="mt-4" disabled={isDisabled}>
                <Plus className="w-4 h-4 mr-2" />
                Add First Test
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tests.map((test) => (
                <div
                  key={test.id}
                  className="group p-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-lg hover:shadow-md transition-all duration-200"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-normal text-gray-500">
                          {test.category_display || test.category}
                        </Badge>
                        {test.performed_at && (
                          <span className="text-[10px] text-gray-400">
                            {format(new Date(test.performed_at), "MMM d, HH:mm")}
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-sm truncate text-gray-900 dark:text-gray-100">{test.test_name}</p>
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      <Badge
                        variant={
                          test.status === "pass"
                            ? "default" // Map to success in UI
                            : test.status === "fail"
                              ? "danger"
                              : "secondary"
                        }
                        className={`text-xs capitalize ${test.status === 'pass' ? 'bg-green-100 text-green-700 hover:bg-green-200 border-green-200' : ''}`}
                      >
                        {test.status_display || test.status}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-2 mb-3">
                    {test.test_procedure && (
                      <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                        <span className="font-medium text-gray-700 block mb-0.5">Procedure:</span>
                        <p className="line-clamp-2">{test.test_procedure}</p>
                      </div>
                    )}
                    {test.actual_result && (
                      <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                        <span className="font-medium text-gray-700 block mb-0.5">Result:</span>
                        <p className="line-clamp-2">{test.actual_result}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-gray-500 hover:text-blue-600"
                      onClick={() => setEditingTest(test)}
                      disabled={isDisabled}
                    >
                      <Edit className="w-3.5 h-3.5 mr-1.5" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-gray-500 hover:text-red-600"
                      onClick={() => {
                        if (confirm("Delete this test?")) {
                          deleteMutation.mutate(test.id);
                        }
                      }}
                      disabled={isDisabled}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                      Delete
                    </Button>
                  </div>
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0 bg-white dark:bg-gray-900">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-xl font-bold text-gray-900 dark:text-white">
            {test ? "Edit Diagnostic Test" : "Add Diagnostic Test"}
          </DialogTitle>
          <DialogDescription>
            {test ? "Modify the test details and results." : "Record a new diagnostic test and its results."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-6">
            {/* Template Selection */}
            {!test && (
              <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 rounded-lg p-4">
                <Label className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2 block">
                  Quick Start from Template
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 text-blue-400 w-4 h-4" />
                  <Input
                    placeholder="Search test procedure library..."
                    value={templateSearchQuery || formData.test_name}
                    onChange={(e) => {
                      setTemplateSearchQuery(e.target.value);
                      if (!templateSearchQuery) {
                        setFormData({ ...formData, test_name: e.target.value });
                      }
                    }}
                    className="pl-9 border-blue-200 focus-visible:ring-blue-500 bg-white dark:bg-gray-900"
                  />
                  {isSearchingTemplates && (
                    <div className="absolute right-3 top-2.5">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    </div>
                  )}
                </div>
                {templateResults.length > 0 && (
                  <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 shadow-sm overflow-hidden z-10 relative">
                    <div className="p-2 text-xs font-semibold text-gray-500 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700">
                      Recommended Templates
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {templateResults.map((template: any) => (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => handleSelectTemplate(template)}
                          className="w-full text-left p-3 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-b border-gray-50 dark:border-gray-800 last:border-b-0 transition-colors group"
                        >
                          <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 group-hover:text-blue-700 dark:group-hover:text-blue-300">
                            {template.name}
                          </div>
                          <div className="text-xs text-gray-500 mt-1 line-clamp-1">
                            {template.description || template.test_procedure}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="test_name" className="text-sm font-medium">Test Name <span className="text-red-500">*</span></Label>
                <Input
                  id="test_name"
                  value={formData.test_name}
                  onChange={(e) => setFormData({ ...formData, test_name: e.target.value })}
                  placeholder="e.g., Battery Voltage Test"
                  required
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category" className="text-sm font-medium">Category <span className="text-red-500">*</span></Label>
                <Select
                  id="category"
                  value={formData.category}
                  onChange={(e) => {
                    setFormData({ ...formData, category: e.target.value as any });
                    setTemplateResults([]);
                  }}
                  required
                  className="h-9"
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
              <Label htmlFor="test_procedure" className="text-sm font-medium">Test Procedure</Label>
              <Textarea
                id="test_procedure"
                value={formData.test_procedure}
                onChange={(e) => setFormData({ ...formData, test_procedure: e.target.value })}
                placeholder="Step-by-step procedure..."
                rows={4}
                className="resize-none min-h-[100px]"
              />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="expected_result" className="text-sm font-medium">Expected Result</Label>
                <Textarea
                  id="expected_result"
                  value={formData.expected_result}
                  onChange={(e) => setFormData({ ...formData, expected_result: e.target.value })}
                  placeholder="What is the expected outcome?"
                  rows={2}
                  className="resize-none"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="actual_result" className="text-sm font-medium">Actual Result</Label>
                <Textarea
                  id="actual_result"
                  value={formData.actual_result}
                  onChange={(e) => setFormData({ ...formData, actual_result: e.target.value })}
                  placeholder="What was the actual outcome?"
                  rows={2}
                  className="resize-none"
                />
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tools_used" className="text-sm font-medium">Tools Used</Label>
                <Input
                  id="tools_used"
                  value={formData.tools_used}
                  onChange={(e) => setFormData({ ...formData, tools_used: e.target.value })}
                  placeholder="e.g., Multimeter, Scanner"
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status" className="text-sm font-medium">Status <span className="text-red-500">*</span></Label>
                <Select
                  id="status"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  required
                  className="h-9"
                >
                  <option value="pass">Pass</option>
                  <option value="fail">Fail</option>
                  <option value="inconclusive">Inconclusive</option>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 mt-auto">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isLoading ? "Saving..." : test ? "Update Test" : "Add Test"}
            </Button>
          </div>
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
      <Card className="border-none shadow-sm bg-gray-50/50 dark:bg-gray-800/50">
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b bg-gray-50/50 dark:bg-gray-800/50">
          <div className="space-y-1">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-gray-700">Repair Recommendations</CardTitle>
            <CardDescription className="text-xs">
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
                  className="h-8 bg-green-600 hover:bg-green-700 text-white"
                  disabled={approveMutation.isPending}
                >
                  <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                  Approve ({selectedRecommendations.size})
                </Button>
                <Button
                  onClick={() => approveMutation.mutate({
                    recommendationIds: Array.from(selectedRecommendations),
                    approved: false,
                  })}
                  size="sm"
                  variant="outline"
                  className="h-8 text-red-600 border-red-200 hover:bg-red-50"
                  disabled={approveMutation.isPending}
                >
                  <X className="w-3.5 h-3.5 mr-1.5" />
                  Decline
                </Button>
              </>
            )}
            {approvedRecommendations.length > 0 && (
              <Button
                onClick={() => convertToTasksMutation.mutate(undefined)}
                size="sm"
                className="h-8"
                variant="default"
                disabled={convertToTasksMutation.isPending || convertedRecommendations.length === approvedRecommendations.length}
              >
                <ListChecks className="w-3.5 h-3.5 mr-1.5" />
                Convert to Tasks
              </Button>
            )}
            <Button onClick={() => setShowAddDialog(true)} size="sm" className="h-8" disabled={isDisabled}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {recommendations.length > 0 ? (
            <div className="space-y-6">
              {/* Unapproved Recommendations */}
              {unapprovedRecommendations.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
                    <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">Pending Approval ({unapprovedRecommendations.length})</h3>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedRecommendations.size === unapprovedRecommendations.length && unapprovedRecommendations.length > 0}
                        onCheckedChange={handleSelectAll}
                        className="h-4 w-4"
                      />
                      <span className="text-xs text-gray-500">Select All</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {unapprovedRecommendations.map((rec: any) => (
                      <div
                        key={rec.id}
                        className={`group p-4 bg-white dark:bg-gray-900 border rounded-lg transition-all duration-200 hover:shadow-md ${selectedRecommendations.has(rec.id) ? "border-blue-500 ring-1 ring-blue-500 bg-blue-50/10" : "border-gray-100 dark:border-gray-800"
                          }`}
                      >
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={selectedRecommendations.has(rec.id)}
                            onCheckedChange={() => handleToggleSelection(rec.id)}
                            className="mt-1 h-4 w-4"
                          />
                          <div className="flex-1 min-w-0 space-y-3">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant={rec.priority === 'critical' ? 'danger' : rec.priority === 'necessary' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0 h-5 font-medium capitalize">
                                  {rec.priority_display || rec.priority}
                                </Badge>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-normal text-gray-500 capitalize">
                                  {rec.recommendation_type_display || rec.recommendation_type}
                                </Badge>
                              </div>
                              {rec.estimated_total_cost && Number(rec.estimated_total_cost) > 0 && (
                                <span className="text-sm font-bold text-gray-900 dark:text-gray-100 font-mono">
                                  ${Number(rec.estimated_total_cost).toFixed(2)}
                                </span>
                              )}
                            </div>

                            <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2 leading-relaxed">{rec.description}</p>

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
                                  <div className="text-xs bg-gray-50 dark:bg-gray-800/50 rounded p-2 text-gray-600 dark:text-gray-400 space-y-1">
                                    {/* Old parts_needed data */}
                                    {rec.parts_needed && Array.isArray(rec.parts_needed) && rec.parts_needed.length > 0 && (
                                      <div className="flex items-center gap-1.5">
                                        <Package className="w-3 h-3 text-gray-400" />
                                        <span>{rec.parts_needed.length} part(s) • ${Number(rec.estimated_parts_cost || 0).toFixed(2)}</span>
                                      </div>
                                    )}
                                    {/* Linked parts from Estimate tab */}
                                    {linkedParts.length > 0 && (
                                      <div className="flex items-center gap-1.5">
                                        <Package className="w-3 h-3 text-gray-400" />
                                        <span>{linkedParts.length} part(s) • ${linkedPartsTotal.toFixed(2)}</span>
                                      </div>
                                    )}
                                    {/* Old labor data */}
                                    {rec.estimated_labor_hours && parseFloat(rec.estimated_labor_hours) > 0 && (
                                      <div className="flex items-center gap-1.5">
                                        <Clock className="w-3 h-3 text-gray-400" />
                                        <span>{parseFloat(rec.estimated_labor_hours).toFixed(1)}h • ${Number(rec.estimated_labor_cost || 0).toFixed(2)}</span>
                                      </div>
                                    )}
                                    {/* Linked labor from Estimate tab */}
                                    {linkedLabor.length > 0 && (
                                      <div className="flex items-center gap-1.5">
                                        <Clock className="w-3 h-3 text-gray-400" />
                                        <span>{linkedLaborHours.toFixed(1)}h • ${linkedLaborTotal.toFixed(2)}</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              } else {
                                return (
                                  <div className="text-xs text-gray-400 italic px-2">No estimate details added</div>
                                );
                              }
                            })()}

                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                onClick={() => {
                                  setEditingRecommendation(rec);
                                  setShowAddDialog(true);
                                }}
                                disabled={rec.customer_approved || !!rec.converted_to_task_id || isDisabled}
                              >
                                <Edit className="w-3.5 h-3.5 mr-1" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => {
                                  if (confirm(`Delete recommendation: "${rec.description}"?`)) {
                                    deleteMutation.mutate(rec.id);
                                  }
                                }}
                                disabled={deleteMutation.isPending || !!rec.converted_to_task_id || isDisabled}
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-1" />
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
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 border-b border-gray-100 dark:border-gray-800 pb-2">
                    Approved - Ready to Convert ({approvedRecommendations.filter((r: any) => !r.converted_to_task_id).length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {approvedRecommendations
                      .filter((r: any) => !r.converted_to_task_id)
                      .map((rec: any) => (
                        <div key={rec.id} className="p-4 bg-green-50/30 border border-green-100 dark:border-green-900/30 rounded-lg space-y-3">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant={rec.priority === 'critical' ? 'danger' : rec.priority === 'necessary' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0 h-5 font-medium capitalize">
                                {rec.priority_display || rec.priority}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-normal text-gray-500 bg-white">
                                {rec.recommendation_type_display || rec.recommendation_type}
                              </Badge>
                              <Badge variant="default" className="text-[10px] px-1.5 py-0 h-5 bg-green-600 hover:bg-green-700 border-transparent text-white">
                                ✓ Approved
                              </Badge>
                            </div>
                            {rec.estimated_total_cost && Number(rec.estimated_total_cost) > 0 && (
                              <span className="text-sm font-bold text-gray-900 font-mono">
                                ${Number(rec.estimated_total_cost).toFixed(2)}
                              </span>
                            )}
                          </div>

                          <p className="text-sm text-gray-700 line-clamp-2">{rec.description}</p>

                          {/* Parts and Labor Details */}
                          {(rec.parts_needed && Array.isArray(rec.parts_needed) && rec.parts_needed.length > 0) ||
                            (rec.estimated_labor_hours && parseFloat(rec.estimated_labor_hours) > 0) ? (
                            <div className="text-xs bg-white/50 rounded p-2 text-gray-600 space-y-1 border border-green-100/50">
                              {rec.parts_needed && Array.isArray(rec.parts_needed) && rec.parts_needed.length > 0 && (
                                <div className="flex items-center gap-1.5">
                                  <Package className="w-3 h-3 text-green-600/70" />
                                  <span>{rec.parts_needed.length} part(s) • ${Number(rec.estimated_parts_cost || 0).toFixed(2)}</span>
                                </div>
                              )}
                              {rec.estimated_labor_hours && parseFloat(rec.estimated_labor_hours) > 0 && (
                                <div className="flex items-center gap-1.5">
                                  <Clock className="w-3 h-3 text-green-600/70" />
                                  <span>{parseFloat(rec.estimated_labor_hours).toFixed(1)}h • ${Number(rec.estimated_labor_cost || 0).toFixed(2)}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-xs text-gray-400 italic px-2">No estimate details</div>
                          )}

                          <div className="flex justify-end pt-2 border-t border-green-100/50">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              onClick={() => {
                                setEditingRecommendation(rec);
                                setShowAddDialog(true);
                              }}
                              disabled={!!rec.converted_to_task_id || isDisabled}
                            >
                              <Edit className="w-3.5 h-3.5 mr-1" />
                              Edit
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Converted to Tasks */}
              {convertedRecommendations.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 border-b border-gray-100 dark:border-gray-800 pb-2">
                    Converted to Tasks ({convertedRecommendations.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {convertedRecommendations.map((rec: any) => (
                      <div key={rec.id} className="p-4 bg-gray-50 border border-gray-200 dark:bg-gray-800 dark:border-gray-700 rounded-lg space-y-3 opacity-75">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 font-normal">
                              {rec.priority_display || rec.priority}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-normal bg-white dark:bg-gray-900">
                              ✓ Task Created
                            </Badge>
                          </div>
                          {rec.estimated_total_cost && Number(rec.estimated_total_cost) > 0 && (
                            <span className="text-sm font-bold text-gray-500 font-mono">
                              ${Number(rec.estimated_total_cost).toFixed(2)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-2">{rec.description}</p>

                        {rec.converted_to_task_id && (
                          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                            <Link href={`/workorders/${workOrderId}`} className="flex items-center text-xs font-medium text-blue-600 hover:underline">
                              <span>View Task #{rec.converted_to_task_id}</span>
                              <ArrowRight className="w-3 h-3 ml-1" />
                            </Link>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-16 bg-gray-50/50 dark:bg-gray-800/50 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
              <Wrench className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">No recommendations yet</h3>
              <p className="text-xs text-gray-500 mb-4 max-w-sm mx-auto">Add repair recommendations to suggest parts and labor services for this diagnosis.</p>
              <Button onClick={() => setShowAddDialog(true)} variant="outline" size="sm" className="h-8">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
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
      <DialogContent className="max-w-2xl bg-white dark:bg-gray-900 gap-0 p-0 border border-gray-100 dark:border-gray-800 shadow-xl sm:rounded-xl">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-xl font-bold text-gray-900 dark:text-white">
            {recommendation ? "Edit Recommendation" : "Add Recommendation"}
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500">
            {recommendation ? "Update the details below." : "Add a new repair recommendation for this vehicle."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="p-6 pt-4 space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="recommendation_type" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Type <span className="text-red-500">*</span>
                </Label>
                <Select
                  id="recommendation_type"
                  value={formData.recommendation_type}
                  onChange={(e) => setFormData({ ...formData, recommendation_type: e.target.value as any })}
                  required
                  className="h-9 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
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
                <Label htmlFor="priority" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Priority <span className="text-red-500">*</span>
                </Label>
                <Select
                  id="priority"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                  required
                  className="h-9 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                >
                  <option value="critical">Critical</option>
                  <option value="necessary">Necessary</option>
                  <option value="recommended">Recommended</option>
                  <option value="advisory">Advisory</option>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Description <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe the recommended repair or service..."
                className="min-h-[120px] resize-none bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>

            <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 rounded-lg p-3 flex gap-3">
              <div className="shrink-0 mt-0.5">
                <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-0.5">Parts & Labor</h4>
                <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                  You can add detailed parts and labor estimates to this recommendation in the <strong>Estimate Tab</strong> after creating it.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 p-6 pt-2 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 rounded-b-xl">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="hover:bg-gray-200/50">
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 text-white min-w-[100px]">
              {isLoading ? "Saving..." : recommendation ? "Update" : "Add Recommendation"}
            </Button>
          </div>
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
      <Card className="border-none shadow-sm bg-gray-50/50 dark:bg-gray-800/50">
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b bg-gray-50/50 dark:bg-gray-800/50">
          <div className="space-y-1">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-gray-700">Visual Evidence</CardTitle>
            <CardDescription className="text-xs">
              {photos.length} photo{photos.length !== 1 ? "s" : ""} uploaded for this diagnosis
            </CardDescription>
          </div>
          <div className="flex items-center space-x-2">
            <Button onClick={() => setShowAddDialog(true)} size="sm" className="h-8" disabled={isDisabled}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add Photo
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 text-red-600 text-sm rounded-lg flex items-center justify-center">
              Failed to load photos. Please try again.
            </div>
          ) : photos.length === 0 ? (
            <div className="text-center py-16 bg-gray-50/50 dark:bg-gray-800/50 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
              <Camera className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">No photos yet</h3>
              <p className="text-xs text-gray-500 mb-4 max-w-sm mx-auto">Upload photos to document vehicle condition, evidence, or parts.</p>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setShowAddDialog(true)}
                disabled={isDisabled}
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Upload Photo
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="group relative border border-gray-100 dark:border-gray-800 rounded-lg overflow-hidden bg-white dark:bg-gray-900 hover:shadow-lg transition-all duration-200"
                >
                  <div className="aspect-square relative overflow-hidden bg-gray-100 dark:bg-gray-800">
                    {photo.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photo.photo_url}
                        alt={photo.caption || "Diagnosis photo"}
                        className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                        onClick={() => window.open(photo.photo_url, '_blank')}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <Camera className="w-8 h-8 opacity-20" />
                      </div>
                    )}
                    {/* Overlay Gradient */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                    {/* Actions */}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                      <Button
                        variant="destructive"
                        size="icon"
                        className="h-7 w-7 rounded-full shadow-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("Delete this photo?")) {
                            deleteMutation.mutate(photo.id);
                          }
                        }}
                        disabled={isDisabled}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    {/* Badge */}
                    {photo.photo_type && (
                      <div className="absolute top-2 left-2">
                        <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-white/90 dark:bg-black/90 backdrop-blur-sm shadow-sm capitalize">
                          {photo.photo_type.replace('_', ' ')}
                        </Badge>
                      </div>
                    )}

                  </div>

                  <div className="p-3">
                    <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate" title={photo.caption || "Untitled"}>
                      {photo.caption || <span className="text-gray-400 italic">No caption</span>}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-1">
                      {new Date(photo.created_at).toLocaleDateString()}
                    </p>
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
      <DialogContent className="max-w-2xl bg-white dark:bg-gray-900 gap-0 p-0 border border-gray-100 dark:border-gray-800 shadow-xl sm:rounded-xl">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-xl font-bold text-gray-900 dark:text-white">Upload Diagnosis Photo</DialogTitle>
          <DialogDescription className="text-sm text-gray-500">
            Add photos to document findings, evidence, or repair verification.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="p-6 pt-4 space-y-5">
            {/* File Upload */}
            <div className="space-y-2">
              <Label htmlFor="photo" className="text-sm font-medium text-gray-700 dark:text-gray-300">Photo <span className="text-red-500">*</span></Label>
              <input
                id="photo"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                required
              />
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 group ${preview ? "border-blue-200 bg-blue-50/10" : "border-gray-200 hover:border-blue-400 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-blue-500 dark:hover:bg-gray-800"}`}
                onClick={() => document.getElementById("photo")?.click()}
              >
                {preview ? (
                  <div className="space-y-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <div className="relative inline-block rounded-lg overflow-hidden shadow-sm">
                      <img
                        src={preview}
                        alt="Preview"
                        className="max-h-64 mx-auto object-contain"
                      />
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">{selectedFile?.name}</span>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFile(null);
                          setPreview(null);
                        }}
                      >
                        Change
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="py-4">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                      <Camera className="w-8 h-8 text-blue-500 dark:text-blue-400" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Click to upload or drag and drop
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        PNG, JPG, GIF up to 10MB
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Caption */}
              <div className="space-y-2">
                <Label htmlFor="caption" className="text-sm font-medium text-gray-700 dark:text-gray-300">Caption</Label>
                <Input
                  id="caption"
                  value={formData.caption}
                  onChange={(e) => setFormData({ ...formData, caption: e.target.value })}
                  placeholder="Describe what this photo shows..."
                  className="h-9 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus:border-blue-500"
                />
              </div>

              {/* Photo Type */}
              <div className="space-y-2">
                <Label htmlFor="photo_type" className="text-sm font-medium text-gray-700 dark:text-gray-300">Photo Type <span className="text-red-500">*</span></Label>
                <Select
                  id="photo_type"
                  value={formData.photo_type}
                  onChange={(e) =>
                    setFormData({ ...formData, photo_type: e.target.value as any })
                  }
                  required
                  className="h-9 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                >
                  <option value="problem">Problem</option>
                  <option value="evidence">Evidence</option>
                  <option value="component">Component</option>
                  <option value="before">Before Repair</option>
                  <option value="after">After Repair</option>
                  <option value="damage">Damage</option>
                  <option value="test_result">Test Result</option>
                  <option value="other">Other</option>
                </Select>
              </div>
            </div>

          </div>

          <div className="flex items-center justify-end gap-3 p-6 pt-2 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 rounded-b-xl">
            <Button type="button" variant="ghost" onClick={handleClose} className="hover:bg-gray-200/50">
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending || !selectedFile} className="bg-blue-600 hover:bg-blue-700 text-white min-w-[100px]">
              {createMutation.isPending ? "Uploading..." : "Upload Photo"}
            </Button>
          </div>
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
            <Card className="border-none shadow-sm bg-blue-50/50 dark:bg-blue-900/10">
              <CardHeader className="pb-3 border-b border-blue-100 dark:border-blue-800">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base flex items-center gap-2 text-blue-900 dark:text-blue-100">
                      <Wrench className="w-4 h-4" />
                      Repair Recommendations
                    </CardTitle>
                    <CardDescription className="text-xs text-blue-700 dark:text-blue-300">
                      Select recommendations to add parts and labor to the estimate
                      {approvedRecommendations.length > 0 && (
                        <Badge variant="secondary" className="ml-2 bg-blue-100 text-blue-800 border-none">
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
                      className="bg-blue-600 hover:bg-blue-700 h-8 text-xs"
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
                        className={`p-4 bg-white rounded-lg border-2 transition-all ${isApproved
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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="border-none shadow-sm bg-gray-50/50 dark:bg-gray-800/50">
        <CardHeader className="pb-3 border-b bg-gray-50/50 dark:bg-gray-800/50">
          <CardTitle className="text-base font-semibold">Overview</CardTitle>
          <CardDescription>Key metrics for this diagnosis</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-3 gap-6">
            <div className="flex flex-col items-center justify-center p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm transition-all hover:shadow-md">
              <div className="p-2 mb-3 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
                <Clock className="w-5 h-5" />
              </div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Time Spent</p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {totalTimeSpent || "-"}
              </p>
            </div>
            <div className="flex flex-col items-center justify-center p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm transition-all hover:shadow-md">
              <div className="p-2 mb-3 rounded-full bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400">
                <DollarSign className="w-5 h-5" />
              </div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Estimate Total</p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {diagnosis.total_estimated_cost && Number(diagnosis.total_estimated_cost) > 0
                  ? `$${Number(diagnosis.total_estimated_cost).toFixed(2)}`
                  : "-"}
              </p>
            </div>
            <div className="flex flex-col items-center justify-center p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm transition-all hover:shadow-md">
              <div className="p-2 mb-3 rounded-full bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400">
                <Wrench className="w-5 h-5" />
              </div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Items</p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{diagnosis.repair_recommendations?.length || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm h-full flex flex-col">
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-base font-semibold">Diagnostic Notes</CardTitle>
          <CardDescription>Detailed findings and observations</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 pt-4 space-y-4 flex flex-col">
          <Textarea
            className="flex-1 min-h-[200px] resize-none bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800 focus:bg-white dark:focus:bg-gray-950 transition-colors"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Enter detailed diagnostic notes here..."
            disabled={isDisabled}
          />
          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={isUpdating || isDisabled}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 min-w-[100px]"
            >
              {isUpdating ? "Saving..." : "Save Notes"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

