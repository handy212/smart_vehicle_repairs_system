"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { branchesApi } from "@/lib/api/branches";
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
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import React from "react";
import { getUserFacingError } from "@/lib/api/errors";
import { Controller } from "react-hook-form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GHANA_REGIONS } from "@/lib/constants/ghana-regions";

const branchSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().min(1, "Code is required").max(10),
  description: z.string().optional(),
  phone: z.string().min(1, "Phone is required"),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().min(1, "Address is required"),
  region: z.string().min(1, "Region is required"),
  city: z.string().min(1, "City is required"),
  area: z.string().optional(),
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
    control,
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
                address: branch.address || "",
        city: branch.city || "",
        region: branch.region || "Greater Accra",
        area: branch.area || "",
        country: branch.country || "Ghana",
        is_active: branch.is_active ?? true,
        is_headquarters: branch.is_headquarters ?? false,
        opening_time: branch.opening_time || "",
        closing_time: branch.closing_time || "",
        timezone: branch.timezone || "Africa/Accra",
      }
      : {
        region: "Greater Accra",
        country: "Ghana",
        is_active: true,
        is_headquarters: false,
        timezone: "Africa/Accra",
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
                address: branch.address || "",
        city: branch.city || "",
        region: branch.region || "Greater Accra",
        area: branch.area || "",
        country: branch.country || "Ghana",
        is_active: branch.is_active ?? true,
        is_headquarters: branch.is_headquarters ?? false,
        opening_time: branch.opening_time || "",
        closing_time: branch.closing_time || "",
        timezone: branch.timezone || "Africa/Accra",
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

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to update branch"),
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: BranchFormData) => {
    // Clean up empty strings - convert to null/undefined for optional fields

    const cleanedData: Partial<BranchFormData> = { ...data };

    // Convert empty strings to null for optional fields
    if (cleanedData.description === "") delete cleanedData.description;
    if (cleanedData.email === "") delete cleanedData.email;
    if (cleanedData.area === "") delete cleanedData.area;
    if (cleanedData.opening_time === "" || cleanedData.opening_time === null) delete cleanedData.opening_time;
    if (cleanedData.closing_time === "" || cleanedData.closing_time === null) delete cleanedData.closing_time;
    if (cleanedData.timezone === "") cleanedData.timezone = "Africa/Accra";

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
      <div className="space-y-4 px-4 pt-4">
        <div className="flex items-center gap-4">
          <div className="h-9 w-48 bg-border rounded animate-pulse"></div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="h-10 bg-border rounded animate-pulse"></div>
              <div className="h-10 bg-border rounded animate-pulse"></div>
              <div className="h-10 bg-border rounded animate-pulse"></div>
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
              <p className="text-muted-foreground">Branch not found</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <PermissionPageGuard permission="manage_branches">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" className="h-8" onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-xl font-bold text-foreground">Edit Branch</h1>
              <p className="text-sm text-muted-foreground mt-1">{branch.name}</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)}>
          <Card>
            <CardHeader className="px-4 py-3">
              <CardTitle className="text-sm">Branch Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-4 pb-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">
                    Name <span className="text-destructive">*</span>
                  </Label>
                  <Input id="name" {...register("name")} className="w-full" />
                  {errors.name && (
                    <p className="text-destructive text-xs mt-1">{errors.name.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="code">
                    Code <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="code"
                    {...register("code")}
                    className="w-full"
                    disabled
                    placeholder="e.g., DTN"
                    maxLength={10}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Branch code cannot be changed after creation
                  </p>
                  {errors.code && (
                    <p className="text-destructive text-xs mt-1">{errors.code.message}</p>
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
                    Phone <span className="text-destructive">*</span>
                  </Label>
                  <Input id="phone" {...register("phone")} className="w-full" />
                  {errors.phone && (
                    <p className="text-destructive text-xs mt-1">{errors.phone.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" {...register("email")} className="w-full" />
                </div>
              </div>

              <div>
                <Label htmlFor="address">
                  Address <span className="text-destructive">*</span>
                </Label>
                <Input id="address" {...register("address")} className="w-full" />
                {errors.address && (
                  <p className="text-destructive text-xs mt-1">{errors.address.message}</p>
                )}
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="region">
                    Region <span className="text-destructive">*</span>
                  </Label>
                  <Controller
                    name="region"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="region" className="w-full">
                          <SelectValue placeholder="Select region" />
                        </SelectTrigger>
                        <SelectContent>
                          {GHANA_REGIONS.map((region) => (
                            <SelectItem key={region} value={region}>
                              {region}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.region && (
                    <p className="text-destructive text-xs mt-1">{errors.region.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="city">
                    City <span className="text-destructive">*</span>
                  </Label>
                  <Input id="city" {...register("city")} className="w-full" placeholder="e.g. Accra" />
                  {errors.city && (
                    <p className="text-destructive text-xs mt-1">{errors.city.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="area">Area</Label>
                  <Input id="area" {...register("area")} className="w-full" placeholder="e.g. East Legon" />
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
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-card-foreground">Active</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    {...register("is_headquarters")}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-card-foreground">Headquarters</span>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 mt-6">
            <Button type="button" variant="secondary" size="sm" className="h-8" onClick={() => router.back()}>
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button type="submit" size="sm" className="h-8" disabled={isSubmitting}>
              <Save className="w-4 h-4 mr-2" />
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    </PermissionPageGuard>
  );
}
