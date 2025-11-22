"use client";

import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { workOrderTasksApi, ServiceTask } from "@/lib/api/workorder-tasks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, CheckCircle2, Clock, Play, Workflow } from "lucide-react";
import { format } from "date-fns";
import AddTaskDialog from "./AddTaskDialog";

interface TasksTabProps {
  workOrderId: number;
  tasks: ServiceTask[];
  onRefresh: () => void;
}

export default function WorkOrderTasksTab({ workOrderId, tasks, onRefresh }: TasksTabProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const queryClient = useQueryClient();

  // Separate workflow tasks from manual tasks
  const { workflowTasks, manualTasks } = useMemo(() => {
    const workflow = tasks.filter((task) => task.is_workflow_task === true);
    const manual = tasks.filter((task) => !task.is_workflow_task || task.is_workflow_task === false);
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

  const renderTaskRow = (task: ServiceTask, isWorkflow: boolean = false) => (
    <TableRow key={task.id} className={isWorkflow ? "bg-blue-50/50 dark:bg-blue-900/10" : ""}>
      <TableCell>
        <div className="flex items-start gap-2">
          {isWorkflow && (
            <Workflow className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" title="Workflow Task" />
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="font-medium">{task.description}</p>
              {isWorkflow && (
                <Badge variant="outline" className="text-xs">
                  Auto
                </Badge>
              )}
            </div>
            {task.detailed_notes && (
              <p className="text-xs text-gray-500 mt-1">{task.detailed_notes}</p>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <span className="text-sm capitalize">{task.task_type?.replace("_", " ")}</span>
      </TableCell>
      <TableCell>
        {task.assigned_to_name || "-"}
      </TableCell>
      <TableCell>
        <Badge variant={getStatusVariant(task.status) as any}>
          {task.status?.replace("_", " ")}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="text-sm">
          {task.actual_hours ? (
            <span>{task.actual_hours}h</span>
          ) : task.estimated_hours ? (
            <span className="text-gray-500">Est: {task.estimated_hours}h</span>
          ) : (
            "-"
          )}
        </div>
      </TableCell>
      <TableCell>
        {!isWorkflow && (
          <div className="flex items-center space-x-2">
            {task.status === "pending" && (
              <Button
                size="sm"
                variant="outline"
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
                variant="outline"
                onClick={() => handleCompleteTask(task.id)}
                disabled={completeTaskMutation.isPending}
              >
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Complete
              </Button>
            )}
          </div>
        )}
        {isWorkflow && (
          <span className="text-xs text-gray-500 italic">Auto-completed</span>
        )}
      </TableCell>
    </TableRow>
  );

  return (
    <>
      <div className="space-y-6">
        {/* Workflow Tasks Section */}
        {workflowTasks.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Workflow className="w-5 h-5 text-blue-600" />
                <CardTitle>Workflow Tasks</CardTitle>
              </div>
              <Badge variant="outline" className="text-xs">
                Auto-generated
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                <p className="text-sm text-blue-800 dark:text-blue-400">
                  These tasks are automatically created and completed based on the work order workflow phases.
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Hours</TableHead>
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
              <p className="text-sm text-gray-500 text-center py-8">
                No manual tasks yet. Add a task to get started.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Hours</TableHead>
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
              <p className="text-sm text-gray-500 text-center">
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

