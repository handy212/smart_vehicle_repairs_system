"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useToast } from "@/lib/hooks/useToast";
import { workordersApi } from "@/lib/api/workorders";
import { workOrderTasksApi, ServiceTask } from "@/lib/api/workorder-tasks";
import { workOrderPartsApi, WorkOrderPart } from "@/lib/api/workorder-parts";
import { workOrderNotesApi } from "@/lib/api/workorder-notes";
import { workOrderPhotosApi, WorkOrderPhoto } from "@/lib/api/workorder-photos";
import AddTaskDialog from "../components/AddTaskDialog";
import AddPartDialog from "../components/AddPartDialog";

type RepairTab = "tasks" | "parts" | "notes" | "photos" | "readiness";

const repairStatuses = new Set(["approved", "in_progress", "paused", "additional_work_found", "quality_check"]);

const getTaskVariant = (status: string): BadgeProps["variant"] => {
  if (status === "completed") return "success";
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

export default function RepairsPage() {
  const params = useParams();
  const router = useRouter();
  const workOrderId = Number(params.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { formatCurrency } = useCurrency();

  const [activeTab, setActiveTab] = useState<RepairTab>("tasks");
  const [showAddTaskDialog, setShowAddTaskDialog] = useState(false);
  const [showAddPartDialog, setShowAddPartDialog] = useState(false);
  const [showAdditionalWorkDialog, setShowAdditionalWorkDialog] = useState(false);
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [showPhotoDialog, setShowPhotoDialog] = useState(false);
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
  const [returnReason, setReturnReason] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoType, setPhotoType] = useState<"before" | "during" | "after" | "part" | "other">("during");
  const [photoCaption, setPhotoCaption] = useState("");

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
    const activeTasks = repairTasks.filter((task) => task.status === "in_progress").length;
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
      installedParts,
      totalLaborHours,
      totalPartsCost,
      taskProgress: repairTasks.length ? Math.round((completedTasks / repairTasks.length) * 100) : 0,
      partProgress: parts.length ? Math.round((installedParts / parts.length) * 100) : 0,
    };
  }, [parts, repairTasks]);

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
        description: error.response?.data?.error || error.response?.data?.detail || error.message,
        variant: "destructive",
      });
    },
  });

  const startTaskMutation = useMutation({
    mutationFn: (taskId: number) => workOrderTasksApi.start(taskId),
    onSuccess: refreshRepairs,
  });

  const completeTaskMutation = useMutation({
    mutationFn: ({ taskId, data }: { taskId: number; data?: { notes?: string } }) =>
      workOrderTasksApi.complete(taskId, data),
    onSuccess: () => {
      setCompleteTask(null);
      setCompletionNotes("");
      refreshRepairs();
      toast({ title: "Task completed" });
    },
    onError: (error: any) => {
      toast({
        title: "Task completion blocked",
        description: error.response?.data?.next_step || error.response?.data?.error || "Unable to complete task.",
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
        description: error.response?.data?.error || error.message,
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
      const updated = await workordersApi.updateStatus(workOrderId, "additional_work_found");
      if (notes) {
        await workOrderNotesApi.create({
          work_order: workOrderId,
          note_type: "internal",
          note: `Additional work discovered\n\n${notes}`,
          is_important: true,
          is_customer_visible: false,
        });
      }
      return updated;
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
        description: error.response?.data?.error || error.response?.data?.detail || error.message,
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
    mutationFn: () => workordersApi.requestQualityCheck(workOrderId),
    onSuccess: () => {
      refreshRepairs();
      toast({ title: "Quality check requested" });
      router.push(`/workorders/${workOrderId}`);
    },
    onError: (error: any) => {
      const data = error.response?.data;
      toast({
        title: "Quality check blocked",
        description: data?.next_step || data?.error || data?.detail || "Resolve the listed blockers first.",
        variant: "destructive",
      });
    },
  });

  const submitTaskCompletion = () => {
    if (!completeTask) return;
    completeTaskMutation.mutate({
      taskId: completeTask.id,
      data: {
        notes: completionNotes.trim() || undefined,
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

  const canManageRepairs = repairStatuses.has(workOrder.status);
  const isApproved = workOrder.status === "approved";
  const isPaused = workOrder.status === "paused";
  const isActive = workOrder.status === "in_progress";
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
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {workOrder.vehicle_info || "Vehicle repair"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {workOrder.customer_name || "Customer / Business"} - {workOrder.primary_technician_name || "Technician not assigned"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {isApproved && (
            <Button onClick={() => startRepairsMutation.mutate()} disabled={startRepairsMutation.isPending}>
              <Play className="mr-2 h-4 w-4" />
              Start Repairs
            </Button>
          )}
          {isPaused && (
            <Button onClick={() => resumeMutation.mutate()} disabled={resumeMutation.isPending}>
              <Play className="mr-2 h-4 w-4" />
              Resume
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
              <Button onClick={() => requestQualityCheckMutation.mutate()} disabled={requestQualityCheckMutation.isPending || hasReadinessBlockers}>
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
        <MetricCard title="Labor Logged" value={`${stats.totalLaborHours.toFixed(2)}h`} detail={`${stats.activeTasks} active task${stats.activeTasks === 1 ? "" : "s"}`} icon={Clock} />
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
              <Button size="sm" onClick={() => setShowAddTaskDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Task
              </Button>
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
                      onStart={() => startTaskMutation.mutate(task.id)}
                      onComplete={() => {
                        setCompleteTask(task);
                        setCompletionNotes(task.detailed_notes || "");
                      }}
                      isBusy={startTaskMutation.isPending || completeTaskMutation.isPending}
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
              <Button size="sm" onClick={() => setShowAddPartDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Part
              </Button>
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
                <Button onClick={() => requestQualityCheckMutation.mutate()} disabled={hasReadinessBlockers || requestQualityCheckMutation.isPending}>
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
  onStart,
  onComplete,
  isBusy,
}: {
  task: ServiceTask;
  onStart: () => void;
  onComplete: () => void;
  isBusy: boolean;
}) {
  const hours = getTaskHours(task);

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">{task.description}</h3>
            <Badge variant={getTaskVariant(task.status)} className="capitalize">{formatStatus(task.status)}</Badge>
          </div>
          {task.detailed_notes && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.detailed_notes}</p>}
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>{task.task_type ? formatStatus(task.task_type) : "Repair task"}</span>
            <span>{task.assigned_to_name || "Unassigned"}</span>
            <span>{hours > 0 ? `${hours.toFixed(2)}h` : "No hours logged"}</span>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {task.status === "pending" && (
            <Button size="sm" variant="outline" onClick={onStart} disabled={isBusy}>
              <Play className="mr-2 h-4 w-4" />
              Start
            </Button>
          )}
          {task.status === "in_progress" && (
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
