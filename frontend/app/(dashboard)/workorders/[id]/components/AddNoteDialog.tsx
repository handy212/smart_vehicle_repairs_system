"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { workOrderNotesApi } from "@/lib/api/workorder-notes";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { AxiosError } from "axios";

const noteSchema = z.object({
  note_type: z.enum(["internal", "customer_visible", "phone_call", "email", "meeting"]),
  note: z.string().min(1, "Note is required"),
  is_important: z.boolean(),
  is_customer_visible: z.boolean(),
});

type NoteFormData = z.infer<typeof noteSchema>;

interface AddNoteDialogProps {
  workOrderId: number;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddNoteDialog({ workOrderId, open, onClose, onSuccess }: AddNoteDialogProps) {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
    reset,
    setError,
    watch,
  } = useForm<NoteFormData>({
    resolver: zodResolver(noteSchema),
    defaultValues: {
      note_type: "internal",
      is_important: false,
      is_customer_visible: false,
    },
  });

  const noteType = watch("note_type");
  const isCustomerVisible = watch("is_customer_visible");

  const createMutation = useMutation({
    mutationFn: (data: NoteFormData) =>
      workOrderNotesApi.create({
        ...data,
        work_order: workOrderId,
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
            setError(field as keyof NoteFormData, {
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

  const onSubmit = async (data: NoteFormData) => {
    setServerError(null);
    await createMutation.mutateAsync(data);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Note</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="px-6 pb-6">
          <div className="space-y-4">
            {serverError && (
              <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded text-sm">
                {serverError}
              </div>
            )}

            <div>
              <label htmlFor="note_type" className="block text-sm font-medium text-gray-700 mb-2">
                Note Type *
              </label>
              <Select
                value={watch("note_type")}
                onValueChange={(val) => setValue("note_type", val as any)}
              >
                <SelectTrigger id="note_type" className="w-full">
                  <SelectValue placeholder="Select note type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="customer_visible">Customer Visible</SelectItem>
                  <SelectItem value="phone_call">Phone Call</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                </SelectContent>
              </Select>
              {errors.note_type && (
                <p className="mt-1 text-sm text-red-600">{errors.note_type.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="note" className="block text-sm font-medium text-gray-700 mb-2">
                Note *
              </label>
              <Textarea
                id="note"
                {...register("note")}
                rows={6}
                className={`w-full ${errors.note ? "border-red-500" : ""}`}
                placeholder="Enter your note here..."
              />
              {errors.note && (
                <p className="mt-1 text-sm text-red-600">{errors.note.message}</p>
              )}
            </div>

            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  {...register("is_important")}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <span className="text-sm text-gray-700">Mark as Important</span>
              </label>
              {noteType === "internal" && (
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    {...register("is_customer_visible")}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-gray-700">Customer Visible</span>
                </label>
              )}
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>
            {isSubmitting ? "Adding..." : "Add Note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

