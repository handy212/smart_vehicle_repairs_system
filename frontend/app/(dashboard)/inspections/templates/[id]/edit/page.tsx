"use client";

import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { inspectionsApi } from "@/lib/api/inspections";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/lib/hooks/useToast";
import { useEffect } from "react";
import { getUserFacingError } from "@/lib/api/errors";

const templateSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  description: z.string().optional().or(z.literal("")),
  is_active: z.boolean(),
  is_default: z.boolean(),
  requires_odometer: z.boolean(),
  requires_technician_signature: z.boolean(),
  requires_customer_signature: z.boolean(),
  allows_photos: z.boolean(),
  allows_video: z.boolean(),
});

type TemplateFormData = z.infer<typeof templateSchema>;

export default function EditTemplatePage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Parse templateId with validation
  // Handle both string and Promise (Next.js 16 async params)
  const idValue = params?.id;
  const templateIdParam = typeof idValue === 'string' && idValue !== 'undefined' ? idValue : null;
  const templateId = templateIdParam ? parseInt(templateIdParam, 10) : NaN;
  const isValidId = !isNaN(templateId) && templateId > 0;

  // Validate templateId before making the query
  const { data: template, isLoading } = useQuery({
    queryKey: ["template", templateId],
    queryFn: () => {
      if (!isValidId) {
        throw new Error("Invalid template ID");
      }
      return inspectionsApi.templates.get(templateId);
    },
    enabled: isValidId && templateIdParam !== null,
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<TemplateFormData>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      is_active: true,
      is_default: false,
      requires_odometer: true,
      requires_technician_signature: true,
      requires_customer_signature: false,
      allows_photos: true,
      allows_video: false,
    },
  });

  // Populate form when template data loads
  useEffect(() => {
    if (template) {
      reset({
        name: template.name,
        description: template.description || "",
        is_active: template.is_active,
        is_default: template.is_default,
        requires_odometer: template.requires_odometer,
        requires_technician_signature: template.requires_technician_signature,
        requires_customer_signature: template.requires_customer_signature,
        allows_photos: template.allows_photos,
        allows_video: template.allows_video,
      });
    }
  }, [template, reset]);

  const updateMutation = useMutation({
    mutationFn: (data: TemplateFormData) => inspectionsApi.templates.update(templateId, data),
    onSuccess: (updatedTemplate) => {
      queryClient.invalidateQueries({ queryKey: ["template", templateId] });
      queryClient.invalidateQueries({ queryKey: ["inspection-templates"] });
      toast({
        title: "Success",
        description: "Template updated successfully",
        variant: "success",
      });
      router.push(`/inspections/templates/${updatedTemplate.id}`);
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to update template"),
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: TemplateFormData) => {
    // Clean up the data - convert empty strings to undefined for optional fields
    const cleanedData = {
      ...data,
      description: data.description?.trim() || undefined,
    };
    await updateMutation.mutateAsync(cleanedData);
  };

  if (!isValidId) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">Invalid template ID</p>
        <Link href="/inspections/templates">
          <Button variant="secondary" className="mt-4">
            Back to Templates
          </Button>
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Template not found</p>
        <Link href="/inspections/templates">
          <Button variant="secondary" className="mt-4">
            Back to Templates
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link href={`/inspections/templates/${templateId}`}>
          <Button variant="secondary" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Edit Inspection Template</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Update template details and settings
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Template Details</CardTitle>
            <CardDescription>
              Basic information about the inspection template
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="name">
                Template Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                {...register("name")}
                placeholder="e.g., Multi-Point Inspection"
                className="mt-1"
              />
              {errors.name && (
                <p className="text-destructive text-xs mt-1">{errors.name.message}</p>
              )}
              {/* Server-side validation errors will be shown in toast */}
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                {...register("description")}
                placeholder="Template description..."
                rows={3}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="is_active"
                  {...register("is_active", { valueAsNumber: false })}
                  className="h-4 w-4 rounded border-border"
                />
                <Label htmlFor="is_active" className="cursor-pointer">
                  Active
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="is_default"
                  {...register("is_default", { valueAsNumber: false })}
                  className="h-4 w-4 rounded border-border"
                />
                <Label htmlFor="is_default" className="cursor-pointer">
                  Set as Default
                </Label>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">Template Settings</h3>

              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="requires_odometer"
                    {...register("requires_odometer", { valueAsNumber: false })}
                    className="h-4 w-4 rounded border-border"
                  />
                  <Label htmlFor="requires_odometer" className="cursor-pointer">
                    Requires Odometer Reading
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="requires_technician_signature"
                    {...register("requires_technician_signature", { valueAsNumber: false })}
                    className="h-4 w-4 rounded border-border"
                  />
                  <Label htmlFor="requires_technician_signature" className="cursor-pointer">
                    Requires Technician Signature
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="requires_customer_signature"
                    {...register("requires_customer_signature", { valueAsNumber: false })}
                    className="h-4 w-4 rounded border-border"
                  />
                  <Label htmlFor="requires_customer_signature" className="cursor-pointer">
                    Requires Customer Signature
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="allows_photos"
                    {...register("allows_photos", { valueAsNumber: false })}
                    className="h-4 w-4 rounded border-border"
                  />
                  <Label htmlFor="allows_photos" className="cursor-pointer">
                    Allows Photos
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="allows_video"
                    {...register("allows_video", { valueAsNumber: false })}
                    className="h-4 w-4 rounded border-border"
                  />
                  <Label htmlFor="allows_video" className="cursor-pointer">
                    Allows Video
                  </Label>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-4 border-t">
              <Link href={`/inspections/templates/${templateId}`}>
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={isSubmitting}>
                <Save className="w-4 h-4 mr-2" />
                {isSubmitting ? "Updating..." : "Update Template"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
