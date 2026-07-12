"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Clock,
  FileCheck,
  Image as ImageIcon,
  MessageSquare,
  MoreVertical,
  Package,
  Pause,
  Play,
  Plus,
  Send,
  SkipForward,
  Undo2,
  Wrench,
} from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useToast } from "@/lib/hooks/useToast";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { getUserFacingError } from "@/lib/api/errors";
import { workordersApi } from "@/lib/api/workorders";
import { adminApi } from "@/lib/api/admin";
import { workOrderTasksApi, ServiceTask } from "@/lib/api/workorder-tasks";
import { workOrderPartsApi, WorkOrderPart } from "@/lib/api/workorder-parts";
import { workOrderNotesApi } from "@/lib/api/workorder-notes";
import { workOrderPhotosApi, WorkOrderPhoto } from "@/lib/api/workorder-photos";
import AddTaskDialog from "../components/AddTaskDialog";
import AddPartDialog from "../components/AddPartDialog";
import { isDiagnosisPausedWorkOrder } from "@/lib/utils/workorder-inspection-stage";
import { isRoutineMaintenanceWorkOrder } from "@/lib/utils/workorder-workflow-steps";
import { workOrderSkipsRepairs } from "@/lib/workorders/work-order-profile";

type RepairTab = "tasks" | "parts" | "notes" | "photos" | "readiness";

const repairStatuses = new Set(["approved", "in_progress", "paused", "additional_work_found", "quality_check"]);

const PART_STATUSES_OK_FOR_TASK = new Set(["ready", "installed", "returned"]);

const getTaskVariant = (status: string): BadgeProps["variant"] => {
  if (status === "completed") return "success";
  if (status === "paused") return "warning";
  if (status === "in_progress") return "info";
  if (status === "skipped") return "secondary";
  return "warning";
};

const getPartVariant = (status: string): BadgeProps["variant"] => {
  if (status === "installed") return "success";
  if (["ready", "received"].includes(status)) return "info";
  if (status === "returned") return "secondary";
  return "warning";
};

const formatStatus = (status?: string) => (status || "unknown").replace(/_/g, " ");

const getTaskHours = (task: ServiceTask) => {
  const values = [task.actual_hours, task.calculated_hours, task.estimated_hours];
  for (const value of values) {
    const hours = Number(value || 0);
    if (Number.isFinite(hours) && hours > 0) {
      return hours;
    }
  }
  return 0;
};

function getTaskExecutionPresentation(
  task: ServiceTask,
  parts: WorkOrderPart[],
  workOrderStatus?: string
) {
  const taskParts = parts.filter((part) => part.task === task.id);
  const repairsPaused = workOrderStatus === "paused";

  if (task.status === "in_progress" && repairsPaused) {
    return {
      badgeVariant: "warning" as const,
      badgeLabel: "Paused",
      canStart: false,
      canComplete: false,
      canSkip: false,
      helperText: "Repairs are paused. Resume the work order before completing this task.",
    };
  }

  if (task.status !== "pending") {
    return {
      badgeVariant: getTaskVariant(task.status),
      badgeLabel: formatStatus(task.status),
      canStart: false,
      canComplete: task.status === "in_progress" && !repairsPaused,
      canSkip: task.status === "in_progress" && !repairsPaused,
      helperText: "",
    };
  }

  if (repairsPaused) {
    return {
      badgeVariant: "warning" as const,
      badgeLabel: "Paused",
      canStart: false,
      canComplete: false,
      canSkip: false,
      helperText: "Repairs are paused. Resume before starting tasks.",
    };
  }

  if (taskParts.length === 0) {
    return {
      badgeVariant: "warning" as const,
      badgeLabel: "Pending",
      canStart: true,
      canComplete: false,
      canSkip: true,
      helperText: "",
    };
  }

  const unresolvedParts = taskParts.filter((part) => !PART_STATUSES_OK_FOR_TASK.has(part.status));
  if (unresolvedParts.length > 0) {
    return {
      badgeVariant: "warning" as const,
      badgeLabel: "Pending | Waiting Allocation",
      canStart: false,
      canComplete: false,
      canSkip: true,
      helperText: `Waiting parts: ${unresolvedParts.map((part) => part.part_name).join(", ")}`,
    };
  }

  return {
    badgeVariant: "info" as const,
    badgeLabel: "Pending | Ready to Start",
    canStart: true,
    canComplete: false,
    canSkip: true,
    helperText:
      taskParts.every((part) => part.status === "returned")
        ? "All linked parts were returned. Start if labor is still needed, or skip this task."
        : "All linked parts are allocated, installed, or returned.",
  };
}

