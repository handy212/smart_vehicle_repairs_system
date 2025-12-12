"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { branchesApi, Branch } from "@/lib/api/branches";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Save, X } from "lucide-react";
import { useRouter, useParams } from "next/navigation";
import { useToast } from "@/lib/hooks/useToast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import React from "react";

const branchSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().min(1, "Code is required").max(10),
  description: z.string().optional(),
  phone: z.string().min(1, "Phone is required"),
  email: z.string().email().optional().or(z.literal("")),
  fax: z.string().optional(),
  address: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zip_code: z.string().min(1, "Zip code is required"),
  country: z.string().optional(),
  is_active: z.boolean().optional(),
  is_headquarters: z.boolean().optional(),
  opening_time: z.string().optional(),
  closing_time: z.string().optional(),
  timezone: z.string().optional(),
});

type BranchFormData = z.infer<typeof branchSchema>;

export default function BranchEditPage() {
  const router = useRouter();
  const params = useParams();
  const branchId = parseInt(params.id as string);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: branch, isLoading } = useQuery({
    queryKey: ["branch", branchId],
    queryFn: () => branchesApi.get(branchId),
    enabled: !!branchId,
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<BranchFormData>({
    resolver: zodResolver(branchSchema),
    defaultValues: branch
      ? {
          name: branch.name || "",
          code: branch.code || "",
          description: branch.description || "",
          phone: branch.phone || "",
          email: branch.email || "",
          fax: branch.fax || "",
          address: branch.address || "",
          city: branch.city || "",
          state: branch.state || "",
          zip_code: branch.zip_code || "",
          country: branch.country || "USA",
          is_active: branch.is_active ?? true,
          is_headquarters: branch.is_headquarters ?? false,
          opening_time: branch.opening_time || "",
          closing_time: branch.closing_time || "",
          timezone: branch.timezone || "America/New_York",
        }
      : {
          country: "USA",
          is_active: true,
          is_headquarters: false,
          timezone: "America/New_York",
        },
  });

  // Reset form when branch data loads
  React.useEffect(() => {
    if (branch) {
      reset({
        name: branch.name || "",
        code: branch.code || "",
        description: branch.description || "",
        phone: branch.phone || "",
        email: branch.email || "",
        fax: branch.fax || "",
        address: branch.address || "",
        city: branch.city || "",
        state: branch.state || "",
        zip_code: branch.zip_code || "",
        country: branch.country || "USA",
        is_active: branch.is_active ?? true,
        is_headquarters: branch.is_headquarters ?? false,
        opening_time: branch.opening_time || "",
        closing_time: branch.closing_time || "",
        timezone: branch.timezone || "America/New_York",
      });
    }
  }, [branch, reset]);

  const updateMutation = useMutation({
    mutationFn: (data: Partial<BranchFormData>) => branchesApi.update(branchId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branch", branchId] });
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      toast({ title: "Success", description: "Branch updated successfully" });
      router.push(`/admin/branches/${branchId}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description:
          error.response?.data?.detail ||
          Object.values(error.response?.data || {})
            .flat()
            .join(", ") ||
          "Failed to update branch",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: BranchFormData) => {
    // Clean up empty strings - convert to null/undefined for optional fields
    const cleanedData: any = { ...data };
    
    // Convert empty strings to null for optional fields
    if (cleanedData.description === "") delete cleanedData.description;
    if (cleanedData.email === "") delete cleanedData.email;
    if (cleanedData.fax === "") delete cleanedData.fax;
    if (cleanedData.opening_time === "" || cleanedData.opening_time === null) delete cleanedData.opening_time;
    if (cleanedData.closing_time === "" || cleanedData.closing_time === null) delete cleanedData.closing_time;
    if (cleanedData.timezone === "") cleanedData.timezone = "America/New_York";
    
    // Ensure code is uppercase (but don't send it if it's disabled/read-only)
    if (cleanedData.code) {
      cleanedData.code = cleanedData.code.toUpperCase().trim();
    }
    
    // Don't send code field on update since it's disabled
    delete cleanedData.code;
    
    await updateMutation.mutateAsync(cleanedData);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="h-9 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
              <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
              <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!branch) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">Branch not found</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <PermissionGuard permission="manage_branches">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Edit Branch</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{branch.name}</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)}>
          <Card>
            <CardHeader>
              <CardTitle>Branch Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">
                    Name <span className="text-red-500">*</span>
                  </Label>
                  <Input id="name" {...register("name")} className="w-full" />
                  {errors.name && (
                    <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="code">
                    Code <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="code"
                    {...register("code")}
                    className="w-full"
                    disabled
                    placeholder="e.g., DTN"
                    maxLength={10}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Branch code cannot be changed after creation
                  </p>
                  {errors.code && (
                    <p className="text-red-500 text-xs mt-1">{errors.code.message}</p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" {...register("description")} rows={3} className="w-full" />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="phone">
                    Phone <span className="text-red-500">*</span>
                  </Label>
                  <Input id="phone" {...register("phone")} className="w-full" />
                  {errors.phone && (
                    <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" {...register("email")} className="w-full" />
                </div>
                <div>
                  <Label htmlFor="fax">Fax</Label>
                  <Input id="fax" {...register("fax")} className="w-full" />
                </div>
              </div>

              <div>
                <Label htmlFor="address">
                  Address <span className="text-red-500">*</span>
                </Label>
                <Input id="address" {...register("address")} className="w-full" />
                {errors.address && (
                  <p className="text-red-500 text-xs mt-1">{errors.address.message}</p>
                )}
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="city">
                    City <span className="text-red-500">*</span>
                  </Label>
                  <Input id="city" {...register("city")} className="w-full" />
                  {errors.city && (
                    <p className="text-red-500 text-xs mt-1">{errors.city.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="state">
                    State <span className="text-red-500">*</span>
                  </Label>
                  <Input id="state" {...register("state")} className="w-full" />
                  {errors.state && (
                    <p className="text-red-500 text-xs mt-1">{errors.state.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="zip_code">
                    Zip Code <span className="text-red-500">*</span>
                  </Label>
                  <Input id="zip_code" {...register("zip_code")} className="w-full" />
                  {errors.zip_code && (
                    <p className="text-red-500 text-xs mt-1">{errors.zip_code.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="country">Country</Label>
                  <Input id="country" {...register("country")} className="w-full" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="opening_time">Opening Time</Label>
                  <Input id="opening_time" type="time" {...register("opening_time")} className="w-full" />
                </div>
                <div>
                  <Label htmlFor="closing_time">Closing Time</Label>
                  <Input id="closing_time" type="time" {...register("closing_time")} className="w-full" />
                </div>
                <div>
                  <Label htmlFor="timezone">Timezone</Label>
                  <Input id="timezone" {...register("timezone")} className="w-full" />
                </div>
              </div>

              <div className="flex items-center space-x-6 pt-4 border-t">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    {...register("is_active")}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    {...register("is_headquarters")}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Headquarters</span>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 mt-6">
            <Button type="button"variant="secondary" onClick={() => router.back()}>
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              <Save className="w-4 h-4 mr-2" />
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    </PermissionGuard>
  );
}

