"use client";

import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { workOrderTasksApi, ServiceTask } from "@/lib/api/workorder-tasks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, CheckCircle2, Clock, Play, Workflow, User, AlertCircle, Info, Wrench } from "lucide-react";
import { format } from "date-fns";
import AddTaskDialog from "./AddTaskDialog";

interface TasksTabProps {
  workOrderId: number;
  tasks: ServiceTask[];
  onRefresh: () => void;
  workOrder?: {
    status?: string;
    service_coordinator?: number | { id: number; first_name: string; last_name: string };
    service_coordinator_name?: string;
  };
}

export default function WorkOrderTasksTab({ workOrderId, tasks, onRefresh, workOrder }: TasksTabProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);

  // Separate workflow tasks from manual tasks and sort them
  const { workflowTasks, manualTasks } = useMemo(() => {
    const workflow = tasks
      .filter((task) => task.is_workflow_task === true)
      .sort((a, b) => {
        // Sort by sequence_order if available, otherwise by creation time
        if (a.sequence_order !== undefined && b.sequence_order !== undefined) {
          return a.sequence_order - b.sequence_order;
        }
        return 0;
      });
    const manual = tasks.filter((task) => !task.is_workflow_task);
    return { workflowTasks: workflow, manualTasks: manual };
  }, [tasks]);

  const getStatusVariant = (status: string) => {
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
      onRefresh();
    },
  });

  const handleStartTask = (taskId: number) => {
    startTaskMutation.mutate(taskId);
  };

  const handleCompleteTask = (taskId: number) => {
    completeTaskMutation.mutate({ taskId });
  };

  // Get workflow phase description and icon
  const getWorkflowTaskInfo = (task: ServiceTask) => {
    const phase = task.workflow_phase;

    const descriptions: Record<string, { description: string; icon: any; actionHint?: string }> = {
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

    return (
      <TableRow
        key={task.id}
        className={`
          ${isWorkflow ? "bg-primary/5" : ""}
          ${isCurrentPhase ? "ring-2 ring-primary/20" : ""}
        `}
      >
        <TableCell>
          <div className="flex items-start gap-2">
            {isWorkflow && (
              <TaskIcon className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium">{task.description}</p>
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
        <TableCell>
          <span className="text-sm capitalize">{task.task_type?.replace(/_/g, " ")}</span>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            {isWorkflow && task.workflow_phase === 'assigned' && (
              <User className="w-3 h-3 text-muted-foreground" />
            )}
            <span className="text-sm">
              {task.assigned_to_name || "-"}
            </span>
          </div>
        </TableCell>
        <TableCell>

          <Badge variant={getStatusVariant(task.status) as any}>
            {task.status?.replace(/_/g, " ")}
          </Badge>
        </TableCell>
        <TableCell>
          <div className="text-sm">
            {(task.calculated_hours !== undefined && task.calculated_hours !== null && task.calculated_hours > 0) ? (
              <span>{Number(task.calculated_hours).toFixed(2)}h</span>
            ) : (task.actual_hours !== undefined && task.actual_hours !== null && task.actual_hours > 0) ? (
              <span>{Number(task.actual_hours).toFixed(2)}h</span>
            ) : (task.estimated_hours !== undefined && task.estimated_hours !== null && task.estimated_hours > 0) ? (
              <span className="text-muted-foreground">Est: {Number(task.estimated_hours).toFixed(2)}h</span>
            ) : task.status === 'completed' ? (
              <span className="text-muted-foreground">0.00h</span>
            ) : (
              "-"
            )}
          </div>
        </TableCell>
        <TableCell>
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
        <TableCell>
          {!isWorkflow ? (
            <div className="flex items-center space-x-2">
              {task.status === "pending" && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleStartTask(task.id)}
                  disabled={startTaskMutation.isPending}
                >
                  <Play className="w-3 h-3 mr-1" />
                  Start
                </Button>
              )}
              {task.status === "in_progress" && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleCompleteTask(task.id)}
                  disabled={completeTaskMutation.isPending}
                >
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Complete
                </Button>
              )}
              {task.status === "completed" && (
                <span className="text-xs text-muted-foreground">Completed</span>
              )}
              {task.status === "skipped" && (
                <span className="text-xs text-muted-foreground">Skipped</span>
              )}
            </div>
          ) : (
            <div className="flex items-center space-x-2">
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
      <div className="space-y-6">
        {/* Workflow Tasks Section */}
        {workflowTasks.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Workflow className="w-5 h-5 text-primary" />
                <CardTitle>Workflow Tasks</CardTitle>
              </div>
              <Badge variant="secondary" className="text-xs">
                Auto-generated
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="mb-4 space-y-3">
                {/* Note text removed per request */}
                {workflowTasks.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                      <span>Completed: {workflowTasks.filter(t => t.status === 'completed').length}</span>
                    </div>
                    <span>•</span>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-primary" />
                      <span>In Progress: {workflowTasks.filter(t => t.status === 'in_progress').length}</span>
                    </div>
                    <span>•</span>
                    <div className="flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 text-muted-foreground" />
                      <span>Pending: {workflowTasks.filter(t => t.status === 'pending').length}</span>
                    </div>
                  </div>
                )}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workflowTasks.map((task) => renderTaskRow(task, true))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Manual Tasks Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Manual Tasks</CardTitle>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Task
            </Button>
          </CardHeader>
          <CardContent>
            {manualTasks.length === 0 ? (
              <div className="text-center py-12">
                <Wrench className="w-12 h-12 text-gray-300 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm font-medium text-foreground mb-1">
                  No manual tasks yet
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  Add custom tasks for specific repair work that needs to be performed.
                </p>
                <Button onClick={() => setShowAddDialog(true)} variant="secondary">
                  <Plus className="w-4 h-4 mr-2" />
                  Add First Task
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {manualTasks.map((task) => renderTaskRow(task, false))}
                </TableBody>
              </Table>
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
          open={showAddDialog}
          onClose={() => setShowAddDialog(false)}
          onSuccess={() => {
            setShowAddDialog(false);
            onRefresh();
          }}
        />
      )}
    </>
  );
}
