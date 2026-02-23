"use client";

import { useState } from "react";
import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { diagnosisApi, Diagnosis, DiagnosticCode, DiagnosticTest, DiagnosisPhoto } from "@/lib/api/diagnosis";
import { workordersApi } from "@/lib/api/workorders";
import { inventoryApi } from "@/lib/api/inventory";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { billingApi } from "@/lib/api/billing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { computeGhanaTaxBreakdown } from "@/lib/utils/tax";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useToast } from "@/lib/hooks/useToast";
import {
  ArrowLeft,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  AlertCircle,
  CheckCircle,
  Clock,
  DollarSign,
  Edit,
  Plus,
  Wrench,
  FileText,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Settings,
  ListChecks,
  MessageSquare,
  Code,
  TestTube,
  Camera,
  Trash2,
  X,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Search,
  ArrowRight,
  Printer,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ChevronRight,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  RefreshCw,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Receipt,
  Package,
  Play,
  Pause,
  PlayCircle,
  CheckCircle2,
  User,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { CodesTab } from "./components/CodesTab";
import { ComplaintTab } from "./components/ComplaintTab";
import { TestsTab } from "./components/TestsTab";
import { RecommendationDialog } from "./components/RecommendationDialog";
import { PartsRequiredTab } from "./components/PartsRequiredTab";


export default function DiagnosisPage() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { formatCurrency } = useCurrency();
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
        let existing = await diagnosisApi.getByWorkOrder(workOrderId);

        if (!existing && workOrder) {
          // Auto-create diagnosis if it doesn't exist
          try {
            existing = await diagnosisApi.create({
              work_order: workOrderId,
              customer_complaint: workOrder.customer_concerns || "",
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } catch (error: any) {
            console.error("Failed to update customer complaint:", error);
          }
        }

        return existing;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
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
              <p className="text-sm text-muted-foreground">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(diagnosisError as any)?.response?.data?.detail ||
                  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
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
            <p className="text-muted-foreground">No diagnosis found. This should be created automatically.</p>
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
            <Link href="/dashboard" className="hover:text-primary transition-colors">
              Dashboard
            </Link>
            <span>/</span>
            <Link href={`/workorders`} className="hover:text-primary transition-colors">
              Work Orders
            </Link>
            <span>/</span>
            <Link href={`/workorders/${workOrderId}`} className="hover:text-primary transition-colors">
              #{workOrderId}
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium">Diagnosis</span>
          </div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">
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
                className="h-9 bg-success hover:bg-green-700 text-white"
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
                className="h-9 bg-success hover:bg-green-700 text-white"
              >
                <CheckCircle className="w-3.5 h-3.5 mr-2" />
                {completeDiagnosisMutation.isPending ? "Completing..." : "Complete"}
              </Button>
            </>
          )}
          {diagnosis.status === "completed" && (
            <Button variant="outline" size="sm" className="h-9 cursor-default bg-success/10 text-green-700 border-green-200 hover:bg-success/10">
              <CheckCircle2 className="w-3.5 h-3.5 mr-2" />
              Completed
            </Button>
          )}
        </div>
      </div>

      {/* Workflow Status & Info Banner */}
      <Card className="border-none shadow-sm bg-muted/50">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Badge
                variant="outline"
                className={`text-sm py-1 px-3 ${diagnosis.status === 'in_progress' ? 'bg-primary/10 text-primary border-orange-200' :
                  diagnosis.status === 'paused' ? 'bg-orange-50 text-primary border-orange-200' :
                    diagnosis.status === 'completed' ? 'bg-success/10 text-green-700 border-green-200' :
                      'bg-muted text-foreground border-border'
                  }`}
              >
                <StatusIcon className="w-3.5 h-3.5 mr-1.5" />
                {statusConfig.label}
              </Badge>

              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                {diagnosis.technician_name && (
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    <span>{diagnosis.technician_name}</span>
                  </div>
                )}
                {diagnosis.diagnostic_time_formatted && (
                  <div className="flex items-center gap-1.5 border-l pl-4 border-border">
                    <Clock className="w-3.5 h-3.5" />
                    <span className="font-mono">{diagnosis.diagnostic_time_formatted}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Compact Workflow Stages */}
            <div className="flex items-center gap-1 text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
              <span className={diagnosis.status !== 'not_started' ? "text-primary" : ""}>Start</span>
              <span className="mx-1">→</span>
              <span className={['in_progress', 'paused', 'completed'].includes(diagnosis.status) ? "text-primary" : ""}>In Progress</span>
              <span className="mx-1">→</span>
              <span className={diagnosis.status === 'completed' ? "text-success" : ""}>Done</span>
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
        <Card className="border-none shadow-sm bg-card border border-border">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Diagnostic Codes</span>
            <div className="flex items-end justify-between">
              <span className="text-xl font-bold text-foreground">{codesCount}</span>
              <Code className="w-4 h-4 text-primary mb-1" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-card border border-border">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tests Run</span>
            <div className="flex items-end justify-between">
              <span className="text-xl font-bold text-foreground">{testsCount}</span>
              <TestTube className="w-4 h-4 text-purple-500 mb-1" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-card border border-border">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Photos</span>
            <div className="flex items-end justify-between">
              <span className="text-xl font-bold text-foreground">{photosCount}</span>
              <Camera className="w-4 h-4 text-orange-500 mb-1" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-card border border-border">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recommendations</span>
            <div className="flex items-end justify-between">
              <span className="text-xl font-bold text-foreground">{recommendationsCount}</span>
              <Wrench className="w-4 h-4 text-indigo-500 mb-1" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="border-b border-border mb-6">
          <TabsList className="flex w-full h-auto p-0 bg-transparent gap-6">
            <TabsTrigger
              value="complaint"
              className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 py-3 transition-all"
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Complaint
            </TabsTrigger>
            <TabsTrigger
              value="codes"
              className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 py-3 transition-all"
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
              className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 py-3 transition-all"
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
              className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 py-3 transition-all"
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
              className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 py-3 transition-all"
            >
              <Package className="w-4 h-4 mr-2" />
              Parts Required
            </TabsTrigger>
            <TabsTrigger
              value="recommendations"
              className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 py-3 transition-all"
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
              className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 py-3 transition-all"
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
          <PartsRequiredTab
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
            workOrder={workOrder}
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
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */}
              {diagnosis.time_logs.map((log: any, index: number) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-3 bg-muted rounded-md border"
                >
                  <div className="flex items-center space-x-3">
                    <Badge variant="secondary" className="text-xs">
                      {log.stage_display || log.stage}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {format(new Date(log.started_at), "MMM dd, yyyy h:mm a")}
                    </span>
                    {log.ended_at && (
                      <>
                        <span className="text-muted-foreground">→</span>
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(log.ended_at), "MMM dd, yyyy h:mm a")}
                        </span>
                      </>
                    )}
                    {log.technician_name && (
                      <span className="text-xs text-muted-foreground">
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
                      <span className="text-xs text-muted-foreground italic">
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


// Recommendations Tab Component
function RecommendationsTab({
  diagnosis,
  workOrderId,
  workOrder,
  onRefresh,
  isDisabled = false,
}: {
  diagnosis: Diagnosis;
  workOrderId: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workOrder?: any;
  onRefresh: () => void;
  isDisabled?: boolean;
}) {
  const { formatCurrency } = useCurrency(); // Added to fix build error
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [showAddDialog, setShowAddDialog] = useState(false);
  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */ }
  const [editingRecommendation, setEditingRecommendation] = useState<any>(null);
  const [selectedRecommendations, setSelectedRecommendations] = useState<Set<number>>(new Set());
  const [showAiDialog, setShowAiDialog] = useState(false);
  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */ }
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);

  // AI Suggestion mutation
  const getAiSuggestionsMutation = useMutation({
    mutationFn: () => diagnosisApi.getAiSuggestions(diagnosis.id),
    onSuccess: (data) => {
      setAiSuggestions(data);
      setShowAiDialog(true);
      toast({ title: "AI suggestions generated", variant: "default" });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
      toast({
        title: "AI analysis failed",
        description: error.response?.data?.message || error.message,
        variant: "destructive",
      });
    },
  });

  // Load line items from localStorage to check for linked items
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (data: any) => diagnosisApi.addRecommendation(diagnosis.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
      onRefresh();
      setShowAddDialog(false);
      setEditingRecommendation(null);
      toast({ title: "Recommendation added", variant: "default" });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
      toast({
        title: "Failed to add recommendation",
        description: error.response?.data?.message || error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: ({ id, data }: { id: number; data: any }) => diagnosisApi.updateRecommendation(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
      onRefresh();
      setShowAddDialog(false);
      setEditingRecommendation(null);
      toast({ title: "Recommendation updated", variant: "default" });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
      toast({
        title: "Failed to convert recommendations",
        description: error.response?.data?.message || error.response?.data?.error || error.message,
        variant: "destructive",
      });
    },
  });

  const recommendations = diagnosis.repair_recommendations || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const approvedRecommendations = recommendations.filter((r: any) => r.customer_approved);

  // Inventory parts for part line items (active parts)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: inventoryParts } = useQuery({
    queryKey: ["inventory", "parts", "active"],
    queryFn: () => inventoryApi.list({ is_active: true }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unapprovedRecommendations = recommendations.filter((r: any) => !r.customer_approved);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const convertedRecommendations = recommendations.filter((r: any) => r.converted_to_task_id);

  // Check if work order is in a status that allows printing recommendations
  const canPrintRecommendations = workOrder && ["completed", "invoiced", "closed"].includes(workOrder.status);

  const handlePrintRecommendations = async (format: "html" | "pdf" = "pdf") => {
    try {
      if (format === "pdf") {
        // Download PDF
        const blob = await workordersApi.downloadRecommendationsPDF(workOrderId);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `recommendations_${workOrder?.work_order_number || workOrderId}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast({
          title: "Success",
          description: "Recommendations PDF downloaded successfully",
        });
      } else {
        // Open HTML print page on Django backend
        // Use the API URL and construct the Django frontend URL
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
        const baseUrl = apiUrl.replace("/api", "");
        const token = localStorage.getItem("access_token");
        // Pass token as query param for authentication
        const printUrl = `${baseUrl}/workorders/${workOrderId}/print-recommendations/${token ? `?token=${token}` : ''}`;
        window.open(printUrl, "_blank");
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to print recommendations",
        variant: "destructive",
      });
    }
  };

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setSelectedRecommendations(new Set(unapprovedRecommendations.map((r: any) => r.id)));
    }
  };

  return (
    <>
      <Card className="border-none shadow-sm bg-muted/50">
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b bg-muted/50">
          <div className="space-y-1">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-foreground">Repair Recommendations</CardTitle>
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
                  className="h-8 bg-success hover:bg-green-700 text-white"
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
            {canPrintRecommendations && unapprovedRecommendations.length > 0 && (
              <>
                <Button
                  onClick={() => handlePrintRecommendations("pdf")}
                  size="sm"
                  variant="outline"
                  className="h-8"
                >
                  <Printer className="w-3.5 h-3.5 mr-1.5" />
                  Print (PDF)
                </Button>
                <Button
                  onClick={() => handlePrintRecommendations("html")}
                  size="sm"
                  variant="outline"
                  className="h-8"
                >
                  <Printer className="w-3.5 h-3.5 mr-1.5" />
                  Print (HTML)
                </Button>
              </>
            )}
            <Button onClick={() => setShowAddDialog(true)} size="sm" className="h-8" disabled={isDisabled}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add
            </Button>
            <Button
              onClick={() => getAiSuggestionsMutation.mutate()}
              disabled={getAiSuggestionsMutation.isPending || isDisabled}
              size="sm"
              variant="outline"
              className="h-8 border-primary/30 text-primary hover:bg-primary/5"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              {getAiSuggestionsMutation.isPending ? "Analyzing..." : "AI Suggest"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {recommendations.length > 0 ? (
            <div className="space-y-6">
              {/* Unapproved Recommendations */}
              {unapprovedRecommendations.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <h3 className="font-semibold text-sm text-foreground">Pending Approval ({unapprovedRecommendations.length})</h3>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedRecommendations.size === unapprovedRecommendations.length && unapprovedRecommendations.length > 0}
                        onCheckedChange={handleSelectAll}
                        className="h-4 w-4"
                      />
                      <span className="text-xs text-muted-foreground">Select All</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {unapprovedRecommendations.map((rec: any) => (
                      <div
                        key={rec.id}
                        className={`group p-4 bg-card border rounded-lg transition-all duration-200 hover:shadow-md ${selectedRecommendations.has(rec.id) ? "border-primary ring-1 ring-primary bg-primary/5" : "border-border"
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
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-normal text-muted-foreground capitalize">
                                  {rec.recommendation_type_display || rec.recommendation_type}
                                </Badge>
                              </div>
                              {rec.estimated_total_cost && Number(rec.estimated_total_cost) > 0 && (
                                <span className="text-sm font-bold text-foreground font-mono">
                                  {formatCurrency(Number(rec.estimated_total_cost))}
                                </span>
                              )}
                            </div>

                            <p className="text-sm text-card-foreground line-clamp-2 leading-relaxed">{rec.description}</p>

                            {/* Parts and Labor Details */}
                            {(() => {
                              // Check for linked line items from Estimate tab
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              const linkedItems = lineItems.filter((item: any) => item.recommendation_id === rec.id);
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              const linkedParts = linkedItems.filter((item: any) => item.item_type === 'part');
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              const linkedLabor = linkedItems.filter((item: any) => item.item_type === 'labor');
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              const linkedPartsTotal = linkedParts.reduce((sum: number, item: any) => sum + ((item.quantity || 0) * (item.unit_price || 0)), 0);
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              const linkedLaborTotal = linkedLabor.reduce((sum: number, item: any) => {
                                if (item.labor_hours && item.labor_rate) {
                                  return sum + (item.labor_hours * item.labor_rate);
                                }
                                return sum + ((item.quantity || 0) * (item.unit_price || 0));
                              }, 0);
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              const linkedLaborHours = linkedLabor.reduce((sum: number, item: any) => sum + (item.labor_hours || item.quantity || 0), 0);

                              const hasOldData = (rec.parts_needed && Array.isArray(rec.parts_needed) && rec.parts_needed.length > 0) ||
                                (rec.estimated_labor_hours && parseFloat(rec.estimated_labor_hours) > 0);
                              const hasLinkedData = linkedItems.length > 0;

                              if (hasOldData || hasLinkedData) {
                                return (
                                  <div className="text-xs bg-muted/50 rounded p-2 text-muted-foreground space-y-1">
                                    {/* Old parts_needed data */}
                                    {rec.parts_needed && Array.isArray(rec.parts_needed) && rec.parts_needed.length > 0 && (
                                      <div className="flex items-center gap-1.5">
                                        <Package className="w-3 h-3 text-muted-foreground" />
                                        <span>{rec.parts_needed.length} part(s) • {formatCurrency(Number(rec.estimated_parts_cost || 0))}</span>
                                      </div>
                                    )}
                                    {/* Linked parts from Estimate tab */}
                                    {linkedParts.length > 0 && (
                                      <div className="flex items-center gap-1.5">
                                        <Package className="w-3 h-3 text-muted-foreground" />
                                        <span>{linkedParts.length} part(s) • {formatCurrency(linkedPartsTotal)}</span>
                                      </div>
                                    )}
                                    {/* Old labor data */}
                                    {rec.estimated_labor_hours && parseFloat(rec.estimated_labor_hours) > 0 && (
                                      <div className="flex items-center gap-1.5">
                                        <Clock className="w-3 h-3 text-muted-foreground" />
                                        <span>{parseFloat(rec.estimated_labor_hours).toFixed(1)}h • {formatCurrency(Number(rec.estimated_labor_cost || 0))}</span>
                                      </div>
                                    )}
                                    {/* Linked labor from Estimate tab */}
                                    {linkedLabor.length > 0 && (
                                      <div className="flex items-center gap-1.5">
                                        <Clock className="w-3 h-3 text-muted-foreground" />
                                        <span>{linkedLaborHours.toFixed(1)}h • {formatCurrency(linkedLaborTotal)}</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              } else {
                                return (
                                  <div className="text-xs text-muted-foreground italic px-2">No estimate details added</div>
                                );
                              }
                            })()}

                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border transition-opacity">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-primary hover:text-primary hover:bg-primary/10"
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
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {approvedRecommendations.filter((r: any) => !r.converted_to_task_id).length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-foreground border-b border-border pb-2">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    Approved - Ready to Convert ({approvedRecommendations.filter((r: any) => !r.converted_to_task_id).length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {approvedRecommendations
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      .filter((r: any) => !r.converted_to_task_id)
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      .map((rec: any) => (
                        <div key={rec.id} className="p-4 bg-success/10/30 border border-green-100 dark:border-green-900/30 rounded-lg space-y-3">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant={rec.priority === 'critical' ? 'danger' : rec.priority === 'necessary' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0 h-5 font-medium capitalize">
                                {rec.priority_display || rec.priority}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-normal text-muted-foreground bg-card">
                                {rec.recommendation_type_display || rec.recommendation_type}
                              </Badge>
                              <Badge variant="default" className="text-[10px] px-1.5 py-0 h-5 bg-success hover:bg-green-700 border-transparent text-white">
                                ✓ Approved
                              </Badge>
                            </div>
                            {rec.estimated_total_cost && Number(rec.estimated_total_cost) > 0 && (
                              <span className="text-sm font-bold text-foreground font-mono">
                                {formatCurrency(Number(rec.estimated_total_cost))}
                              </span>
                            )}
                          </div>

                          <p className="text-sm text-foreground line-clamp-2">{rec.description}</p>

                          {/* Parts and Labor Details */}
                          {(rec.parts_needed && Array.isArray(rec.parts_needed) && rec.parts_needed.length > 0) ||
                            (rec.estimated_labor_hours && parseFloat(rec.estimated_labor_hours) > 0) ? (
                            <div className="text-xs bg-card/50 rounded p-2 text-muted-foreground space-y-1 border border-green-100/50">
                              {rec.parts_needed && Array.isArray(rec.parts_needed) && rec.parts_needed.length > 0 && (
                                <div className="flex items-center gap-1.5">
                                  <Package className="w-3 h-3 text-success/70" />
                                  <span>{rec.parts_needed.length} part(s) • {formatCurrency(Number(rec.estimated_parts_cost || 0))}</span>
                                </div>
                              )}
                              {rec.estimated_labor_hours && parseFloat(rec.estimated_labor_hours) > 0 && (
                                <div className="flex items-center gap-1.5">
                                  <Clock className="w-3 h-3 text-success/70" />
                                  <span>{parseFloat(rec.estimated_labor_hours).toFixed(1)}h • {formatCurrency(Number(rec.estimated_labor_cost || 0))}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground italic px-2">No estimate details</div>
                          )}

                          <div className="flex justify-end pt-2 border-t border-green-100/50">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-primary hover:text-primary hover:bg-primary/10"
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
                  <h3 className="font-semibold text-sm text-foreground border-b border-border pb-2">
                    Converted to Tasks ({convertedRecommendations.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {convertedRecommendations.map((rec: any) => (
                      <div key={rec.id} className="p-4 bg-muted border border-border bg-muted border-border rounded-lg space-y-3 opacity-75">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 font-normal">
                              {rec.priority_display || rec.priority}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-normal bg-card">
                              ✓ Task Created
                            </Badge>
                          </div>
                          {rec.estimated_total_cost && Number(rec.estimated_total_cost) > 0 && (
                            <span className="text-sm font-bold text-muted-foreground font-mono">
                              {formatCurrency(Number(rec.estimated_total_cost))}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">{rec.description}</p>

                        {rec.converted_to_task_id && (
                          <div className="pt-2 border-t border-border">
                            <Link href={`/workorders/${workOrderId}`} className="flex items-center text-xs font-medium text-primary hover:underline">
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
            <div className="text-center py-16 bg-muted/50 rounded-lg border border-dashed border-border">
              <Wrench className="w-12 h-12 mx-auto mb-3 text-gray-300 text-muted-foreground" />
              <h3 className="text-sm font-medium text-foreground mb-1">No recommendations yet</h3>
              <p className="text-xs text-muted-foreground mb-4 max-w-sm mx-auto">Add repair recommendations to suggest parts and labor services for this diagnosis.</p>
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

      {/* AI Suggestion Dialog */}
      <Dialog open={showAiDialog} onOpenChange={setShowAiDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              AI Repair Recommendations
            </DialogTitle>
            <DialogDescription>
              Based on DTCs, findings, and customer complaints, AI suggests the following repairs.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            {aiSuggestions.length > 0 ? (
              aiSuggestions.map((suggestion, index) => (
                <div key={index} className="p-4 border border-border rounded-lg bg-muted/30 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={suggestion.priority === 'critical' ? 'danger' : 'secondary'} className="capitalize">
                        {suggestion.priority}
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        {suggestion.recommendation_type}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">{formatCurrency(suggestion.estimated_total_cost || (Number(suggestion.estimated_labor_cost || 0) + Number(suggestion.estimated_parts_cost || 0)))}</p>
                      <p className="text-[10px] text-muted-foreground">Estimated Total</p>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-foreground">{suggestion.description}</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      <span className="font-semibold text-card-foreground">Parts:</span> {suggestion.parts_needed}
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={() => {
                        createMutation.mutate(suggestion);
                        // Optional: remove from list after adding
                        setAiSuggestions(prev => prev.filter((_, i) => i !== index));
                        if (aiSuggestions.length <= 1) setShowAiDialog(false);
                      }}
                      disabled={createMutation.isPending}
                    >
                      Add Recommendation
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No specific AI suggestions found for this diagnostic data.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAiDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
      toast({
        title: "Failed to delete photo",
        description: error.response?.data?.message || error.message,
        variant: "destructive",
      });
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["diagnosis-photos", diagnosisId] });
    onRefresh();
  };

  return (
    <>
      <Card className="border-none shadow-sm bg-muted/50">
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b bg-muted/50">
          <div className="space-y-1">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-foreground">Visual Evidence</CardTitle>
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
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 text-red-600 text-sm rounded-lg flex items-center justify-center">
              Failed to load photos. Please try again.
            </div>
          ) : photos.length === 0 ? (
            <div className="text-center py-16 bg-muted/50 rounded-lg border border-dashed border-border">
              <Camera className="w-12 h-12 mx-auto mb-3 text-gray-300 text-muted-foreground" />
              <h3 className="text-sm font-medium text-foreground mb-1">No photos yet</h3>
              <p className="text-xs text-muted-foreground mb-4 max-w-sm mx-auto">Upload photos to document vehicle condition, evidence, or parts.</p>
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
                  className="group relative border border-border rounded-lg overflow-hidden bg-card hover:shadow-lg transition-all duration-200"
                >
                  <div className="aspect-square relative overflow-hidden bg-border">
                    {photo.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photo.photo_url}
                        alt={photo.caption || "Diagnosis photo"}
                        className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                        onClick={() => window.open(photo.photo_url, '_blank')}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <Camera className="w-8 h-8 opacity-20" />
                      </div>
                    )}
                    {/* Overlay Gradient */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                    {/* Actions */}
                    <div className="absolute top-2 right-2 transition-opacity flex gap-1">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="destructive"
                              size="icon"
                              className="h-8 w-8 rounded-full shadow-lg bg-red-600 hover:bg-red-700 border-none transition-all duration-200"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm("Delete this photo?")) {
                                  deleteMutation.mutate(photo.id);
                                }
                              }}
                              disabled={isDisabled}
                              aria-label="Delete photo"
                            >
                              <Trash2 className="w-4 h-4 text-white" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            <p>Delete Photo</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>

                    {/* Badge */}
                    {photo.photo_type && (
                      <div className="absolute top-2 left-2">
                        <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-card/90 dark:bg-black/90 backdrop-blur-sm shadow-sm capitalize">
                          {photo.photo_type.replace('_', ' ')}
                        </Badge>
                      </div>
                    )}

                  </div>

                  <div className="p-3">
                    <p className="text-xs font-medium text-foreground truncate" title={photo.caption || "Untitled"}>
                      {photo.caption || <span className="text-muted-foreground italic">No caption</span>}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      <DialogContent className="max-w-2xl bg-card gap-0 p-0 border border-border shadow-xl sm:rounded-xl">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-xl font-bold text-foreground">Upload Diagnosis Photo</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Add photos to document findings, evidence, or repair verification.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="p-6 pt-4 space-y-5">
            {/* File Upload */}
            <div className="space-y-2">
              <Label htmlFor="photo" className="text-sm font-medium text-card-foreground">Photo <span className="text-red-500">*</span></Label>
              <input
                id="photo"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                required
              />
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 group ${preview ? "border-orange-200 bg-primary/5" : "border-border hover:border-orange-400 hover:bg-muted border-border dark:hover:border-primary hover:bg-muted"}`}
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
                      <span className="text-sm text-muted-foreground font-medium">{selectedFile?.name}</span>
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
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 dark:bg-orange-900/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                      <Camera className="w-8 h-8 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        Click to upload or drag and drop
                      </p>
                      <p className="text-xs text-muted-foreground">
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
                <Label htmlFor="caption" className="text-sm font-medium text-card-foreground">Caption</Label>
                <Input
                  id="caption"
                  value={formData.caption}
                  onChange={(e) => setFormData({ ...formData, caption: e.target.value })}
                  placeholder="Describe what this photo shows..."
                  className="h-9 bg-card border-border focus:border-primary"
                />
              </div>

              {/* Photo Type */}
              <div className="space-y-2">
                <Label htmlFor="photo_type" className="text-sm font-medium text-card-foreground">Photo Type <span className="text-red-500">*</span></Label>
                <Select
                  value={formData.photo_type}
                  onValueChange={(val) => // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    setFormData({ ...formData, photo_type: val as any })
                  }
                  required
                >
                  <SelectTrigger id="photo_type" className="h-9 w-full bg-card border-border">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="problem">Problem</SelectItem>
                    <SelectItem value="evidence">Evidence</SelectItem>
                    <SelectItem value="component">Component</SelectItem>
                    <SelectItem value="before">Before Repair</SelectItem>
                    <SelectItem value="after">After Repair</SelectItem>
                    <SelectItem value="damage">Damage</SelectItem>
                    <SelectItem value="test_result">Test Result</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

          </div>

          <div className="flex items-center justify-end gap-3 p-6 pt-2 border-t border-border bg-muted/50 rounded-b-xl">
            <Button type="button" variant="ghost" onClick={handleClose} className="hover:bg-muted/50">
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending || !selectedFile} className="bg-primary hover:bg-primary/90 text-white min-w-[100px]">
              {createMutation.isPending ? "Uploading..." : "Upload Photo"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog >
  );
}

// Parts Tab Component - Estimate Line Items

// Summary Tab Component
function SummaryTab({
  diagnosis,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  workOrder,
  onUpdate,
  isUpdating,
  isDisabled = false,
}: {
  diagnosis: Diagnosis;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workOrder: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUpdate: (data: any) => void;
  isUpdating: boolean;
  isDisabled?: boolean;
}) {
  const { formatCurrency } = useCurrency(); // Added hook
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      <Card className="border-none shadow-sm bg-muted/50">
        <CardHeader className="pb-3 border-b bg-muted/50">
          <CardTitle className="text-base font-semibold">Overview</CardTitle>
          <CardDescription>Key metrics for this diagnosis</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-3 gap-6">
            <div className="flex flex-col items-center justify-center p-4 bg-card rounded-xl border border-border shadow-sm transition-all hover:shadow-md">
              <div className="p-2 mb-3 rounded-full bg-primary/10 dark:bg-orange-900/20 text-primary">
                <Clock className="w-5 h-5" />
              </div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Time Spent</p>
              <p className="text-lg font-bold text-foreground">
                {totalTimeSpent || "-"}
              </p>
            </div>
            <div className="flex flex-col items-center justify-center p-4 bg-card rounded-xl border border-border shadow-sm transition-all hover:shadow-md">
              <div className="p-2 mb-3 rounded-full bg-success/10 dark:bg-green-900/20 text-success">
                <DollarSign className="w-5 h-5" />
              </div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Estimate Total</p>
              <p className="text-lg font-bold text-foreground">
                {diagnosis.total_estimated_cost && Number(diagnosis.total_estimated_cost) > 0
                  ? `${formatCurrency(Number(diagnosis.total_estimated_cost))}`
                  : "-"}
              </p>
            </div>
            <div className="flex flex-col items-center justify-center p-4 bg-card rounded-xl border border-border shadow-sm transition-all hover:shadow-md">
              <div className="p-2 mb-3 rounded-full bg-orange-50 dark:bg-orange-900/20 text-primary">
                <Wrench className="w-5 h-5" />
              </div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Items</p>
              <p className="text-lg font-bold text-foreground">{diagnosis.repair_recommendations?.length || 0}</p>
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
            className="flex-1 min-h-[200px] resize-none bg-muted border-border focus:bg-card dark:focus:bg-gray-950 transition-colors"
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
              className="bg-primary hover:bg-primary/90 min-w-[100px]"
            >
              {isUpdating ? "Saving..." : "Save Notes"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

