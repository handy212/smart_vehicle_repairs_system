"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { workOrderTasksApi, ServiceTask } from "@/lib/api/workorder-tasks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, CheckCircle2, Clock, Play } from "lucide-react";
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

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Service Tasks</CardTitle>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Task
          </Button>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              No tasks yet. Add a task to get started.
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
                {tasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{task.description}</p>
                        {task.detailed_notes && (
                          <p className="text-xs text-gray-500 mt-1">{task.detailed_notes}</p>
                        )}
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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

