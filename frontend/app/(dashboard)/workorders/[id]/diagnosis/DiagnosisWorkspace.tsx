"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect } from "react";
import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { diagnosisApi, Diagnosis } from "@/lib/api/diagnosis";
import { workordersApi } from "@/lib/api/workorders";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useToast } from "@/lib/hooks/useToast";
import { useConfirmDialog } from "@/lib/hooks/useConfirmDialog";
import { useAuthStore } from "@/store/authStore";
import {
  ArrowLeft,
  CheckCircle,
  Clock,
  DollarSign,
  Edit,
  Plus,
  Wrench,
  FileText,
  ListChecks,
  MessageSquare,
  Code,
  TestTube,
  Camera,
  Trash2,
  Package,
  Play,
  Pause,
  PlayCircle,
  CheckCircle2,
  RotateCcw,
  Search,
  Send,
  User,
  Sparkles,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { CodesTab } from "./components/CodesTab";
import { ComplaintTab } from "./components/ComplaintTab";
import { TestsTab } from "./components/TestsTab";
import { RecommendationDialog } from "./components/RecommendationDialog";
import { AssignmentActions } from "../components/AssignmentActions";
import { useOfflineStore } from "@/store/offlineStore";
import {
  fetchDiagnosisForWorkOrder,
  patchDiagnosisOfflineAware,
  runDiagnosisMutation,
} from "@/lib/offline/diagnosis";
import { cn } from "@/lib/utils";
import { getWorkOrderAssignees } from "@/lib/workorders/assignees";
import { getUserFacingError } from "@/lib/api/errors";
import { isRoutineMaintenanceWorkOrder, isInspectionOnlyWorkOrder } from "@/lib/utils/workorder-workflow-steps";


type DiagnosisWorkspaceProps = {
  isMobile?: boolean;
};

export default function DiagnosisWorkspace({ isMobile = false }: DiagnosisWorkspaceProps) {
  const params = useParams();
  const router = useRouter();
  const workOrderId = parseInt(params.id as string);
  const workOrderBackHref = isMobile
    ? `/mobile/workorders/${workOrderId}`
    : `/workorders/${workOrderId}`;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isOnline } = useOfflineStore();
  const useOfflineDiagnosis = isMobile;
  const [activeTab, setActiveTab] = useState("complaint");
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [pauseReason, setPauseReason] = useState("");

  // Fetch work order
  const { data: workOrder, isLoading: workOrderLoading } = useQuery({
    queryKey: ["workorder", workOrderId],
    queryFn: () => workordersApi.get(workOrderId),
  });

  useEffect(() => {
    if (workOrderLoading || !workOrder) return;
    if (isRoutineMaintenanceWorkOrder(workOrder) || isInspectionOnlyWorkOrder(workOrder)) {
      router.replace(`${workOrderBackHref}?tab=parts`);
    }
  }, [workOrder, workOrderLoading, router, workOrderBackHref]);

  // Fetch or create diagnosis
  const { data: diagnosis, isLoading, error: diagnosisError } = useQuery({
    queryKey: ["diagnosis", "workorder", workOrderId, useOfflineDiagnosis ? isOnline : "online"],
    queryFn: () => fetchDiagnosisForWorkOrder(workOrderId, useOfflineDiagnosis),
    enabled: !!workOrderId && !!workOrder,
    retry: isOnline ? 1 : 0,
    retryDelay: 1000,
  });

  const createDiagnosisMutation = useMutation({
    mutationFn: () => {
      if (!workOrder) throw new Error("Work order not found");
      return diagnosisApi.create({
        work_order: workOrderId,
        customer_complaint: workOrder.customer_concerns || "",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
      toast({
        title: "Diagnosis created",
        description: "The diagnosis record is ready. Start it when the technician begins work.",
        variant: "default",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create diagnosis",
        description: getUserFacingError(error),
        variant: "destructive",
      });
    },
  });

  // Get counts from diagnosis object (nested arrays included in detail serializer)
  const codesCount = Array.isArray(diagnosis?.diagnostic_codes) ? diagnosis.diagnostic_codes.length : 0;
  const testsCount = Array.isArray(diagnosis?.diagnostic_tests) ? diagnosis.diagnostic_tests.length : 0;
  const findingsCount = Array.isArray(diagnosis?.findings) ? diagnosis.findings.length : 0;
  const recommendationsCount = Array.isArray(diagnosis?.repair_recommendations) ? diagnosis.repair_recommendations.length : 0;
  const photosCount = Array.isArray(diagnosis?.photos) ? diagnosis.photos.length : 0;

  const updateDiagnosisMutation = useMutation({
    mutationFn: (data: Partial<Diagnosis>) => {
      if (!diagnosis) throw new Error("Diagnosis not found");
      if (useOfflineDiagnosis && !isOnline) {
        return patchDiagnosisOfflineAware(workOrderId, diagnosis.id, data, false);
      }
      return diagnosisApi.update(diagnosis.id, data);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
      toast({
        title: useOfflineDiagnosis && !isOnline ? "Saved offline" : "Diagnosis updated",
        description:
          useOfflineDiagnosis && !isOnline
            ? "Changes will sync when you are back online."
            : undefined,
        variant: "default",
      });
      if (useOfflineDiagnosis && !isOnline && diagnosis) {
        queryClient.setQueryData(
          ["diagnosis", "workorder", workOrderId, isOnline],
          { ...diagnosis, ...variables }
        );
      }
    },

    onError: (error: any) => {
      toast({
        title: "Failed to update diagnosis",
        description: getUserFacingError(error),
        variant: "destructive",
      });
    },
  });

  // Workflow transition mutations
  const startDiagnosisMutation = useMutation({
    mutationFn: () => {
      if (!diagnosis) throw new Error("Diagnosis not found");
      return runDiagnosisMutation(
        workOrderId,
        isOnline,
        {
          endpoint: `/diagnosis/diagnoses/${diagnosis.id}/start/`,
          method: "POST",
        },
        () => diagnosisApi.start(diagnosis.id).then((r) => r.diagnosis)
      );
    },
    onSuccess: () => {
      toast({
        title: useOfflineDiagnosis && !isOnline ? "Queued offline" : "Diagnosis started",
        description:
          useOfflineDiagnosis && !isOnline
            ? "Start action will sync when online."
            : "Diagnosis workflow started. Labor Time is running on the diagnosis task.",
        variant: "default"
      });
      refreshWorkOrderViews();
    },

    onError: (error: any) => {
      toast({
        title: "Failed to start diagnosis",
        description: getUserFacingError(error),
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
        description: "Diagnosis session and Labor Time have been stopped for this phase.",
        variant: "default"
      });
      refreshWorkOrderViews();
    },

    onError: (error: any) => {
      toast({
        title: "Failed to pause diagnosis",
        description: getUserFacingError(error),
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
      refreshWorkOrderViews();
    },

    onError: (error: any) => {
      toast({
        title: "Failed to resume diagnosis",
        description: getUserFacingError(error),
        variant: "destructive",
      });
    },
  });

  const submitForApprovalMutation = useMutation({
    mutationFn: () => {
      if (!diagnosis) throw new Error("Diagnosis not found");
      return diagnosisApi.submitForApproval(diagnosis.id);
    },
    onSuccess: () => {
      toast({
        title: "Sent for approval",
        description: "The customer has been notified. You can revise the diagnosis if they request changes.",
        variant: "default"
      });
      refreshWorkOrderViews();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send for approval",
        description: getUserFacingError(error),
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
    onSuccess: (response: any) => {
      const workOrderUpdate = response.work_order;
      let message = "Diagnosis completed successfully.";

      if (workOrderUpdate) {
        if (!workOrderUpdate.requires_approval) {
          message += ` Work order has been approved and ready to proceed.`;
        }
      }

      toast({
        title: "Diagnosis completed",
        description: message,
        variant: "default"
      });

      // Invalidate queries to refresh data
      refreshWorkOrderViews();
      queryClient.invalidateQueries({ queryKey: ["diagnosis"] });

      // Redirect to work order page to see updated status
      router.push(workOrderBackHref);
    },

    onError: (error: any) => {
      toast({
        title: "Failed to complete diagnosis",
        description: getUserFacingError(error),
        variant: "destructive",
      });
    },
  });

  const reopenDiagnosisMutation = useMutation({
    mutationFn: () => {
      if (!diagnosis) throw new Error("Diagnosis not found");
      return diagnosisApi.reopen(diagnosis.id, "Diagnosis reopened for revision before customer approval.");
    },
    onSuccess: () => {
      toast({
        title: "Diagnosis reopened",
        description: "You can now update the diagnosis, findings, recommendations, and parts before resubmitting.",
        variant: "default"
      });
      refreshWorkOrderViews();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to reopen diagnosis",
        description: getUserFacingError(error),
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
            <p className="text-destructive">Error loading work order. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isRoutineMaintenanceWorkOrder(workOrder) || isInspectionOnlyWorkOrder(workOrder)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
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
              <p className="text-destructive font-semibold">Error loading diagnosis</p>
              <p className="text-sm text-muted-foreground">

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
            <div className="space-y-4">
              <div>
                <p className="font-semibold text-foreground">No diagnosis record yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Create the diagnosis explicitly, then start it when the technician begins work.
                </p>
              </div>
              {workOrder.customer_concerns && (
                <div className="rounded-md border bg-muted/50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Customer concern</p>
                  <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{workOrder.customer_concerns}</p>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  onClick={() => createDiagnosisMutation.mutate()}
                  disabled={createDiagnosisMutation.isPending}
                >
                  {createDiagnosisMutation.isPending ? "Creating..." : "Create Diagnosis"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] })}
                >
                  Refresh
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Block actions if diagnosis hasn't been started yet (timesheet integrity)
  // Check if diagnosis is active for editing (only while in progress)
  const diagnosisActive = diagnosis.status === "in_progress" || (diagnosis.status === "awaiting_approval" && !!workOrder.approved_by_customer);
  const canReopenDiagnosis = ["awaiting_approval", "completed"].includes(diagnosis.status)
    && !workOrder.approved_by_customer
    && ["awaiting_approval", "diagnosis"].includes(workOrder.status);
  const canCompleteDiagnosis = diagnosis.status === "awaiting_approval" && !!workOrder.approved_by_customer;
  const shouldSendForApproval = diagnosis.requires_approval && !workOrder.approved_by_customer;
  const assignedPeople = getWorkOrderAssignees(workOrder);
  const currentUser = useAuthStore((s) => s.user);
  const assignmentPending = workOrder?.requires_assignment_acceptance === true;
  const assignmentGate = workOrder?.technician_assignment_status as string | undefined;
  const isAssignedTechnician =
    !!currentUser &&
    (Number(workOrder?.primary_technician) === Number(currentUser.id) ||
      (typeof workOrder?.primary_technician === "object" &&
        workOrder?.primary_technician?.id === currentUser.id) ||
      (workOrder?.assigned_technicians_detail || []).some(
        (t: { id: number }) => Number(t.id) === Number(currentUser.id)
      ) ||
      (Array.isArray(workOrder?.assigned_technicians) &&
        workOrder.assigned_technicians.some((t: number | { id: number }) =>
          typeof t === "number"
            ? t === currentUser.id
            : Number(t?.id) === Number(currentUser.id)
        )));
  const isTechnicianRole = currentUser?.role === "technician";
  const blocksTechDiagnosisWork =
    isTechnicianRole &&
    isAssignedTechnician &&
    (assignmentPending || assignmentGate === "rejected" || assignmentGate === "released");
  const assignmentBlockMessage = assignmentPending
    ? "Accept this job assignment before starting diagnosis."
    : assignmentGate === "rejected"
      ? "This assignment was rejected. Ask the coordinator to reassign before diagnosing."
      : assignmentGate === "released"
        ? "This assignment was released. Wait for a new assignment before diagnosing."
        : null;

  const refreshWorkOrderViews = () => {
    queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
    queryClient.invalidateQueries({ queryKey: ["workorder", workOrderId] });
    queryClient.invalidateQueries({ queryKey: ["workorders"] });
    queryClient.invalidateQueries({ queryKey: ["workorder-stats"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard", "workorder-stats"] });
  };

  // Get status color and icon (overlay stores quote stage when present)
  const getStatusConfig = (status: string) => {
    const quoteStage = workOrder?.current_quote_stage;
    if (quoteStage === "waiting_for_stores_quotation") {
      return { color: "warning", icon: Clock, label: "Waiting Quote" };
    }
    if (quoteStage === "waiting_for_customer_approval" || quoteStage === "quotation_ready") {
      return { color: "warning", icon: Send, label: "Quote Ready" };
    }
    switch (status) {
      case "not_started":
        return { color: "secondary", icon: Clock, label: "Not Started" };
      case "in_progress":
        return { color: "info", icon: PlayCircle, label: "In Progress" };
      case "paused":
        return { color: "warning", icon: Pause, label: "Paused" };
      case "awaiting_approval":
        return { color: "warning", icon: Send, label: "Awaiting Approval" };
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
  const diagnosisStageLabel =
    workOrder?.current_quote_stage === "waiting_for_stores_quotation"
      ? "Diagnosis | Waiting Quote"
      : workOrder?.current_quote_stage === "waiting_for_customer_approval" ||
          workOrder?.current_quote_stage === "quotation_ready"
        ? "Diagnosis | Quote Ready"
        : `Diagnosis | ${statusConfig.label}`;

  return (
    <div className={cn("space-y-6", isMobile && "space-y-4 pb-28")}>
      {isMobile && !isOnline && (
        <div className="rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-sm text-warning dark:border-warning/30 dark:bg-warning/15 dark:text-warning">
          Offline — viewing cached diagnosis. Edits queue for sync.
        </div>
      )}
      {/* Header */}
      <div className={cn(
        "flex flex-col sm:flex-row sm:items-center justify-between gap-4",
        isMobile && "gap-3"
      )}>
        <div>
          {!isMobile && (
            <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
              <Link href="/dashboard" className="hover:text-primary transition-colors">
                Dashboard
              </Link>
              <span>/</span>
              <Link href={`/workorders`} className="hover:text-primary transition-colors">
                Work Orders
              </Link>
              <span>/</span>
              <Link href={workOrderBackHref} className="hover:text-primary transition-colors">
                #{workOrderId}
              </Link>
              <span>/</span>
              <span className="text-foreground font-medium">Diagnosis</span>
            </div>
          )}
          {isMobile && (
            <Link href={workOrderBackHref} className="text-sm text-primary mb-1 inline-flex items-center">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to work order
            </Link>
          )}
          <h1 className={cn(
            "font-bold text-foreground tracking-tight",
            isMobile ? "text-lg" : "text-xl"
          )}>
            Diagnosis & Repair Recommendations
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Workflow Action Buttons */}
          {diagnosis.status === "not_started" && (
            <Button
              onClick={() => startDiagnosisMutation.mutate()}
              disabled={startDiagnosisMutation.isPending || blocksTechDiagnosisWork}
              size="sm"
              className="h-9"
              variant="default"
              title={blocksTechDiagnosisWork ? assignmentBlockMessage || undefined : undefined}
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
              {shouldSendForApproval ? (
                <Button
                  onClick={() => submitForApprovalMutation.mutate()}
                  disabled={submitForApprovalMutation.isPending}
                  size="sm"
                  className="h-9"
                >
                  <Send className="w-3.5 h-3.5 mr-2" />
                  {submitForApprovalMutation.isPending ? "Sending..." : "Send for Approval"}
                </Button>
              ) : (
                <Button
                  onClick={() => completeDiagnosisMutation.mutate()}
                  disabled={completeDiagnosisMutation.isPending}
                  size="sm"
                  className="h-9 bg-success hover:bg-success text-white"
                >
                  <CheckCircle className="w-3.5 h-3.5 mr-2" />
                  {completeDiagnosisMutation.isPending ? "Completing..." : "Complete"}
                </Button>
              )}
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
              {shouldSendForApproval ? (
                <Button
                  onClick={() => submitForApprovalMutation.mutate()}
                  disabled={submitForApprovalMutation.isPending}
                  size="sm"
                  className="h-9"
                >
                  <Send className="w-3.5 h-3.5 mr-2" />
                  {submitForApprovalMutation.isPending ? "Sending..." : "Send for Approval"}
                </Button>
              ) : (
                <Button
                  onClick={() => completeDiagnosisMutation.mutate()}
                  disabled={completeDiagnosisMutation.isPending}
                  size="sm"
                  className="h-9 bg-success hover:bg-success text-white"
                >
                  <CheckCircle className="w-3.5 h-3.5 mr-2" />
                  {completeDiagnosisMutation.isPending ? "Completing..." : "Complete"}
                </Button>
              )}
            </>
          )}
          {diagnosis.status === "awaiting_approval" && (
            <>
              {canReopenDiagnosis && (
                <Button
                  onClick={() => reopenDiagnosisMutation.mutate()}
                  disabled={reopenDiagnosisMutation.isPending}
                  size="sm"
                  variant="outline"
                  className="h-9"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-2" />
                  {reopenDiagnosisMutation.isPending ? "Reopening..." : "Revise"}
                </Button>
              )}
              {canCompleteDiagnosis ? (
                <Button
                  onClick={() => completeDiagnosisMutation.mutate()}
                  disabled={completeDiagnosisMutation.isPending}
                  size="sm"
                  className="h-9 bg-success hover:bg-success text-white"
                >
                  <CheckCircle className="w-3.5 h-3.5 mr-2" />
                  {completeDiagnosisMutation.isPending ? "Completing..." : "Complete Diagnosis"}
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="h-9 cursor-default">
                  <Send className="w-3.5 h-3.5 mr-2" />
                  Waiting for Customer
                </Button>
              )}
            </>
          )}
          {diagnosis.status === "completed" && (
            <>
              {canReopenDiagnosis && (
                <Button
                  onClick={() => reopenDiagnosisMutation.mutate()}
                  disabled={reopenDiagnosisMutation.isPending}
                  size="sm"
                  variant="outline"
                  className="h-9"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-2" />
                  {reopenDiagnosisMutation.isPending ? "Reopening..." : "Revise"}
                </Button>
              )}
              <Button variant="outline" size="sm" className="h-9 cursor-default bg-success/15 text-success border-success/20 hover:bg-success/10">
                <CheckCircle2 className="w-3.5 h-3.5 mr-2" />
                Completed
              </Button>
            </>
          )}
        </div>
      </div>

      {blocksTechDiagnosisWork && assignmentBlockMessage ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-warning dark:border-warning/30 dark:bg-warning/15 dark:text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Assignment required</p>
            <p className="text-xs opacity-90">{assignmentBlockMessage}</p>
            <p className="mt-1 text-xs opacity-80">
              Accept, reject, or release the assignment below before diagnosing.
            </p>
          </div>
        </div>
      ) : null}

      {workOrder ? (
        <div className="mb-4">
          <AssignmentActions
            workOrder={workOrder}
            workOrderId={workOrderId}
            onStatusChange={() => {
              queryClient.invalidateQueries({ queryKey: ["workorder", workOrderId] });
              queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
            }}
          />
        </div>
      ) : null}

      {/* Workflow Status & Info Banner */}
      <Card className="border-none shadow-sm bg-muted/50">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Badge
                variant="outline"
                className={`text-sm py-1 px-3 ${diagnosis.status === 'in_progress' ? 'bg-primary/10 text-primary border-primary/20' :
                  diagnosis.status === 'paused' ? 'bg-warning/15 text-warning-foreground border-warning/20' :
                    diagnosis.status === 'awaiting_approval' ? 'bg-warning/15 text-warning-foreground border-warning/20' :
                    diagnosis.status === 'completed' ? 'bg-success/15 text-success border-success/20' :
                      'bg-muted text-foreground border-border'
                  }`}
              >
                <StatusIcon className="w-3.5 h-3.5 mr-1.5" />
                {diagnosisStageLabel}
              </Badge>

              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                {assignedPeople.length > 0 ? (
                  <div className="flex items-start gap-2">
                    <User className="w-3.5 h-3.5 mt-1 shrink-0" />
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        Assigned to
                      </span>
                      <div className="flex flex-wrap items-start gap-1.5">
                        {assignedPeople.map((person) => (
                          <div
                            key={`${person.role}-${person.id}`}
                            className="flex flex-col gap-0.5"
                          >
                            <Badge
                              variant="secondary"
                              className="h-auto rounded-md px-2.5 py-1 text-[11px] font-medium"
                            >
                              <span className="flex flex-col items-start gap-0.5">
                                <span className="text-[10px] font-normal uppercase tracking-wide opacity-70">
                                  {person.roleLabel}
                                </span>
                                <span>{person.name}</span>
                              </span>
                            </Badge>
                            {person.responsibilityNotes ? (
                              <span className="max-w-[14rem] px-1 text-[10px] leading-snug text-muted-foreground">
                                {person.responsibilityNotes}
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : diagnosis.technician_name && (
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
              <span className={['in_progress', 'paused', 'awaiting_approval', 'completed'].includes(diagnosis.status) ? "text-primary" : ""}>In Progress</span>
              <span className="mx-1">→</span>
              <span className={['awaiting_approval', 'completed'].includes(diagnosis.status) ? "text-warning" : ""}>Approval</span>
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

      {/* Tabs */}
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="border-b border-border mb-6">
          <TabsList className={cn(
            "flex w-full h-auto bg-transparent p-0",
            isMobile ? "flex-nowrap overflow-x-auto gap-2 pb-1" : "flex-wrap gap-6"
          )}>
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
              value="findings"
              className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 py-3 transition-all"
            >
              <Search className="w-4 h-4 mr-2" />
              Findings
              {findingsCount > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px] min-w-5 justify-center">
                  {findingsCount}
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

        <TabsContent value="findings" className="mt-6">
          <FindingsTab
            diagnosis={diagnosis}
            workOrderId={workOrderId}
            onRefresh={() => {
              queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
            }}
            isDisabled={!diagnosisActive}
          />
        </TabsContent>

        <TabsContent value="photos" className="mt-6">
          <PhotosTab
            diagnosisId={diagnosis.id}
            onRefresh={() => {
              queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
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
            isMobile={isMobile}
            isOnline={isOnline}
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
              { }
              {diagnosis.time_logs.map((log: any) => {
                const durationLabel =
                  log.stage === "paused" && !log.ended_at
                    ? "Paused"
                    : log.duration_formatted;
                const isActiveDuration = durationLabel === "In progress";
                const isOpenPause = durationLabel === "Paused";

                return (
                <div
                  key={log.id}
                  className={`flex items-center justify-between rounded-md border p-3 ${
                    log.stage === "completed"
                      ? "border-success/20 bg-success/10"
                      : isActiveDuration
                        ? "border-primary/20 bg-primary/5"
                        : isOpenPause
                          ? "border-warning/20 bg-warning/10"
                          : "bg-muted"
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Badge
                      variant="secondary"
                      className={`text-xs ${
                        log.stage === "completed"
                          ? "bg-success/15 text-success"
                          : isActiveDuration
                            ? "bg-primary/10 text-primary"
                            : isOpenPause
                              ? "bg-warning/15 text-warning"
                            : ""
                      }`}
                    >
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
                    {durationLabel && (
                      <Badge
                        variant="secondary"
                        className={`text-xs ${
                          isActiveDuration
                            ? "bg-primary/10 text-primary"
                            : isOpenPause
                              ? "bg-warning/15 text-warning"
                            : log.stage === "completed"
                              ? "bg-success/15 text-success"
                              : ""
                        }`}
                      >
                        {durationLabel}
                      </Badge>
                    )}
                    {log.stage === "completed" && (
                      <Badge className="text-xs bg-success hover:bg-success">
                        Completed
                      </Badge>
                    )}
                    {log.notes && (
                      <span className="text-xs text-muted-foreground italic">
                        {log.notes}
                      </span>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


function FindingsTab({
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
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingFinding, setEditingFinding] = useState<any>(null);
  const [formData, setFormData] = useState({
    finding_title: "",
    category: "other",
    severity: "major",
    description: "",
    root_cause: "",
    diagnostic_codes: [] as number[],
    diagnostic_tests: [] as number[],
    status: "identified",
  });

  const resetForm = (finding?: any) => {
    if (finding) {
      setFormData({
        finding_title: finding.finding_title || "",
        category: finding.category || "other",
        severity: finding.severity || "major",
        description: finding.description || "",
        root_cause: finding.root_cause || "",
        diagnostic_codes: Array.isArray(finding.diagnostic_codes) ? finding.diagnostic_codes.map((code: any) => code.id) : [],
        diagnostic_tests: Array.isArray(finding.diagnostic_tests) ? finding.diagnostic_tests.map((test: any) => test.id) : [],
        status: finding.status || "identified",
      });
      return;
    }

    setFormData({
      finding_title: "",
      category: "other",
      severity: "major",
      description: "",
      root_cause: "",
      diagnostic_codes: [],
      diagnostic_tests: [],
      status: "identified",
    });
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => diagnosisApi.findings.create(diagnosis.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
      onRefresh();
      setShowDialog(false);
      setEditingFinding(null);
      resetForm();
      toast({ title: "Finding added", variant: "default" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add finding",
        description: getUserFacingError(error),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => diagnosisApi.findings.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
      onRefresh();
      setShowDialog(false);
      setEditingFinding(null);
      resetForm();
      toast({ title: "Finding updated", variant: "default" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update finding",
        description: getUserFacingError(error),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => diagnosisApi.findings.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
      onRefresh();
      toast({ title: "Finding deleted", variant: "default" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete finding",
        description: getUserFacingError(error),
        variant: "destructive",
      });
    },
  });

  const findings = diagnosis.findings || [];
  const codes = diagnosis.diagnostic_codes || [];
  const tests = diagnosis.diagnostic_tests || [];

  const toggleLinkedItem = (field: "diagnostic_codes" | "diagnostic_tests", itemId: number, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      [field]: checked
        ? [...prev[field], itemId]
        : prev[field].filter((id) => id !== itemId),
    }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      finding_title: formData.finding_title.trim(),
      category: formData.category,
      severity: formData.severity,
      description: formData.description.trim(),
      root_cause: formData.root_cause.trim(),
      diagnostic_codes: formData.diagnostic_codes,
      diagnostic_tests: formData.diagnostic_tests,
      status: formData.status,
    };

    if (editingFinding) {
      updateMutation.mutate({ id: editingFinding.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <>
      <Card className="border-none shadow-sm bg-muted/50">
        <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/50 pb-3">
          <div className="space-y-1">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-foreground">Diagnosis Findings</CardTitle>
          </div>
          <Button
            size="sm"
            className="h-8"
            disabled={isDisabled}
            onClick={() => {
              setEditingFinding(null);
              resetForm();
              setShowDialog(true);
            }}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Finding
          </Button>
        </CardHeader>
        <CardContent className="pt-4">
          {findings.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {findings.map((finding: any) => (
                <div key={finding.id} className="rounded-lg border bg-card p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={finding.severity === "critical" ? "danger" : finding.severity === "major" ? "default" : "secondary"} className="capitalize">
                        {finding.severity_display || finding.severity}
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        {finding.category_display || finding.category}
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        {finding.status_display || finding.status}
                      </Badge>
                    </div>
                  </div>

                  <h3 className="mt-3 text-sm font-semibold text-foreground">{finding.finding_title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{finding.description}</p>

                  {(finding.diagnostic_codes?.length > 0 || finding.diagnostic_tests?.length > 0) && (
                    <div className="mt-3 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                      {finding.diagnostic_codes?.length > 0 && (
                        <p>Codes: {finding.diagnostic_codes.map((code: any) => code.code_number).join(", ")}</p>
                      )}
                      {finding.diagnostic_tests?.length > 0 && (
                        <p className={finding.diagnostic_codes?.length > 0 ? "mt-1" : ""}>
                          Tests: {finding.diagnostic_tests.map((test: any) => test.test_name).join(", ")}
                        </p>
                      )}
                    </div>
                  )}

                  {finding.root_cause && (
                    <div className="mt-3 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                      <p className="font-medium uppercase tracking-wide">Root Cause</p>
                      <p className="mt-1">{finding.root_cause}</p>
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8"
                      disabled={isDisabled}
                      onClick={() => {
                        setEditingFinding(finding);
                        resetForm(finding);
                        setShowDialog(true);
                      }}
                    >
                      <Edit className="mr-1.5 h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-destructive"
                      disabled={deleteMutation.isPending || isDisabled}
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Delete finding?",
                          description: `Delete finding: "${finding.finding_title}"?`,
                          confirmLabel: "Delete",
                          variant: "destructive",
                        });
                        if (ok) deleteMutation.mutate(finding.id);
                      }}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed bg-card/60 py-14 text-center">
              <Search className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
              <h3 className="text-sm font-medium text-foreground">No findings yet</h3>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={showDialog}
        onOpenChange={(open) => {
          setShowDialog(open);
          if (!open) {
            setEditingFinding(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-1rem)] max-w-3xl max-h-[calc(100dvh-1rem)] gap-0 p-0 sm:w-full sm:max-h-[calc(100dvh-2rem)]">
          <DialogHeader className="flex-shrink-0 border-b px-4 py-3 sm:px-5 sm:py-4">
            <DialogTitle className="text-base font-semibold">
              {editingFinding ? "Edit Finding" : "Add Finding"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Record the technical finding that explains why a recommendation is needed.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="min-h-0 flex flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="finding_title" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Finding Title
                  </Label>
                  <Input
                    id="finding_title"
                    value={formData.finding_title}
                    onChange={(event) => setFormData((prev) => ({ ...prev, finding_title: event.target.value }))}
                    placeholder="e.g. Cylinder 1 misfire confirmed"
                    className="h-9"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="finding_status" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Status
                  </Label>
                  <Select value={formData.status} onValueChange={(value) => setFormData((prev) => ({ ...prev, status: value }))}>
                    <SelectTrigger id="finding_status" className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="identified">Identified</SelectItem>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="fixed">Fixed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="finding_category" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Category
                  </Label>
                  <Select value={formData.category} onValueChange={(value) => setFormData((prev) => ({ ...prev, category: value }))}>
                    <SelectTrigger id="finding_category" className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="engine">Engine</SelectItem>
                      <SelectItem value="transmission">Transmission</SelectItem>
                      <SelectItem value="electrical">Electrical</SelectItem>
                      <SelectItem value="brakes">Brakes</SelectItem>
                      <SelectItem value="suspension">Suspension</SelectItem>
                      <SelectItem value="steering">Steering</SelectItem>
                      <SelectItem value="exhaust">Exhaust</SelectItem>
                      <SelectItem value="cooling">Cooling</SelectItem>
                      <SelectItem value="fuel">Fuel</SelectItem>
                      <SelectItem value="ac">AC</SelectItem>
                      <SelectItem value="body">Body</SelectItem>
                      <SelectItem value="interior">Interior</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="finding_severity" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Severity
                  </Label>
                  <Select value={formData.severity} onValueChange={(value) => setFormData((prev) => ({ ...prev, severity: value }))}>
                    <SelectTrigger id="finding_severity" className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="major">Major</SelectItem>
                      <SelectItem value="minor">Minor</SelectItem>
                      <SelectItem value="advisory">Advisory</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="finding_description" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Description
                </Label>
                <Textarea
                  id="finding_description"
                  value={formData.description}
                  onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="What did the diagnosis confirm?"
                  className="min-h-[90px] resize-y"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="finding_root_cause" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Root Cause
                </Label>
                <Textarea
                  id="finding_root_cause"
                  value={formData.root_cause}
                  onChange={(event) => setFormData((prev) => ({ ...prev, root_cause: event.target.value }))}
                  placeholder="Optional explanation of why this problem happened."
                  className="min-h-[72px] resize-y"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border bg-muted/30">
                  <div className="border-b px-4 py-3">
                    <p className="text-sm font-medium">Supporting Codes</p>
                  </div>
                  <div className="max-h-56 space-y-2 overflow-y-auto p-3 sm:p-4">
                    {codes.length > 0 ? (
                      codes.map((code: any) => (
                        <label key={code.id} className="flex cursor-pointer items-start gap-3 rounded-md border bg-background p-3">
                          <Checkbox
                            checked={formData.diagnostic_codes.includes(code.id)}
                            onCheckedChange={(checked) => toggleLinkedItem("diagnostic_codes", code.id, checked === true)}
                            className="mt-0.5"
                          />
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">{code.code_number}</p>
                            <p className="text-xs text-muted-foreground">{code.description}</p>
                          </div>
                        </label>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">No diagnostic codes recorded yet.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/30">
                  <div className="border-b px-4 py-3">
                    <p className="text-sm font-medium">Supporting Tests</p>
                  </div>
                  <div className="max-h-56 space-y-2 overflow-y-auto p-3 sm:p-4">
                    {tests.length > 0 ? (
                      tests.map((test: any) => (
                        <label key={test.id} className="flex cursor-pointer items-start gap-3 rounded-md border bg-background p-3">
                          <Checkbox
                            checked={formData.diagnostic_tests.includes(test.id)}
                            onCheckedChange={(checked) => toggleLinkedItem("diagnostic_tests", test.id, checked === true)}
                            className="mt-0.5"
                          />
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">{test.test_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {test.status_display || test.status}
                              {test.actual_result ? ` • ${test.actual_result}` : ""}
                            </p>
                          </div>
                        </label>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">No diagnostic tests recorded yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-shrink-0 flex-row items-center justify-end gap-2 border-t bg-card px-4 py-3 sm:px-5">
              <Button type="button" variant="outline" className="flex-1 sm:flex-none" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1 sm:flex-none" disabled={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending
                  ? "Saving..."
                  : editingFinding
                    ? "Update Finding"
                    : "Save Finding"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog />
    </>
  );
}


// Recommendations Tab Component
function RecommendationsTab({
  diagnosis,
  workOrderId,
  onRefresh,
  isDisabled = false,
  isMobile = false,
  isOnline = true,
}: {
  diagnosis: Diagnosis;
  workOrderId: number;

  workOrder?: any;
  onRefresh: () => void;
  isDisabled?: boolean;
  isMobile?: boolean;
  isOnline?: boolean;
}) {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const queryClient = useQueryClient();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingRecommendation, setEditingRecommendation] = useState<any>(null);
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [showAiDialog, setShowAiDialog] = useState(false);

  const aiSuggestMutation = useMutation({
    mutationFn: () => diagnosisApi.getAiSuggestions(diagnosis.id),
    onSuccess: (suggestions) => {
      if (!suggestions?.length) {
        toast({ title: "No AI suggestions", description: "Add codes or findings first, or check the Gemini API key under Integrations.", variant: "default" });
        return;
      }
      setAiSuggestions(suggestions);
      setShowAiDialog(true);
    },
    onError: (error: any) => {
      toast({ title: "AI suggestions failed", description: getUserFacingError(error), variant: "destructive" });
    },
  });

  const applyAiSuggestionsMutation = useMutation({
    mutationFn: async (items: any[]) => {
      for (const item of items) {
        const partsList = (item.parts_needed || "")
          .split(",")
          .map((p: string) => p.trim())
          .filter(Boolean)
          .map((part_name: string) => ({ part_name, quantity: 1 }));
        await diagnosisApi.addRecommendation(diagnosis.id, {
          recommendation_type: item.recommendation_type === "service" ? "service" : "repair",
          description: item.description,
          priority: item.priority || "recommended",
          parts_needed: partsList,
          findings: [],
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
      onRefresh();
      setShowAiDialog(false);
      setAiSuggestions([]);
      toast({ title: "AI recommendations added", variant: "default" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to add recommendations", description: getUserFacingError(error), variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      runDiagnosisMutation(
        workOrderId,
        isOnline,
        {
          endpoint: `/diagnosis/diagnoses/${diagnosis.id}/add_recommendation/`,
          method: "POST",
          payload: data,
        },
        () => diagnosisApi.addRecommendation(diagnosis.id, data)
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
      onRefresh();
      setShowAddDialog(false);
      setEditingRecommendation(null);
      toast({
        title: isMobile && !isOnline ? "Queued offline" : "Recommendation added",
        variant: "default",
      });
    },

    onError: (error: any) => {
      toast({
        title: "Failed to add recommendation",
        description: getUserFacingError(error),
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
        description: getUserFacingError(error),
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
        description: getUserFacingError(error),
        variant: "destructive",
      });
    },
  });

  const decisionMutation = useMutation({
    mutationFn: ({ recommendationIds, decision }: { recommendationIds: number[]; decision: "approved" | "deferred" | "declined" }) =>
      diagnosisApi.approveRecommendations(diagnosis.id, {
        recommendation_ids: recommendationIds,
        decision,
        decision_method: "supervisor_instruction",
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
      onRefresh();
      toast({
        title: `Recommendation ${variables.decision.replace("_", " ")}`,
        variant: "default",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update recommendation",
        description: getUserFacingError(error),
        variant: "destructive",
      });
    },
  });

  const requestQuoteMutation = useMutation({
    mutationFn: (recommendationIds: number[]) =>
      diagnosisApi.submitRecommendationsForQuote(diagnosis.id, {
        recommendation_ids: recommendationIds,
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["diagnosis", "workorder", workOrderId] });
      queryClient.invalidateQueries({ queryKey: ["workorder", workOrderId] });
      queryClient.invalidateQueries({ queryKey: ["workorder-parts", workOrderId] });
      queryClient.invalidateQueries({ queryKey: ["diagnosis", "quotation-queue"] });
      queryClient.invalidateQueries({ queryKey: ["parts-requests-stats"] });
      queryClient.invalidateQueries({ queryKey: ["stores-workbench", "parts-requests"] });
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      onRefresh();
      const estimateText = response.quotation_estimate_number
        ? ` Estimate ${response.quotation_estimate_number} is linked to this work order.`
        : "";
      const partsText =
        typeof response.parts_synced === "number"
          ? ` ${response.parts_synced} part request(s) sent to stores.`
          : "";
      const laborText =
        typeof response.labor_lines_synced === "number"
          ? ` ${response.labor_lines_synced} labor line(s) added to the estimate.`
          : "";
      toast({
        title: "Stores notified",
        description: `${response.message}${estimateText}${partsText}${laborText}`,
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send recommendations",
        description: getUserFacingError(error),
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
      queryClient.invalidateQueries({ queryKey: ["workorder-tasks", workOrderId] });
      queryClient.invalidateQueries({ queryKey: ["workorder-parts", workOrderId] });
      onRefresh();
      toast({
        title: "Task created",
        description: response.message,
        variant: "default",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create task",
        description: getUserFacingError(error),
        variant: "destructive",
      });
    },
  });

  const recommendations = diagnosis.repair_recommendations || [];
  const pendingRecommendations = recommendations.filter((rec: any) => (rec.approval_status || "pending_approval") === "pending_approval" && !rec.converted_to_task_id);
  const approvedRecommendations = recommendations.filter((rec: any) => rec.approval_status === "approved" && !rec.converted_to_task_id);
  const deferredRecommendations = recommendations.filter((rec: any) => rec.approval_status === "deferred" && !rec.converted_to_task_id);
  const declinedRecommendations = recommendations.filter((rec: any) => rec.approval_status === "declined" && !rec.converted_to_task_id);
  const awaitingQuoteSubmission = recommendations.filter((rec: any) => ["pending_approval", "approved"].includes(rec.approval_status || "pending_approval") && (rec.quotation_status || "not_requested") === "not_requested" && !rec.converted_to_task_id);
  const quoteRequestedRecommendations = recommendations.filter((rec: any) => ["pending_approval", "approved"].includes(rec.approval_status || "pending_approval") && rec.quotation_status === "requested" && !rec.converted_to_task_id);
  const pendingQuotedRecommendations = pendingRecommendations.filter((rec: any) => rec.quotation_status === "quoted");
  const quotedRecommendations = approvedRecommendations.filter((rec: any) => rec.quotation_status === "quoted");
  const convertedRecommendations = recommendations.filter((rec: any) => !!rec.converted_to_task_id);

  const renderMeta = (rec: any) => {
    const partsCount = Array.isArray(rec.parts_needed) ? rec.parts_needed.filter((part: any) => part?.part_name).length : 0;
    const findingCount = Array.isArray(rec.linked_findings) ? rec.linked_findings.length : 0;

    return (
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {partsCount > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
            <Package className="h-3 w-3" />
            {partsCount} part{partsCount === 1 ? "" : "s"}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
            <Package className="h-3 w-3" />
            No parts listed
          </span>
        )}
        {findingCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
            <MessageSquare className="h-3 w-3" />
            {findingCount} linked finding{findingCount === 1 ? "" : "s"}
          </span>
        )}
      </div>
    );
  };

  const renderPartsHandoff = (rec: any) => {
    const parts = Array.isArray(rec.parts_needed)
      ? rec.parts_needed.filter((part: any) => part?.part_name || part?.part_number)
      : [];

    if (!parts.length) {
      return null;
    }

    return (
      <div className="mt-3 rounded-md border bg-muted/20 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Parts for stores</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {parts.map((part: any, index: number) => (
            <div key={`${part.part_id || part.part_number || part.part_name}-${index}`} className="rounded-md bg-background px-3 py-2 text-xs">
              <p className="font-medium text-foreground">{part.part_name || part.part_number}</p>
              <p className="mt-0.5 text-muted-foreground">
                Qty {part.quantity || 1}
                {part.part_number ? ` • ${part.part_number}` : ""}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderRecommendationCard = (rec: any) => (
    <div key={rec.id} className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={rec.priority === "critical" ? "danger" : rec.priority === "necessary" ? "default" : "secondary"} className="capitalize">
            {rec.priority_display || rec.priority}
          </Badge>
          <Badge variant="outline" className="capitalize">
            {rec.recommendation_type_display || rec.recommendation_type}
          </Badge>
          <Badge variant="outline" className="capitalize">
            {rec.approval_status_display || "Pending Approval"}
          </Badge>
          {["pending_approval", "approved"].includes(rec.approval_status || "pending_approval") && (
            <Badge variant="outline" className="capitalize">
              {rec.quotation_status_display || "Not Requested"}
            </Badge>
          )}
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 text-foreground">{rec.description}</p>

      <div className="mt-3">{renderMeta(rec)}</div>

      {renderPartsHandoff(rec)}

      {rec.quotation_status === "quoted" && rec.quotation_estimate_number && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <div>
            <p className="font-medium text-foreground">Stores estimate {rec.quotation_estimate_number}</p>
            <p>Includes work-order labor stages, diagnosis context, and parts requested from stores.</p>
          </div>
          {rec.quotation_estimate_id && (
            <Link href={`/billing/estimates/${rec.quotation_estimate_id}`} className="inline-flex items-center rounded-md border bg-background px-2.5 py-1.5 font-medium text-primary hover:bg-muted">
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              Open estimate
            </Link>
          )}
        </div>
      )}

      {Array.isArray(rec.linked_findings) && rec.linked_findings.length > 0 && (
        <div className="mt-3 rounded-md border bg-muted/30 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Supporting evidence</p>
          <div className="mt-2 space-y-2">
            {rec.linked_findings.map((finding: any) => (
              <div key={finding.id} className="text-xs text-muted-foreground">
                <p className="font-medium text-foreground">{finding.finding_title}</p>
                {Array.isArray(finding.diagnostic_codes) && finding.diagnostic_codes.length > 0 && (
                  <p>Codes: {finding.diagnostic_codes.map((code: any) => code.code_number).join(", ")}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
        {rec.approval_status === "pending_approval" && rec.quotation_status === "quoted" && (
          <>
            <Button size="sm" className="h-8" onClick={() => decisionMutation.mutate({ recommendationIds: [rec.id], decision: "approved" })} disabled={decisionMutation.isPending || isDisabled}>
              <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
              Approve
            </Button>
            <Button size="sm" variant="outline" className="h-8" onClick={() => decisionMutation.mutate({ recommendationIds: [rec.id], decision: "deferred" })} disabled={decisionMutation.isPending || isDisabled}>
              Defer
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-destructive" onClick={() => decisionMutation.mutate({ recommendationIds: [rec.id], decision: "declined" })} disabled={decisionMutation.isPending || isDisabled}>
              Decline
            </Button>
          </>
        )}

        {["pending_approval", "approved"].includes(rec.approval_status || "pending_approval") && (rec.quotation_status || "not_requested") === "not_requested" && (
          <Button size="sm" className="h-8" onClick={() => requestQuoteMutation.mutate([rec.id])} disabled={requestQuoteMutation.isPending || isDisabled}>
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            Send to Stores for Estimate
          </Button>
        )}

        {rec.approval_status === "approved" && rec.quotation_status === "quoted" && !rec.converted_to_task_id && (
          <Button size="sm" className="h-8" onClick={() => convertToTasksMutation.mutate([rec.id])} disabled={convertToTasksMutation.isPending || isDisabled}>
            <ListChecks className="mr-1.5 h-3.5 w-3.5" />
            Create Task
          </Button>
        )}

        {!rec.converted_to_task_id && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={() => {
              setEditingRecommendation(rec);
              setShowAddDialog(true);
            }}
            disabled={isDisabled}
          >
            <Edit className="mr-1.5 h-3.5 w-3.5" />
            {rec.quotation_status === "not_requested" ? "Edit" : "Revise"}
          </Button>
        )}

        {!rec.converted_to_task_id && rec.approval_status === "pending_approval" && (rec.quotation_status || "not_requested") === "not_requested" && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-destructive"
            onClick={async () => {
              const ok = await confirm({
                title: "Delete recommendation?",
                description: `Delete recommendation: "${rec.description}"?`,
                confirmLabel: "Delete",
                variant: "destructive",
              });
              if (ok) deleteMutation.mutate(rec.id);
            }}
            disabled={deleteMutation.isPending || isDisabled}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete
          </Button>
        )}

        {rec.converted_to_task_id && (
          <Link href={`/workorders/${workOrderId}`} className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium text-primary hover:bg-muted">
            View Task #{rec.converted_to_task_id}
          </Link>
        )}
      </div>
    </div>
  );

  const renderSection = (title: string, items: any[], description: string) => {
    if (!items.length) {
      return null;
    }

    return (
      <div className="space-y-3">
        <div className="border-b pb-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {items.map(renderRecommendationCard)}
        </div>
      </div>
    );
  };

  return (
    <>
      <Card className="border-none shadow-sm bg-muted/50">
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b bg-muted/50">
          <div className="space-y-1">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-foreground">Repair Recommendations</CardTitle>
            <CardDescription className="text-xs">
              {recommendations.length} total • {awaitingQuoteSubmission.length} need estimate • {quoteRequestedRecommendations.length} with stores • {pendingQuotedRecommendations.length} ready for customer approval • {quotedRecommendations.length} ready for work
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => aiSuggestMutation.mutate()}
              size="sm"
              variant="outline"
              className="h-8"
              disabled={isDisabled || aiSuggestMutation.isPending}
            >
              {aiSuggestMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              )}
              AI Suggest
            </Button>
            <Button onClick={() => setShowAddDialog(true)} size="sm" className="h-8" disabled={isDisabled}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {recommendations.length > 0 ? (
            <div className="space-y-6">
              {renderSection("Send to Stores for Estimate", awaitingQuoteSubmission, "Recommendations must be priced by stores before the customer approval request is sent.")}
              {renderSection("Estimate in Progress", quoteRequestedRecommendations, "Stores is preparing the estimate and parts pricing for these recommendations.")}
              {renderSection("Ready for Customer Approval", pendingQuotedRecommendations, "Priced recommendations can now be sent to the customer for approval.")}
              {renderSection("Approved - Ready for Work", quotedRecommendations, "Customer approved and stores quoted these items. Convert them into executable work-order tasks.")}
              {renderSection("Deferred", deferredRecommendations, "Deferred items stay on the vehicle record and should surface on future visits.")}
              {renderSection("Declined", declinedRecommendations, "Declined items remain documented but are not active work.")}
              {renderSection("Converted to Tasks", convertedRecommendations, "These recommendations are already linked to work-order tasks.")}
            </div>
          ) : (
            <div className="text-center py-16 bg-muted/50 rounded-lg border border-dashed border-border">
              <Wrench className="w-12 h-12 mx-auto mb-3 text-muted-foreground text-muted-foreground" />
              <h3 className="text-sm font-medium text-foreground mb-1">No recommendations yet</h3>
              <p className="text-xs text-muted-foreground mb-4 max-w-sm mx-auto">Add the repairs or services the vehicle needs, then attach any parts stores should quote.</p>
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
        key={editingRecommendation?.id ?? (showAddDialog ? "new" : "closed")}
        open={showAddDialog}
        onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) {
            setEditingRecommendation(null);
          }
        }}
        recommendation={editingRecommendation}
        findings={diagnosis.findings || []}
        vehicle={
          workOrder?.vehicle && typeof workOrder.vehicle === "object"
            ? {
                id: workOrder.vehicle.id,
                make: workOrder.vehicle.make,
                model: workOrder.vehicle.model,
                year: workOrder.vehicle.year,
              }
            : workOrder?.vehicle
              ? { id: Number(workOrder.vehicle) }
              : null
        }
        onSave={(data) => {
          if (editingRecommendation) {
            updateMutation.mutate({ id: editingRecommendation.id, data });
          } else {
            createMutation.mutate(data);
          }
        }}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
      <Dialog open={showAiDialog} onOpenChange={setShowAiDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> AI Repair Suggestions
            </DialogTitle>
            <DialogDescription>Review and add Gemini-generated recommendations to this diagnosis.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {aiSuggestions.map((s, i) => (
              <div key={i} className="rounded-md border p-3 text-sm">
                <div className="flex gap-2 mb-1">
                  <Badge variant="outline" className="capitalize">{s.priority}</Badge>
                  <Badge variant="secondary" className="capitalize">{s.recommendation_type}</Badge>
                </div>
                <p>{s.description}</p>
                {s.parts_needed && <p className="text-xs text-muted-foreground mt-1">Parts: {s.parts_needed}</p>}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAiDialog(false)}>Cancel</Button>
            <Button
              onClick={() => applyAiSuggestionsMutation.mutate(aiSuggestions)}
              disabled={applyAiSuggestionsMutation.isPending}
            >
              {applyAiSuggestionsMutation.isPending ? "Adding…" : `Add ${aiSuggestions.length} recommendation(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog />
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
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const queryClient = useQueryClient();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [analysisByPhoto, setAnalysisByPhoto] = useState<Record<number, { summary: string; suggested_severity: string }>>({});

  const analyzeMutation = useMutation({
    mutationFn: (id: number) => diagnosisApi.photos.analyzeDamage(id),
    onSuccess: (data, id) => {
      setAnalysisByPhoto((prev) => ({ ...prev, [id]: { summary: data.summary, suggested_severity: data.suggested_severity } }));
      toast({ title: "Smart Scan complete", description: data.summary?.slice(0, 80) });
      setAnalyzingId(null);
    },
    onError: (error: any) => {
      toast({ title: "Smart Scan failed", description: getUserFacingError(error), variant: "destructive" });
      setAnalyzingId(null);
    },
  });

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
        description: getUserFacingError(error),
        variant: "destructive",
      });
    },
  });

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
            <div className="p-4 bg-destructive/10 text-destructive text-sm rounded-lg flex items-center justify-center">
              Failed to load photos. Please try again.
            </div>
          ) : photos.length === 0 ? (
            <div className="text-center py-16 bg-muted/50 rounded-lg border border-dashed border-border">
              <Camera className="w-12 h-12 mx-auto mb-3 text-muted-foreground text-muted-foreground" />
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
                              variant="secondary"
                              size="icon"
                              className="h-8 w-8 rounded-full shadow-lg"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAnalyzingId(photo.id);
                                analyzeMutation.mutate(photo.id);
                              }}
                              disabled={isDisabled || analyzingId === photo.id}
                              aria-label="Smart Scan"
                            >
                              {analyzingId === photo.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Sparkles className="w-4 h-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom"><p>Smart Scan (AI)</p></TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="destructive"
                              size="icon"
                              className="h-8 w-8 rounded-full shadow-lg bg-destructive hover:bg-destructive border-none transition-all duration-200"
                              onClick={async (e) => {
                                e.stopPropagation();
                                const ok = await confirm({
                                  title: "Delete photo?",
                                  description: "Delete this photo?",
                                  confirmLabel: "Delete",
                                  variant: "destructive",
                                });
                                if (ok) deleteMutation.mutate(photo.id);
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
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px] shadow-sm capitalize">
                          {photo.photo_type.replace('_', ' ')}
                        </Badge>
                      </div>
                    )}

                  </div>

                  <div className="p-3">
                    <p className="text-xs font-medium text-foreground truncate" title={photo.caption || "Untitled"}>
                      {photo.caption || <span className="text-muted-foreground italic">No caption</span>}
                    </p>
                    {analysisByPhoto[photo.id] && (
                      <p className="text-[10px] text-primary mt-1 line-clamp-2" title={analysisByPhoto[photo.id].summary}>
                        AI: {analysisByPhoto[photo.id].summary}
                      </p>
                    )}
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
      <ConfirmDialog />
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
        description: getUserFacingError(error),
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

  const handleClose = React.useCallback(() => {
    setSelectedFile(null);
    setPreview(null);
    setFormData({
      caption: "",
      photo_type: "evidence",
    });
    onOpenChange(false);
  }, [onOpenChange]);

  React.useEffect(() => {
    if (!open) {
      handleClose();
    }
  }, [open, handleClose]);

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
              <Label htmlFor="photo" className="text-sm font-medium text-card-foreground">Photo <span className="text-destructive">*</span></Label>
              <input
                id="photo"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                required
              />
              <div
                className={`group cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all duration-200 ${preview ? "border-primary/20 bg-primary/5" : "border-border hover:border-primary/30 hover:bg-muted"}`}
                onClick={() => document.getElementById("photo")?.click()}
              >
                {preview ? (
                  <div className="space-y-4">
                    { }
                    <div className="relative inline-block rounded-lg overflow-hidden shadow-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
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
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 transition-transform duration-200 group-hover:scale-110">
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
                <Label htmlFor="photo_type" className="text-sm font-medium text-card-foreground">Photo Type <span className="text-destructive">*</span></Label>
                <Select
                  value={formData.photo_type}
                  onValueChange={(val) =>
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
  onUpdate,
  isUpdating,
  isDisabled = false,
}: {
  diagnosis: Diagnosis;

  workOrder: any;

  onUpdate: (data: any) => void;
  isUpdating: boolean;
  isDisabled?: boolean;
}) {
  const { formatCurrency } = useCurrency(); // Added hook
  const { toast } = useToast();
  const [notes, setNotes] = useState(diagnosis.diagnostic_notes || "");
  const [generatingReport, setGeneratingReport] = useState(false);

  const handleGenerateReport = async (format: 'html' | 'pdf') => {
    setGeneratingReport(true);
    try {
      const data = await diagnosisApi.generateReport(diagnosis.id, format);
      if (format === 'html' && typeof data === 'string') {
        const w = window.open('', '_blank');
        if (w) { w.document.write(data); w.document.close(); }
      } else if (data instanceof Blob) {
        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = `diagnosis_report_${diagnosis.id}.${format === 'pdf' ? 'pdf' : 'txt'}`;
        a.click();
        URL.revokeObjectURL(url);
      }
      toast({ title: 'Customer report generated', variant: 'default' });
    } catch (error: any) {
      toast({ title: 'Report failed', description: getUserFacingError(error), variant: 'destructive' });
    } finally {
      setGeneratingReport(false);
    }
  };

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
    if (activeStartTime && !["awaiting_approval", "completed"].includes(diagnosis.status)) {
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
        <CardHeader className="pb-3 border-b bg-muted/50 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Overview</CardTitle>
            <CardDescription>Key metrics for this diagnosis</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={generatingReport} onClick={() => handleGenerateReport('html')}>
              {generatingReport ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
              AI Report
            </Button>
            <Button size="sm" variant="outline" disabled={generatingReport} onClick={() => handleGenerateReport('pdf')}>
              <FileText className="h-4 w-4 mr-1" /> PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-3 gap-6">
            <div className="flex flex-col items-center justify-center p-4 bg-card rounded-xl border border-border shadow-sm transition-all hover:shadow-md">
              <div className="mb-3 rounded-full bg-primary/10 p-2 text-primary">
                <Clock className="w-5 h-5" />
              </div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Time Spent</p>
              <p className="text-lg font-bold text-foreground">
                {totalTimeSpent || "-"}
              </p>
            </div>
            <div className="flex flex-col items-center justify-center p-4 bg-card rounded-xl border border-border shadow-sm transition-all hover:shadow-md">
              <div className="p-2 mb-3 rounded-full bg-success/10 dark:bg-success/20 text-success">
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
              <div className="mb-3 rounded-full bg-primary/10 p-2 text-primary">
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
            className="flex-1 min-h-[200px] resize-none bg-muted border-border focus:bg-card dark:focus:bg-background transition-colors"
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
