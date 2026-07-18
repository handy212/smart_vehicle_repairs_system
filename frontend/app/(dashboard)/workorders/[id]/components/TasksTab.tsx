"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { workOrderTasksApi, ServiceTask } from "@/lib/api/workorder-tasks";
import { adminApi } from "@/lib/api/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, CheckCircle2, Clock, Play, Workflow, User, Info, Wrench, MoreVertical, ExternalLink, Tags, type LucideIcon } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import AddTaskDialog from "./AddTaskDialog";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { LIST_TECHNICIANS_PERMISSIONS } from "@/lib/utils/permissions";
import { RevenueProductBadge } from "@/components/billing/RevenueProductBadge";
import { RevenueProductSelect } from "@/components/accounting/RevenueProductSelect";
import { INCOME_CATEGORY_SHORT } from "@/lib/accounting/income-category-labels";
import { isRoutineMaintenanceWorkOrder } from "@/lib/utils/workorder-workflow-steps";

interface TasksTabProps {
  workOrderId: number;
  tasks: ServiceTask[];
  onRefresh: () => void;
  isLoading?: boolean;
  workOrder?: {
    status?: string;
    maintenance_type?: string;
    branch?: number | { id: number; name?: string } | null;
    service_coordinator?: number | { id: number; first_name: string; last_name: string };
    service_coordinator_name?: string;
    primary_technician?: number | { id: number } | null;
    assigned_technicians_detail?: Array<{ id: number; name: string }>;
  };
}

type TaskCompletionError = {
  response?: {
    data?: {
      error?: string;
      next_step?: string;
    };
  };
};
type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "secondary" | "outline";