export default function RepairsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workOrderId = Number(params.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { formatCurrency } = useCurrency();
  const { hasPermission } = usePermissions();
  const canAddRepairItems = hasPermission("edit_workorders");

  const [activeTab, setActiveTab] = useState<RepairTab>("tasks");
  const [showAddTaskDialog, setShowAddTaskDialog] = useState(false);
  const [showAddPartDialog, setShowAddPartDialog] = useState(false);
  const [showAdditionalWorkDialog, setShowAdditionalWorkDialog] = useState(false);
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [showPhotoDialog, setShowPhotoDialog] = useState(false);
  const [showRequestQcDialog, setShowRequestQcDialog] = useState(false);
  const [qcInspectorId, setQcInspectorId] = useState("");
  const [completeTask, setCompleteTask] = useState<ServiceTask | null>(null);
  const [returningPart, setReturningPart] = useState<WorkOrderPart | null>(null);
  const [additionalWorkSummary, setAdditionalWorkSummary] = useState("");
  const [additionalWorkArea, setAdditionalWorkArea] = useState("");
  const [additionalWorkSeverity, setAdditionalWorkSeverity] = useState("medium");
  const [additionalWorkReason, setAdditionalWorkReason] = useState("");
  const [additionalWorkRecommendation, setAdditionalWorkRecommendation] = useState("");
  const [additionalWorkLaborHours, setAdditionalWorkLaborHours] = useState("");
  const [additionalWorkPartsEstimate, setAdditionalWorkPartsEstimate] = useState("");
  const [additionalWorkCustomerNote, setAdditionalWorkCustomerNote] = useState("");
  const [pauseReason, setPauseReason] = useState("");
  const [noteText, setNoteText] = useState("");
  const [completionNotes, setCompletionNotes] = useState("");
  const [completionHours, setCompletionHours] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoType, setPhotoType] = useState<"before" | "during" | "after" | "part" | "other">("during");
  const [photoCaption, setPhotoCaption] = useState("");

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (requestedTab && ["tasks", "parts", "notes", "photos", "readiness"].includes(requestedTab)) {
      setActiveTab(requestedTab as RepairTab);
    }
  }, [searchParams]);

  const { data: workOrder, isLoading: workOrderLoading, error: workOrderError } = useQuery({
    queryKey: ["workorder", workOrderId],
    queryFn: () => workordersApi.get(workOrderId),
    enabled: Number.isFinite(workOrderId),
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["workorder-tasks", workOrderId],
    queryFn: () => workOrderTasksApi.list({ work_order: workOrderId }),
    enabled: Number.isFinite(workOrderId),
  });

  const { data: parts = [], isLoading: partsLoading } = useQuery({
    queryKey: ["workorder-parts", workOrderId],
    queryFn: () => workOrderPartsApi.list({ work_order: workOrderId }),
    enabled: Number.isFinite(workOrderId),
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["workorder-notes", workOrderId],
    queryFn: () => workOrderNotesApi.list({ work_order: workOrderId }),
    enabled: Number.isFinite(workOrderId),
  });

  const { data: photos = [] } = useQuery({
    queryKey: ["workorder-photos", workOrderId],
    queryFn: () => workOrderPhotosApi.list({ work_order: workOrderId }),
    enabled: Number.isFinite(workOrderId),
  });

  const inspectorsBranchId =
    typeof workOrder?.branch === "object" ? workOrder?.branch?.id : workOrder?.branch;

  const { data: qualityInspectors = [] } = useQuery({
    queryKey: ["quality-inspectors", inspectorsBranchId],
    queryFn: () =>
      adminApi.users.qualityInspectors(
        inspectorsBranchId ? { branch: Number(inspectorsBranchId) } : undefined
      ),
    enabled: showRequestQcDialog,
  });

  const refreshRepairs = () => {
    queryClient.invalidateQueries({ queryKey: ["workorder", workOrderId] });
    queryClient.invalidateQueries({ queryKey: ["workorder-tasks", workOrderId] });
    queryClient.invalidateQueries({ queryKey: ["workorder-parts", workOrderId] });
    queryClient.invalidateQueries({ queryKey: ["workorder-notes", workOrderId] });
    queryClient.invalidateQueries({ queryKey: ["workorder-photos", workOrderId] });
  };

  const repairTasks = useMemo(
    () => tasks.filter((task) => !task.is_workflow_task),
    [tasks]
  );

  const stats = useMemo(() => {
    const completedTasks = repairTasks.filter((task) => ["completed", "skipped"].includes(task.status)).length;
    const repairsPaused = workOrder?.status === "paused";
    const activeTasks = repairsPaused
      ? 0
      : repairTasks.filter((task) => task.status === "in_progress").length;
    const pausedTasks = repairsPaused
      ? repairTasks.filter((task) => task.status === "in_progress").length
      : 0;
    const installedParts = parts.filter((part) => ["installed", "returned"].includes(part.status)).length;
    const totalLaborHours = repairTasks.reduce((sum, task) => {
      const value = getTaskHours(task);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);
    const totalPartsCost = parts.reduce((sum, part) => {
      const value = Number(part.total_cost || 0);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);

    return {
      completedTasks,
      activeTasks,
      pausedTasks,
      installedParts,
      totalLaborHours,
      totalPartsCost,
      taskProgress: repairTasks.length ? Math.round((completedTasks / repairTasks.length) * 100) : 0,
      partProgress: parts.length ? Math.round((installedParts / parts.length) * 100) : 0,
    };
  }, [parts, repairTasks, workOrder?.status]);

  const readiness = useMemo(() => {
    const incompleteTasks = repairTasks.filter((task) => !["completed", "skipped"].includes(task.status));
    const unresolvedParts = parts.filter((part) => !["installed", "returned"].includes(part.status));
    const returnedPartsWithoutReason = parts.filter(
      (part) => part.status === "returned" && !part.resolution_notes?.trim()
    );
    const blockers = [
      ...incompleteTasks.map((task) => `Finish or skip task: ${task.description}`),
      ...unresolvedParts.map((part) => `Resolve part: ${part.part_name}`),
      ...returnedPartsWithoutReason.map((part) => `Add return reason: ${part.part_name}`),
    ];

    return { incompleteTasks, unresolvedParts, returnedPartsWithoutReason, blockers };
  }, [parts, repairTasks]);

  const startRepairsMutation = useMutation({
    mutationFn: () => workordersApi.startWork(workOrderId),
    onSuccess: () => {
      toast({ title: "Repairs started", description: "Repair tasks are ready." });
      refreshRepairs();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to start repairs",
        description: getUserFacingError(error),
        variant: "destructive",
      });
    },
  });

  const startTaskMutation = useMutation({
    mutationFn: (taskId: number) => workOrderTasksApi.start(taskId),
    onSuccess: refreshRepairs,
  });

  const skipTaskMutation = useMutation({
    mutationFn: (taskId: number) =>
      workOrderTasksApi.skip(taskId, { notes: "Skipped from repairs workspace" }),
    onSuccess: () => {
      refreshRepairs();
      toast({ title: "Task skipped" });
    },
    onError: (error: unknown) => {
      toast({
        title: "Could not skip task",
        description: getUserFacingError(error, "Unable to skip task."),
        variant: "destructive",
      });
    },
  });

  const reassignTaskMutation = useMutation({
    mutationFn: ({ taskId, assignedTo }: { taskId: number; assignedTo: number | null }) =>
      workOrderTasksApi.patch(taskId, { assigned_to: assignedTo }),
    onSuccess: () => {
      refreshRepairs();
      toast({ title: "Task assignee updated", variant: "success" });
    },
    onError: (error: unknown) => {
      toast({
        title: "Reassign failed",
        description: getUserFacingError(error, "Could not update task assignee."),
        variant: "destructive",
      });
    },
  });

  const assigneeOptions = useMemo(() => {
    return (workOrder?.assigned_technicians_detail || []).map((t) => ({
      id: t.id,
      name: t.name,
    }));
  }, [workOrder?.assigned_technicians_detail]);

  const completeTaskMutation = useMutation({
    mutationFn: ({ taskId, data }: { taskId: number; data?: { notes?: string; actual_hours?: number } }) =>
      workOrderTasksApi.complete(taskId, data),
    onSuccess: () => {
      setCompleteTask(null);
      setCompletionNotes("");
      setCompletionHours("");
      refreshRepairs();
      toast({ title: "Task completed" });
    },
    onError: (error: any) => {
      toast({
        title: "Task completion blocked",
        description: getUserFacingError(error, "Unable to complete task."),
        variant: "destructive",
      });
    },
  });

  const markInstalledMutation = useMutation({
    mutationFn: (partId: number) => workOrderPartsApi.markInstalled(partId),
    onSuccess: () => {
      refreshRepairs();
      toast({ title: "Part installed" });
    },
  });

  const markReturnedMutation = useMutation({
    mutationFn: ({ partId, reason }: { partId: number; reason: string }) => workOrderPartsApi.markReturned(partId, reason),
    onSuccess: () => {
      setReturningPart(null);
      setReturnReason("");
      refreshRepairs();
      toast({ title: "Part returned" });
    },
  });

  const createNoteMutation = useMutation({
    mutationFn: (note: string) =>
      workOrderNotesApi.create({
        work_order: workOrderId,
        note_type: "internal",
        note,
        is_important: false,
        is_customer_visible: false,
      }),
    onSuccess: () => {
      setShowNoteDialog(false);
      setNoteText("");
      refreshRepairs();
      toast({ title: "Repair note added" });
    },
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: () => {
      if (!photoFile) throw new Error("Choose a photo first.");
      return workOrderPhotosApi.create({
        work_order: workOrderId,
        photo: photoFile,
        photo_type: photoType,
        caption: photoCaption.trim() || undefined,
      });
    },
    onSuccess: () => {
      setShowPhotoDialog(false);
      setPhotoFile(null);
      setPhotoCaption("");
      setPhotoType("during");
      refreshRepairs();
      toast({ title: "Repair photo uploaded" });
    },
    onError: (error: any) => {
      toast({
        title: "Photo upload failed",
        description: getUserFacingError(error, "Something went wrong."),
        variant: "destructive",
      });
    },
  });

  const additionalWorkMutation = useMutation({
    mutationFn: async () => {
      const sections = [
        `Issue: ${additionalWorkSummary.trim()}`,
        additionalWorkArea ? `Area/System: ${additionalWorkArea}` : "",
        `Severity: ${additionalWorkSeverity}`,
        additionalWorkReason.trim() ? `How it was discovered: ${additionalWorkReason.trim()}` : "",
        additionalWorkRecommendation.trim() ? `Recommended action: ${additionalWorkRecommendation.trim()}` : "",
        additionalWorkLaborHours.trim() ? `Estimated labor: ${additionalWorkLaborHours.trim()} hour(s)` : "",
        additionalWorkPartsEstimate.trim() ? `Estimated parts/materials: ${additionalWorkPartsEstimate.trim()}` : "",
        additionalWorkCustomerNote.trim() ? `Customer approval note: ${additionalWorkCustomerNote.trim()}` : "",
      ].filter(Boolean);
      const notes = sections.join("\n");
      return workordersApi.flagAdditionalWork(workOrderId, { reason: notes });
    },
    onSuccess: () => {
      setShowAdditionalWorkDialog(false);
      setAdditionalWorkSummary("");
      setAdditionalWorkArea("");
      setAdditionalWorkSeverity("medium");
      setAdditionalWorkReason("");
      setAdditionalWorkRecommendation("");
      setAdditionalWorkLaborHours("");
      setAdditionalWorkPartsEstimate("");
      setAdditionalWorkCustomerNote("");
      refreshRepairs();
      toast({ title: "Additional work flagged", description: "Customer approval is required before continuing." });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to flag additional work",
        description: getUserFacingError(error),
        variant: "destructive",
      });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: () => workordersApi.pause(workOrderId, pauseReason.trim() || undefined),
    onSuccess: () => {
      setShowPauseDialog(false);
      setPauseReason("");
      refreshRepairs();
      toast({ title: "Repairs paused" });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () => workordersApi.resume(workOrderId),
    onSuccess: () => {
      refreshRepairs();
      toast({ title: "Repairs resumed" });
    },
  });

  const requestQualityCheckMutation = useMutation({
    mutationFn: (assignedTo: number) =>
      workordersApi.requestQualityCheck(workOrderId, { assigned_to: assignedTo }),
    onSuccess: () => {
      setShowRequestQcDialog(false);
      setQcInspectorId("");
      refreshRepairs();
      toast({ title: "Quality check requested" });
      router.push(`/workorders/${workOrderId}`);
    },
    onError: (error: unknown) => {
      toast({
        title: "Quality check blocked",
        description: getUserFacingError(error, "Resolve the listed blockers first."),
        variant: "destructive",
      });
    },
  });

  const submitTaskCompletion = () => {
    if (!completeTask) return;
    const hours = completionHours.trim() ? Number(completionHours) : undefined;
    if (completionHours.trim() && (!Number.isFinite(hours) || (hours ?? 0) <= 0)) {
      toast({
        title: "Invalid hours",
        description: "Enter a positive number of actual labor hours, or leave blank to use clocked time.",
        variant: "destructive",
      });
      return;
    }
    completeTaskMutation.mutate({
      taskId: completeTask.id,
      data: {
        notes: completionNotes.trim() || undefined,
        actual_hours: hours,
      },
    });
  };

  if (workOrderLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (workOrderError || !workOrder) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-destructive">Unable to load this repair workspace.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (workOrderSkipsRepairs(workOrder)) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/workorders/${workOrderId}`)} className="-ml-2">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Work order
        </Button>
        <Card className="border-border">
          <CardContent className="flex flex-col gap-4 py-8">
            <div className="space-y-2">
              <p className="font-medium text-foreground">Repairs workspace not available</p>
              <p className="text-sm text-muted-foreground">
                This job uses an inspection-only or diagnostic-only workflow and does not include a
                repair execution phase. Return to the work order overview to continue.
              </p>
            </div>
            <Button variant="outline" onClick={() => router.push(`/workorders/${workOrderId}`)}>
              Back to Work Order
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isRoutineMaintenanceWorkOrder(workOrder) && isDiagnosisPausedWorkOrder(workOrder)) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/workorders/${workOrderId}`)} className="-ml-2">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Work order
        </Button>
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="flex flex-col gap-4 py-8">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-warning" />
              <div className="space-y-2">
                <p className="font-medium text-foreground">Diagnosis is paused</p>
                <p className="text-sm text-muted-foreground">
                  Repairs cannot start until diagnosis is completed and approved. Resume the diagnosis session first.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => router.push(`/workorders/${workOrderId}/diagnosis`)}>
                Open Diagnosis
              </Button>
              <Button variant="outline" onClick={() => router.push(`/workorders/${workOrderId}`)}>
                Back to Work Order
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canManageRepairs = repairStatuses.has(workOrder.status);
  const isApproved = workOrder.status === "approved";
  const isPaused = workOrder.status === "paused";
  const isActive = workOrder.status === "in_progress";
  const currentQuoteStage = workOrder.current_quote_stage;
  const waitingForPartsAllocation =
    currentQuoteStage === "approved_waiting_for_parts" &&
    parts.some((part) => !PART_STATUSES_OK_FOR_TASK.has(part.status));
  const partsReadyForRepairs =
    !waitingForPartsAllocation &&
    (currentQuoteStage === "parts_ready_waiting_for_repairs" ||
      currentQuoteStage === "approved_waiting_for_repairs" ||
      currentQuoteStage === "quotation_ready" ||
      currentQuoteStage === "approved_waiting_for_parts" ||
      !currentQuoteStage);
  const branchId = typeof workOrder.branch === "object" ? workOrder.branch?.id : workOrder.branch;
  const hasReadinessBlockers = readiness.blockers.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={() => router.push(`/workorders/${workOrderId}`)} className="-ml-2 mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Work order
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono">#{workOrder.work_order_number}</Badge>
            <Badge variant={isActive ? "info" : isPaused ? "warning" : "secondary"} className="capitalize">
              {formatStatus(workOrder.status)}
            </Badge>
            {workOrder.current_quote_stage_display && isApproved && (
              <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                {workOrder.current_quote_stage_display}
              </Badge>
            )}
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {workOrder.vehicle_info || "Vehicle repair"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {workOrder.customer_name || "Customer / Business"} - {workOrder.primary_technician_name || "Technician not assigned"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {isApproved && waitingForPartsAllocation && (
            <>
              <Button onClick={() => startRepairsMutation.mutate()} disabled={startRepairsMutation.isPending}>
                <Play className="mr-2 h-4 w-4" />
                Start Repairs
              </Button>
              <Button variant="outline" onClick={() => setActiveTab("parts")}>
                <Package className="mr-2 h-4 w-4" />
                Review Parts
              </Button>
            </>
          )}
          {isApproved && partsReadyForRepairs && (
            <Button onClick={() => startRepairsMutation.mutate()} disabled={startRepairsMutation.isPending}>
              <Play className="mr-2 h-4 w-4" />
              Start Repairs
            </Button>
          )}
          {isPaused && !isDiagnosisPausedWorkOrder(workOrder) && (
            <Button onClick={() => resumeMutation.mutate()} disabled={resumeMutation.isPending}>
              <Play className="mr-2 h-4 w-4" />
              Resume Repairs
            </Button>
          )}
          {isActive && (
            <Button variant="outline" onClick={() => setShowPauseDialog(true)}>
              <Pause className="mr-2 h-4 w-4" />
              Pause
            </Button>
          )}
          {canManageRepairs && !isApproved && (
            <>
              <Button variant="outline" onClick={() => setShowAdditionalWorkDialog(true)}>
                <AlertTriangle className="mr-2 h-4 w-4" />
                Additional Work
              </Button>
              <Button
                onClick={() => setShowRequestQcDialog(true)}
                disabled={requestQualityCheckMutation.isPending || hasReadinessBlockers}
              >
                <FileCheck className="mr-2 h-4 w-4" />
                Request QC
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Repair Tasks" value={`${stats.completedTasks}/${repairTasks.length}`} detail={`${stats.taskProgress}% complete`} icon={Wrench} />
        <MetricCard title="Parts Resolved" value={`${stats.installedParts}/${parts.length}`} detail={`${stats.partProgress}% resolved`} icon={Package} />
        <MetricCard
          title="Labor Logged"
          value={`${stats.totalLaborHours.toFixed(2)}h`}
          detail={
            isPaused
              ? `${stats.pausedTasks} paused task${stats.pausedTasks === 1 ? "" : "s"}`
              : `${stats.activeTasks} active task${stats.activeTasks === 1 ? "" : "s"}`
          }
          icon={Clock}
        />
        <MetricCard title="Parts Cost" value={formatCurrency(stats.totalPartsCost)} detail={`${photos.length} repair photo${photos.length === 1 ? "" : "s"}`} icon={Camera} />
      </div>

      {!canManageRepairs && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="flex items-start gap-3 py-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-warning" />
            <div>
              <p className="text-sm font-medium text-foreground">This work order is not in a repair stage.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Use the main work order workflow to complete diagnosis, approval, or quality check steps.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isApproved && waitingForPartsAllocation && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="flex items-start gap-3 py-3">
            <Package className="mt-0.5 h-5 w-5 text-warning" />
            <div>
              <p className="text-sm font-medium text-foreground">Some repairs can begin, but some parts are still pending.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Start the ready repair work now. Tasks that still need missing parts will stay blocked until stores allocates or receives them, and the job still cannot be completed until every required part is resolved.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as RepairTab)}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="tasks">
            <Wrench className="mr-2 h-4 w-4" />
            Tasks
          </TabsTrigger>
          <TabsTrigger value="parts">
            <Package className="mr-2 h-4 w-4" />
            Parts
          </TabsTrigger>
          <TabsTrigger value="notes">
            <MessageSquare className="mr-2 h-4 w-4" />
            Notes
          </TabsTrigger>
          <TabsTrigger value="photos">
            <ImageIcon className="mr-2 h-4 w-4" />
            Photos
          </TabsTrigger>
          <TabsTrigger value="readiness">
            <FileCheck className="mr-2 h-4 w-4" />
            QC
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
              <CardTitle className="text-base">Repair Tasks</CardTitle>
              <PermissionGuard permission="edit_workorders">
                <Button size="sm" onClick={() => setShowAddTaskDialog(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Task
                </Button>
              </PermissionGuard>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              {tasksLoading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Loading tasks...</p>
              ) : repairTasks.length === 0 ? (
                <EmptyState icon={Wrench} title="No repair tasks yet" description="Approved diagnosis recommendations will appear here after repairs start." />
              ) : (
                <div className="space-y-2">
                  {repairTasks.map((task) => (
                    <RepairTaskRow
                      key={task.id}
                      task={task}
                      parts={parts}
                      workOrderStatus={workOrder.status}
                      assigneeOptions={assigneeOptions}
                      canReassign={canAddRepairItems}
                      onReassign={(assignedTo) =>
                        reassignTaskMutation.mutate({ taskId: task.id, assignedTo })
                      }
                      onStart={() => startTaskMutation.mutate(task.id)}
                      onSkip={() => {
                        if (
                          confirm(
                            `Skip task "${task.description}"? Use this when the linked part was returned and no further work is needed.`
                          )
                        ) {
                          skipTaskMutation.mutate(task.id);
                        }
                      }}
                      onComplete={() => {
                        setCompleteTask(task);
                        setCompletionNotes(task.detailed_notes || "");
                        setCompletionHours(
                          task.actual_hours && task.actual_hours > 0
                            ? String(task.actual_hours)
                            : task.calculated_hours && task.calculated_hours > 0
                              ? String(task.calculated_hours)
                              : ""
                        );
                      }}
                      isBusy={
                        startTaskMutation.isPending ||
                        skipTaskMutation.isPending ||
                        completeTaskMutation.isPending ||
                        reassignTaskMutation.isPending
                      }
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="parts" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
              <CardTitle className="text-base">Parts & Materials</CardTitle>
              <PermissionGuard permission="edit_workorders">
                <Button size="sm" onClick={() => setShowAddPartDialog(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Part
                </Button>
              </PermissionGuard>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              {partsLoading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Loading parts...</p>
              ) : parts.length === 0 ? (
                <EmptyState icon={Package} title="No parts listed" description="Add parts as they are requested, received, installed, or returned." />
              ) : (
                <div className="space-y-2">
                  {parts.map((part) => (
                    <RepairPartRow
                      key={part.id}
                      part={part}
                      formatCurrency={formatCurrency}
                      onInstall={() => markInstalledMutation.mutate(part.id)}
                      onReturn={() => {
                        setReturningPart(part);
                        setReturnReason(part.resolution_notes || "");
                      }}
                      isBusy={markInstalledMutation.isPending || markReturnedMutation.isPending}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
              <CardTitle className="text-base">Repair Notes</CardTitle>
              <Button size="sm" onClick={() => setShowNoteDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Note
              </Button>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              {notes.length === 0 ? (
                <EmptyState icon={MessageSquare} title="No repair notes yet" description="Add internal notes as the repair progresses." />
              ) : (
                <div className="space-y-2">
                  {notes.slice(0, 10).map((note) => (
                    <div key={note.id} className="rounded-md border border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge variant={note.is_important ? "warning" : "secondary"}>{formatStatus(note.note_type)}</Badge>
                        <span className="text-xs text-muted-foreground">{format(new Date(note.created_at), "MMM d, yyyy h:mm a")}</span>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{note.note}</p>
                      {note.created_by_name && <p className="mt-2 text-xs text-muted-foreground">By {note.created_by_name}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="photos" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
              <CardTitle className="text-base">Repair Photos</CardTitle>
              <Button size="sm" onClick={() => setShowPhotoDialog(true)}>
                <Camera className="mr-2 h-4 w-4" />
                Upload Photo
              </Button>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              {photos.length === 0 ? (
                <EmptyState icon={ImageIcon} title="No repair photos yet" description="Capture proof of repair progress, installed parts, and final condition." />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {photos.map((photo) => (
                    <RepairPhoto key={photo.id} photo={photo} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="readiness" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
              <CardTitle className="text-base">Quality Check Readiness</CardTitle>
              <Badge variant={hasReadinessBlockers ? "warning" : "success"}>
                {hasReadinessBlockers ? `${readiness.blockers.length} blocker${readiness.blockers.length === 1 ? "" : "s"}` : "Ready"}
              </Badge>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              {hasReadinessBlockers ? (
                <div className="space-y-3">
                  {readiness.blockers.map((blocker, index) => (
                    <div key={`${blocker}-${index}`} className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
                      <p className="text-sm text-foreground">{blocker}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-success/30 bg-success/5 p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Repair work is ready for quality check.</p>
                      <p className="mt-1 text-sm text-muted-foreground">All repair tasks and parts have been resolved.</p>
                    </div>
                  </div>
                </div>
              )}
              <div className="mt-4 flex justify-end">
                <Button
                  onClick={() => setShowRequestQcDialog(true)}
                  disabled={hasReadinessBlockers || requestQualityCheckMutation.isPending}
                >
                  <Send className="mr-2 h-4 w-4" />
                  Request Quality Check
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {showAddTaskDialog && (
        <AddTaskDialog
          workOrderId={workOrderId}
          branchId={branchId}
          open={showAddTaskDialog}
          onClose={() => setShowAddTaskDialog(false)}
          onSuccess={() => {
            setShowAddTaskDialog(false);
            refreshRepairs();
          }}
        />
      )}

      <Dialog
        open={showRequestQcDialog}
        onOpenChange={(open) => {
          setShowRequestQcDialog(open);
          if (!open) setQcInspectorId("");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign quality inspector</DialogTitle>
            <DialogDescription>
              Select authorized personnel to perform QC. The repairing technician cannot QC their own job.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="repairs-qc-inspector">Quality inspector</Label>
              <Select value={qcInspectorId} onValueChange={setQcInspectorId}>
                <SelectTrigger id="repairs-qc-inspector">
                  <SelectValue placeholder="Select authorized inspector…" />
                </SelectTrigger>
                <SelectContent>
                  {qualityInspectors.map((inspector) => {
                    const name =
                      [inspector.first_name, inspector.last_name].filter(Boolean).join(" ") ||
                      inspector.username ||
                      `User #${inspector.id}`;
                    return (
                      <SelectItem key={inspector.id} value={String(inspector.id)}>
                        {name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowRequestQcDialog(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!qcInspectorId || requestQualityCheckMutation.isPending}
                onClick={() => requestQualityCheckMutation.mutate(Number(qcInspectorId))}
              >
                {requestQualityCheckMutation.isPending ? "Requesting…" : "Request QC"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {showAddPartDialog && (
        <AddPartDialog
          workOrderId={workOrderId}
          workOrderStatus={workOrder.status}
          open={showAddPartDialog}
          onClose={() => setShowAddPartDialog(false)}
          onSuccess={() => {
            setShowAddPartDialog(false);
            refreshRepairs();
          }}
        />
      )}

      <Dialog open={!!completeTask} onOpenChange={(open) => !open && setCompleteTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Repair Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm font-medium text-foreground">{completeTask?.description}</p>
            <div className="space-y-2">
              <Label htmlFor="completion-hours">Actual hours</Label>
              <Input
                id="completion-hours"
                type="number"
                min="0.01"
                step="0.01"
                value={completionHours}
                onChange={(event) => setCompletionHours(event.target.value)}
                placeholder="Leave blank to use clocked time"
              />
              <p className="text-xs text-muted-foreground">
                Required when the task was not started with a time clock. Otherwise optional.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="completion-notes">Completion notes</Label>
              <Textarea id="completion-notes" value={completionNotes} onChange={(event) => setCompletionNotes(event.target.value)} rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteTask(null)} disabled={completeTaskMutation.isPending}>Cancel</Button>
            <Button onClick={submitTaskCompletion} disabled={completeTaskMutation.isPending}>Complete Task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!returningPart} onOpenChange={(open) => !open && setReturningPart(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return Part</DialogTitle>
            <DialogDescription>Returned parts need a reason before quality check.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">{returningPart?.part_name}</p>
            <Textarea value={returnReason} onChange={(event) => setReturnReason(event.target.value)} rows={4} placeholder="Reason this part was not installed" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturningPart(null)} disabled={markReturnedMutation.isPending}>Cancel</Button>
            <Button
              onClick={() => returningPart && markReturnedMutation.mutate({ partId: returningPart.id, reason: returnReason.trim() })}
              disabled={markReturnedMutation.isPending || !returnReason.trim()}
            >
              Mark Returned
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAdditionalWorkDialog} onOpenChange={setShowAdditionalWorkDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Additional Work Found</DialogTitle>
            <DialogDescription>Record the new issue before requesting customer approval.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="additional-summary">Issue summary *</Label>
              <Input
                id="additional-summary"
                value={additionalWorkSummary}
                onChange={(event) => setAdditionalWorkSummary(event.target.value)}
                placeholder="Example: Rear brake caliper leaking"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="additional-area">Area/System</Label>
                <Input
                  id="additional-area"
                  value={additionalWorkArea}
                  onChange={(event) => setAdditionalWorkArea(event.target.value)}
                  placeholder="Brake, electrical, suspension..."
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="additional-severity">Severity</Label>
                <select
                  id="additional-severity"
                  value={additionalWorkSeverity}
                  onChange={(event) => setAdditionalWorkSeverity(event.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="safety_critical">Safety critical</option>
                </select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="additional-reason">How it was discovered</Label>
              <Textarea
                id="additional-reason"
                value={additionalWorkReason}
                onChange={(event) => setAdditionalWorkReason(event.target.value)}
                rows={2}
                placeholder="Inspection, test drive, teardown, part removal..."
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="additional-recommendation">Recommended action *</Label>
              <Textarea
                id="additional-recommendation"
                value={additionalWorkRecommendation}
                onChange={(event) => setAdditionalWorkRecommendation(event.target.value)}
                rows={2}
                placeholder="What should be repaired, replaced, tested, or quoted?"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="additional-hours">Estimated labor hours</Label>
                <Input
                  id="additional-hours"
                  type="number"
                  min="0"
                  step="0.25"
                  value={additionalWorkLaborHours}
                  onChange={(event) => setAdditionalWorkLaborHours(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="additional-parts-estimate">Estimated parts/materials</Label>
                <Input
                  id="additional-parts-estimate"
                  value={additionalWorkPartsEstimate}
                  onChange={(event) => setAdditionalWorkPartsEstimate(event.target.value)}
                  placeholder="Amount or short estimate note"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="additional-customer-note">Customer approval note</Label>
              <Textarea
                id="additional-customer-note"
                value={additionalWorkCustomerNote}
                onChange={(event) => setAdditionalWorkCustomerNote(event.target.value)}
                rows={2}
                placeholder="Plain-language note for service advisor/customer approval follow-up"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdditionalWorkDialog(false)} disabled={additionalWorkMutation.isPending}>Cancel</Button>
            <Button
              onClick={() => additionalWorkMutation.mutate()}
              disabled={additionalWorkMutation.isPending || !additionalWorkSummary.trim() || !additionalWorkRecommendation.trim()}
            >
              Flag Additional Work
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPauseDialog} onOpenChange={setShowPauseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pause Repairs</DialogTitle>
            <DialogDescription>Optional reason for pausing this work order.</DialogDescription>
          </DialogHeader>
          <Textarea value={pauseReason} onChange={(event) => setPauseReason(event.target.value)} rows={4} placeholder="Waiting for bay, part, approval, or technician handoff" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPauseDialog(false)} disabled={pauseMutation.isPending}>Cancel</Button>
            <Button onClick={() => pauseMutation.mutate()} disabled={pauseMutation.isPending}>Pause Repairs</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Repair Note</DialogTitle>
          </DialogHeader>
          <Textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} rows={5} placeholder="Repair update, observation, or handoff note" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNoteDialog(false)} disabled={createNoteMutation.isPending}>Cancel</Button>
            <Button onClick={() => createNoteMutation.mutate(noteText.trim())} disabled={createNoteMutation.isPending || !noteText.trim()}>Add Note</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPhotoDialog} onOpenChange={setShowPhotoDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Repair Photo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="repair-photo">Photo</Label>
              <Input id="repair-photo" type="file" accept="image/*" onChange={(event) => setPhotoFile(event.target.files?.[0] || null)} />
            </div>
            <div className="grid grid-cols-5 gap-2">
              {(["before", "during", "after", "part", "other"] as const).map((type) => (
                <Button key={type} type="button" variant={photoType === type ? "default" : "outline"} size="sm" onClick={() => setPhotoType(type)} className="capitalize">
                  {type}
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="photo-caption">Caption</Label>
              <Input id="photo-caption" value={photoCaption} onChange={(event) => setPhotoCaption(event.target.value)} placeholder="Short description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPhotoDialog(false)} disabled={uploadPhotoMutation.isPending}>Cancel</Button>
            <Button onClick={() => uploadPhotoMutation.mutate()} disabled={uploadPhotoMutation.isPending || !photoFile}>Upload</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCard({ title, value, detail, icon: Icon }: { title: string; value: string; detail: string; icon: any }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-3">
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">{title}</p>
          <p className="mt-0.5 text-lg font-semibold text-foreground">{value}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
        </div>
        <div className="rounded-md bg-primary/10 p-1.5 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-8 text-center">
      <Icon className="h-8 w-8 text-muted-foreground" />
      <p className="mt-2 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function RepairTaskRow({
  task,
  parts,
  workOrderStatus,
  assigneeOptions,
  canReassign,
  onReassign,
  onStart,
  onSkip,
  onComplete,
  isBusy,
}: {
  task: ServiceTask;
  parts: WorkOrderPart[];
  workOrderStatus?: string;
  assigneeOptions: Array<{ id: number; name: string }>;
  canReassign: boolean;
  onReassign: (assignedTo: number | null) => void;
  onStart: () => void;
  onSkip: () => void;
  onComplete: () => void;
  isBusy: boolean;
}) {
  const hours = getTaskHours(task);
  const executionState = getTaskExecutionPresentation(task, parts, workOrderStatus);
  const currentAssigneeId =
    typeof task.assigned_to === "object" && task.assigned_to
      ? String(task.assigned_to.id)
      : typeof task.assigned_to === "number"
        ? String(task.assigned_to)
        : "";

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">{task.description}</h3>
            <Badge variant={executionState.badgeVariant} className="capitalize">{executionState.badgeLabel}</Badge>
          </div>
          {task.detailed_notes && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.detailed_notes}</p>}
          {executionState.helperText && <p className="mt-1 text-xs text-muted-foreground">{executionState.helperText}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>{task.task_type ? formatStatus(task.task_type) : "Repair task"}</span>
            {task.status === "completed" || task.status === "skipped" || !canReassign ? (
              <span>Mechanic: {task.assigned_to_name || "Unassigned"}</span>
            ) : (
              <label className="flex items-center gap-1.5">
                <span>Mechanic:</span>
                <select
                  className="rounded-md border border-border bg-muted px-1.5 py-1 text-xs text-foreground"
                  value={currentAssigneeId}
                  disabled={isBusy || workOrderStatus === "paused"}
                  onChange={(e) => onReassign(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Unassigned</option>
                  {assigneeOptions.map((opt) => (
                    <option key={opt.id} value={String(opt.id)}>
                      {opt.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <span>{hours > 0 ? `${hours.toFixed(2)}h` : "No hours logged"}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {task.status === "pending" && (
            <Button size="sm" variant="outline" onClick={onStart} disabled={isBusy || !executionState.canStart}>
              <Play className="mr-2 h-4 w-4" />
              {executionState.canStart ? "Start" : workOrderStatus === "paused" ? "Paused" : "Waiting Parts"}
            </Button>
          )}
          {executionState.canSkip && (
            <Button size="sm" variant="ghost" onClick={onSkip} disabled={isBusy}>
              <SkipForward className="mr-2 h-4 w-4" />
              Skip
            </Button>
          )}
          {executionState.canComplete && (
            <Button size="sm" onClick={onComplete} disabled={isBusy}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Complete
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function RepairPartRow({
  part,
  formatCurrency,
  onInstall,
  onReturn,
  isBusy,
}: {
  part: WorkOrderPart;
  formatCurrency: (amount: number) => string;
  onInstall: () => void;
  onReturn: () => void;
  isBusy: boolean;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">{part.part_name}</h3>
            <Badge variant={getPartVariant(part.status)} className="capitalize">{formatStatus(part.status)}</Badge>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>{part.part_number || "No part number"}</span>
            <span>Qty {part.quantity}</span>
            <span>{formatCurrency(Number(part.total_cost || 0))}</span>
            {part.requisition_number && <span>{part.requisition_number}</span>}
          </div>
          {part.resolution_notes && <p className="mt-1 text-xs text-muted-foreground">Return note: {part.resolution_notes}</p>}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Open part actions">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {["ready", "received"].includes(part.status) && (
              <DropdownMenuItem onClick={onInstall} disabled={isBusy}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Install
              </DropdownMenuItem>
            )}
            {!["installed", "returned"].includes(part.status) && (
              <DropdownMenuItem onClick={onReturn} disabled={isBusy}>
                <Undo2 className="mr-2 h-4 w-4" />
                Return
              </DropdownMenuItem>
            )}
            {["installed", "returned"].includes(part.status) && (
              <DropdownMenuItem disabled>No actions available</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function RepairPhoto({ photo }: { photo: WorkOrderPhoto }) {
  return (
    <Link href={photo.photo} target="_blank" className="block overflow-hidden rounded-lg border border-border">
      <div className="aspect-video bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.photo} alt={photo.caption || "Repair photo"} className="h-full w-full object-cover" />
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="secondary" className="capitalize">{photo.photo_type}</Badge>
          <span className="text-xs text-muted-foreground">{format(new Date(photo.created_at), "MMM d")}</span>
        </div>
        {photo.caption && <p className="mt-2 truncate text-sm text-foreground">{photo.caption}</p>}
      </div>
    </Link>
  );
}
