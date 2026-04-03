"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { workOrderTasksApi } from "@/lib/api/workorder-tasks";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { AxiosError } from "axios";

const taskSchema = z.object({
  task_type: z.enum(["inspection", "repair", "replacement", "diagnostic"]),
  description: z.string().min(1, "Description is required"),
  detailed_notes: z.string().optional(),
  estimated_hours: z.number().min(0).optional(),
  sequence_order: z.number().min(0).optional(),
});

type TaskFormData = z.infer<typeof taskSchema>;

interface AddTaskDialogProps {
  workOrderId: number;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddTaskDialog({ workOrderId, open, onClose, onSuccess }: AddTaskDialogProps) {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
    reset,
    setError,
  } = useForm<TaskFormData>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      task_type: "repair",
      sequence_order: 0,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: TaskFormData) =>
      workOrderTasksApi.create({
        ...data,
        work_order: workOrderId,
        status: "pending",
      }),
    onSuccess: () => {
      reset();
      setServerError(null);
      onSuccess();
    },
    onError: (error) => {
      if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data;
        Object.keys(errorData).forEach((field) => {
          if (field !== 'non_field_errors' && field !== 'detail') {
            const fieldError = Array.isArray(errorData[field])
              ? errorData[field][0]
              : errorData[field];
            setError(field as keyof TaskFormData, {
              type: "server",
              message: fieldError,
            });
          }
        });
        if (errorData.non_field_errors) {
          setServerError(Array.isArray(errorData.non_field_errors) ? errorData.non_field_errors[0] : errorData.non_field_errors);
        } else if (errorData.detail) {
          setServerError(errorData.detail);
        }
      }
    },
  });

  const onSubmit = async (data: TaskFormData) => {
    setServerError(null);
    await createMutation.mutateAsync(data);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Service Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="px-6 pb-6">
          <div className="space-y-4">
            {serverError && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive p-3 rounded text-sm">
                {serverError}
              </div>
            )}

            <div>
              <label htmlFor="task_type" className="block text-sm font-medium text-foreground mb-2">
                Task Type *
              </label>
              <Select
                value={watch("task_type")}

                onValueChange={(val) => setValue("task_type", val as any)}
              >
                <SelectTrigger id="task_type" className="w-full">
                  <SelectValue placeholder="Select task type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inspection">Inspection</SelectItem>
                  <SelectItem value="repair">Repair</SelectItem>
                  <SelectItem value="replacement">Replacement</SelectItem>
                  <SelectItem value="diagnostic">Diagnostic</SelectItem>
                </SelectContent>
              </Select>
              {errors.task_type && (
                <p className="mt-1 text-sm text-destructive">{errors.task_type.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-foreground mb-2">
                Description *
              </label>
              <Input
                id="description"
                {...register("description")}
                className={`w-full ${errors.description ? "border-destructive" : ""}`}
              />
              {errors.description && (
                <p className="mt-1 text-sm text-destructive">{errors.description.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="detailed_notes" className="block text-sm font-medium text-foreground mb-2">
                Detailed Notes
              </label>
              <Textarea
                id="detailed_notes"
                {...register("detailed_notes")}
                rows={4}
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="estimated_hours" className="block text-sm font-medium text-foreground mb-2">
                  Estimated Hours
                </label>
                <Input
                  id="estimated_hours"
                  type="number"
                  step="0.5"
                  {...register("estimated_hours", { valueAsNumber: true })}
                  className="w-full"
                />
              </div>
              <div>
                <label htmlFor="sequence_order" className="block text-sm font-medium text-foreground mb-2">
                  Sequence Order
                </label>
                <Input
                  id="sequence_order"
                  type="number"
                  {...register("sequence_order", { valueAsNumber: true })}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>
            {isSubmitting ? "Adding..." : "Add Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