export default function WorkOrderTasksTab({ workOrderId, tasks, onRefresh, isLoading = false, workOrder }: TasksTabProps) {
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [completeTask, setCompleteTask] = useState<ServiceTask | null>(null);
  const [completeNotes, setCompleteNotes] = useState("");
  const [editBillingTask, setEditBillingTask] = useState<ServiceTask | null>(null);
  const [billingCategoryId, setBillingCategoryId] = useState<number | null>(null);
  const branchId = typeof workOrder?.branch === "object" ? workOrder.branch?.id : workOrder?.branch;
  const isRoutine = isRoutineMaintenanceWorkOrder(workOrder);
  const { hasAnyPermission } = usePermissions();
  const canListTechnicians = hasAnyPermission([...LIST_TECHNICIANS_PERMISSIONS]);
  const teamAssignees = workOrder?.assigned_technicians_detail || [];

  const { data: technicians } = useQuery({
    queryKey: ["technicians", "task-reassign", branchId],
    queryFn: () => adminApi.users.technicians(branchId ? { branch: branchId } : undefined),
    enabled: canListTechnicians && teamAssignees.length === 0,
  });

  const assigneeOptions = useMemo(() => {
    if (teamAssignees.length > 0) {
      return teamAssignees.map((t) => ({ id: t.id, name: t.name }));
    }
    return (technicians || []).map((t) => ({
      id: t.id,
      name: t.full_name || `${t.first_name || ""} ${t.last_name || ""}`.trim() || `User ${t.id}`,
    }));
  }, [teamAssignees, technicians]);

  const reassignTaskMutation = useMutation({
    mutationFn: ({ taskId, assignedTo }: { taskId: number; assignedTo: number | null }) =>
      workOrderTasksApi.patch(taskId, { assigned_to: assignedTo }),
    onSuccess: () => {
      onRefresh();
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

  const routineSkipWorkflowPhases = new Set([
    "inspection",
    "intake",
    "assigned",
    "diagnosis",
    "awaiting_approval",
  ]);
  const repairExecutionStatuses = ["approved", "in_progress", "paused", "additional_work_found", "quality_check"];
  const useRepairWorkspace = repairExecutionStatuses.includes(workOrder?.status || "");

  // Separate workflow tasks from manual tasks and sort them
  const { workflowTasks, manualTasks } = useMemo(() => {
    const workflow = tasks
      .filter((task) => {
        if (task.is_workflow_task !== true) return false;
        if (isRoutine && task.workflow_phase && routineSkipWorkflowPhases.has(task.workflow_phase)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        // Sort by sequence_order if available, otherwise by creation time
        if (a.sequence_order !== undefined && b.sequence_order !== undefined) {
          return a.sequence_order - b.sequence_order;
        }
        return 0;
      });
    const manual = tasks.filter((task) => !task.is_workflow_task);
    return { workflowTasks: workflow, manualTasks: manual };
  }, [tasks, isRoutine]);

  const getStatusVariant = (status: string): BadgeVariant => {
    switch (status) {
      case "completed":
        return "success";
      case "in_progress":
        return "info";
      case "pending":
        return "warning";
      default:
        return "default";
    }
  };

  const startTaskMutation = useMutation({
    mutationFn: (taskId: number) => workOrderTasksApi.start(taskId),
    onSuccess: () => {
      onRefresh();
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: ({ taskId, data }: { taskId: number; data?: { actual_hours?: number; notes?: string } }) =>
      workOrderTasksApi.complete(taskId, data),
    onSuccess: () => {
      setCompleteTask(null);
      setCompleteNotes("");
      onRefresh();
    },
    onError: (error: TaskCompletionError) => {
      toast({
        title: "Task completion blocked",
        description: getUserFacingError(error, "Unable to complete task."),
        variant: "destructive",
      });
    },
  });

  const updateBillingCategoryMutation = useMutation({
    mutationFn: ({ taskId, revenueProduct }: { taskId: number; revenueProduct: number | null }) =>
      workOrderTasksApi.patch(taskId, { revenue_product: revenueProduct }),
    onSuccess: () => {
      setEditBillingTask(null);
      setBillingCategoryId(null);
      onRefresh();
      toast({ title: "Income category updated", variant: "success" });
    },
    onError: (error: unknown) => {
      toast({
        title: "Update failed",
        description: getUserFacingError(error, "Could not update task income category."),
        variant: "destructive",
      });
    },
  });

  const handleStartTask = (taskId: number) => {
    startTaskMutation.mutate(taskId);
  };

  const handleCompleteTask = (taskId: number) => {
    const task = tasks.find((item) => item.id === taskId);
    if (task) {
      setCompleteTask(task);
      setCompleteNotes(task.detailed_notes || "");
    }
  };

  const submitCompleteTask = () => {
    if (!completeTask) return;

    completeTaskMutation.mutate({
      taskId: completeTask.id,
      data: {
        notes: completeNotes.trim() || undefined,
      },
    });
  };

  // Get workflow phase description and icon
  const getWorkflowTaskInfo = (task: ServiceTask) => {
    const phase = task.workflow_phase;

    const descriptions: Record<string, { description: string; icon: LucideIcon; actionHint?: string }> = {
      'inspection': {
        description: 'Initial vehicle inspection to assess condition and identify issues',
        icon: Workflow,
        actionHint: 'Complete inspection using the Inspection tab'
      },
      'intake': {
        description: 'Customer intake and work order setup',
        icon: User,
        actionHint: 'Assign Service Coordinator to proceed'
      },
      'assigned': {
        description: 'Service Coordinator assigned. Awaiting diagnosis start.',
        icon: User,
      },
      'diagnosis': {
        description: 'Diagnostic testing to identify root cause of issues',
        icon: Workflow,
        actionHint: 'Work on diagnosis in the Diagnosis tab'
      },
      'awaiting_approval': {
        description: 'Waiting for customer approval of estimate',
        icon: Clock,
        actionHint: 'Customer needs to approve the estimate'
      },
      'approved': {
        description: 'Customer approval received - ready to start repairs',
        icon: CheckCircle2,
      },
      'in_progress': {
        description: 'Repair work in progress',
        icon: Play,
        actionHint: 'Technicians working on repairs'
      },
      'quality_check': {
        description: 'Quality control inspection before completion',
        icon: CheckCircle2,
        actionHint: 'Perform quality check using workflow action button'
      },
      'completed': {
        description: 'Work order finalized and ready for invoicing',
        icon: CheckCircle2,
      },
    };

    return descriptions[phase || ''] || { description: task.description, icon: Workflow };
  };

  const renderTaskRow = (task: ServiceTask, isWorkflow: boolean = false) => {
    const taskInfo = isWorkflow ? getWorkflowTaskInfo(task) : null;
    const TaskIcon = taskInfo?.icon || Workflow;
    const isCurrentPhase = isWorkflow && task.workflow_phase === workOrder?.status;
    const hasManualActions = !isWorkflow && ["pending", "in_progress"].includes(task.status);

    return (
      <TableRow
        key={task.id}
        className={`
          ${isWorkflow ? "bg-primary/5" : ""}
          ${isCurrentPhase ? "ring-2 ring-primary/20" : ""}
        `}
      >
        <TableCell className="min-w-[280px] py-2">
          <div className="flex items-start gap-2">
            {isWorkflow && (
              <TaskIcon className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium leading-snug">{task.description}</p>
                {isWorkflow && (
                  <>
                    <Badge variant="secondary" className="text-xs">
                      Workflow
                    </Badge>
                    {isCurrentPhase && (
                      <Badge variant="info" className="text-xs">
                        Current Phase
                      </Badge>
                    )}
                  </>
                )}
              </div>
              {isWorkflow && taskInfo?.description && (
                <p className="text-xs text-muted-foreground mt-1">
                  {taskInfo.description}
                </p>
              )}
              {isWorkflow && taskInfo?.actionHint && task.status !== 'completed' && (
                <div className="mt-1 flex items-start gap-1">
                  <Info className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-primary italic">
                    {taskInfo.actionHint}
                  </p>
                </div>
              )}
              {task.detailed_notes && (
                <p className="text-xs text-muted-foreground mt-1">{task.detailed_notes}</p>
              )}
            </div>
          </div>
        </TableCell>
        <TableCell className="py-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm capitalize">{task.task_type?.replace(/_/g, " ")}</span>
            {!isWorkflow && (
              <RevenueProductBadge
                name={task.billing_revenue_product_name}
                ownerAccountCode={task.billing_owner_account_code}
                code={task.billing_revenue_product_code}
              />
            )}
            {!isWorkflow && task.revenue_product ? (
              <span className="text-[10px] text-muted-foreground">Task override</span>
            ) : null}
          </div>
        </TableCell>
        <TableCell className="py-3">
          <div className="flex items-center gap-1">
            {isWorkflow && task.workflow_phase === 'assigned' && (
              <User className="w-3 h-3 text-muted-foreground" />
            )}
            {task.status === "completed" || task.status === "skipped" ? (
              <span className="text-sm">{task.assigned_to_name || "-"}</span>
            ) : (
              <select
                className="max-w-[10rem] rounded-md border border-border bg-muted px-1.5 py-1 text-xs text-foreground"
                value={
                  typeof task.assigned_to === "object" && task.assigned_to
                    ? String(task.assigned_to.id)
                    : typeof task.assigned_to === "number"
                      ? String(task.assigned_to)
                      : ""
                }
                disabled={reassignTaskMutation.isPending}
                onChange={(e) => {
                  const val = e.target.value;
                  reassignTaskMutation.mutate({
                    taskId: task.id,
                    assignedTo: val ? Number(val) : null,
                  });
                }}
              >
                <option value="">Unassigned</option>
                {assigneeOptions.map((opt) => (
                  <option key={opt.id} value={String(opt.id)}>
                    {opt.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </TableCell>
        <TableCell className="py-3">

          <Badge variant={getStatusVariant(task.status)}>
            {task.status?.replace(/_/g, " ")}
          </Badge>
        </TableCell>
        <TableCell className="py-3">
          <div className="text-sm">
            {task.labor_cost !== undefined && task.labor_cost !== null && Number(task.labor_cost) > 0 ? (
              <span>${Number(task.labor_cost).toFixed(2)}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        </TableCell>
        <TableCell className="py-3">
          <div className="text-xs text-muted-foreground">
            {task.created_at ? (
              <>
                <div>{format(new Date(task.created_at), "MMM d, yyyy")}</div>
                <div>{format(new Date(task.created_at), "h:mm a")}</div>
              </>
            ) : (
              "-"
            )}
          </div>
        </TableCell>
        <TableCell className="w-[64px] py-3 text-right">
          {!isWorkflow && !useRepairWorkspace ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Open task actions">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    setEditBillingTask(task);
                    setBillingCategoryId(task.revenue_product ?? null);
                  }}
                >
                  <Tags className="mr-2 h-4 w-4" />
                  Set {INCOME_CATEGORY_SHORT.toLowerCase()}
                </DropdownMenuItem>
                {task.status === "pending" && (
                  <DropdownMenuItem
                    onClick={() => handleStartTask(task.id)}
                    disabled={startTaskMutation.isPending}
                  >
                    <Play className="mr-2 h-4 w-4" />
                    Start Task
                  </DropdownMenuItem>
                )}
                {task.status === "in_progress" && (
                  <DropdownMenuItem
                    onClick={() => handleCompleteTask(task.id)}
                    disabled={completeTaskMutation.isPending}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Complete Task
                  </DropdownMenuItem>
                )}
                {!hasManualActions && (
                  <DropdownMenuItem disabled>
                    {task.status === "completed" ? "Completed" : task.status?.replace(/_/g, " ") || "No actions available"}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : !isWorkflow && useRepairWorkspace ? (
            <span className="text-[10px] text-muted-foreground">Repair workspace</span>
          ) : (
            <div className="flex justify-end">
              {task.status === "completed" ? (
                <span className="text-xs text-primary italic flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Auto-completed
                </span>
              ) : task.status === "in_progress" ? (
                <span className="text-xs text-primary italic flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {isCurrentPhase ? "Active Phase" : "Auto-managed"}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground italic">
                  {isCurrentPhase ? "Waiting to start" : "Auto-managed"}
                </span>
              )}
            </div>
          )}
        </TableCell>
      </TableRow>
    );
  };

  return (
    <>
      <div className="space-y-4">
        {/* Workflow Tasks Section */}
        {workflowTasks.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <Workflow className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base">Workflow Tasks</CardTitle>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {workflowTasks.filter(t => t.status === 'completed').length} completed • {workflowTasks.filter(t => t.status === 'in_progress').length} in progress • {workflowTasks.filter(t => t.status === 'pending').length} pending
                </p>
              </div>
              <Badge variant="secondary" className="text-xs">
                Auto-generated
              </Badge>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Charge</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workflowTasks.map((task) => renderTaskRow(task, true))}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Manual Tasks Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
            <div>
              <CardTitle className="text-base">Service Tasks</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {manualTasks.length > 0 ? `${manualTasks.length} ${manualTasks.length === 1 ? "task" : "tasks"} added manually` : "No manual service tasks yet"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {useRepairWorkspace && (
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/workorders/${workOrderId}/repairs`}>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open repair workspace
                  </Link>
                </Button>
              )}
              <PermissionGuard permission="edit_workorders">
                <Button size="sm" onClick={() => setShowAddDialog(true)} disabled={useRepairWorkspace}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Task
                </Button>
              </PermissionGuard>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-10">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
                <p className="mt-3 text-sm text-muted-foreground">Loading tasks…</p>
              </div>
            ) : manualTasks.length === 0 && !useRepairWorkspace ? (
              <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-10 text-center">
                <Wrench className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">No manual tasks yet</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Add custom tasks for specific repair work.
                </p>
                <Button onClick={() => setShowAddDialog(true)} variant="secondary" className="mt-4">
                  <Plus className="mr-2 h-4 w-4" />
                  Add task
                </Button>
              </div>
            ) : (
              <>
              {useRepairWorkspace && (
                <div className="mb-3 rounded-md border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
                  Start, complete, and track repair tasks in the{" "}
                  <Link href={`/workorders/${workOrderId}/repairs`} className="font-medium text-primary hover:underline">
                    repair workspace
                  </Link>
                  . This tab is a read-only summary while repairs are active.
                </div>
              )}
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Charge</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {manualTasks.map((task) => renderTaskRow(task, false))}
                </TableBody>
              </Table>
              </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Show message if no tasks at all */}
        {tasks.length === 0 && (
          <Card>
            <CardContent className="py-8">
              <p className="text-sm text-muted-foreground text-center">
                No tasks yet. Tasks will be automatically created as the work order progresses through its workflow phases.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {showAddDialog && (
        <AddTaskDialog
          workOrderId={workOrderId}
          branchId={branchId}
          open={showAddDialog}
          onClose={() => setShowAddDialog(false)}
          onSuccess={() => {
            setShowAddDialog(false);
            onRefresh();
          }}
        />
      )}
      <Dialog open={!!completeTask} onOpenChange={(open) => !open && setCompleteTask(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Complete Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 p-6 pt-0">
            <div>
              <p className="text-sm font-medium text-foreground">{completeTask?.description}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Completing applies the flat charge from the task type or income category.
                {completeTask?.labor_cost && Number(completeTask.labor_cost) > 0
                  ? ` Charge: $${Number(completeTask.labor_cost).toFixed(2)}`
                  : ""}
              </p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="completion_notes" className="text-sm font-medium">Completion notes</label>
              <Textarea
                id="completion_notes"
                value={completeNotes}
                onChange={(event) => setCompleteNotes(event.target.value)}
                placeholder="What was completed?"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteTask(null)} disabled={completeTaskMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={submitCompleteTask} disabled={completeTaskMutation.isPending}>
              {completeTaskMutation.isPending ? "Completing..." : "Complete Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editBillingTask}
        onOpenChange={(open) => {
          if (!open) {
            setEditBillingTask(null);
            setBillingCategoryId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set income category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 p-6 pt-0">
            <p className="text-sm text-muted-foreground">
              Override the billing income category for{" "}
              <span className="font-medium text-foreground">{editBillingTask?.description}</span>.
              Leave unmapped to use the task type default.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">{INCOME_CATEGORY_SHORT}</Label>
              <RevenueProductSelect
                value={billingCategoryId}
                onChange={setBillingCategoryId}
                revenueClass="labor"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditBillingTask(null);
                setBillingCategoryId(null);
              }}
              disabled={updateBillingCategoryMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!editBillingTask) return;
                updateBillingCategoryMutation.mutate({
                  taskId: editBillingTask.id,
                  revenueProduct: billingCategoryId,
                });
              }}
              disabled={updateBillingCategoryMutation.isPending}
            >
              {updateBillingCategoryMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
