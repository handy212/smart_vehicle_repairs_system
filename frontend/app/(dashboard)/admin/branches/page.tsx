"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { branchesApi, Branch } from "@/lib/api/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, MapPin, Users, Building2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

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

export default function BranchesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  const { data: branchesData, isLoading } = useQuery({
    queryKey: ["branches"],
    queryFn: () => branchesApi.list(),
  });

  const branches = Array.isArray(branchesData) 
    ? branchesData 
    : branchesData?.results || [];

  const deleteMutation = useMutation({
    mutationFn: (id: number) => branchesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      toast({ title: "Success", description: "Branch deleted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to delete branch",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (branch: Branch) => {
    if (confirm(`Are you sure you want to delete branch "${branch.name}"?`)) {
      deleteMutation.mutate(branch.id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Branches</h1>
          <p className="text-sm text-gray-500 mt-1">Manage branch locations</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Branch
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {branches.map((branch) => (
            <Card key={branch.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center space-x-2">
                      <Building2 className="w-5 h-5" />
                      <span>{branch.name}</span>
                    </CardTitle>
                    <p className="text-sm text-gray-500 mt-1">
                      <code className="bg-gray-100 px-2 py-1 rounded text-xs">{branch.code}</code>
                    </p>
                  </div>
                  <div className="flex space-x-1">
                    {branch.is_headquarters && (
                      <Badge variant="default">HQ</Badge>
                    )}
                    <Badge variant={branch.is_active ? "default" : "secondary"}>
                      {branch.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-start space-x-2 text-sm">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div>
                      <p>{branch.address}</p>
                      <p>
                        {branch.city}, {branch.state} {branch.zip_code}
                      </p>
                    </div>
                  </div>
                  {branch.phone && (
                    <div className="text-sm text-gray-600">
                      <strong>Phone:</strong> {branch.phone}
                    </div>
                  )}
                  {branch.email && (
                    <div className="text-sm text-gray-600">
                      <strong>Email:</strong> {branch.email}
                    </div>
                  )}
                  <div className="flex items-center space-x-4 text-sm text-gray-600">
                    <div className="flex items-center space-x-1">
                      <Users className="w-4 h-4" />
                      <span>{branch.staff_count || 0} staff</span>
                    </div>
                    {branch.manager_count && branch.manager_count > 0 && (
                      <div className="flex items-center space-x-1">
                        <Users className="w-4 h-4" />
                        <span>{branch.manager_count} managers</span>
                      </div>
                    )}
                  </div>
                  <div className="flex space-x-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingBranch(branch)}
                      className="flex-1"
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(branch)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(isCreateDialogOpen || editingBranch) && (
        <BranchDialog
          branch={editingBranch}
          open={isCreateDialogOpen || !!editingBranch}
          onClose={() => {
            setIsCreateDialogOpen(false);
            setEditingBranch(null);
          }}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["branches"] });
            setIsCreateDialogOpen(false);
            setEditingBranch(null);
          }}
        />
      )}
    </div>
  );
}

function BranchDialog({
  branch,
  open,
  onClose,
  onSuccess,
}: {
  branch: Branch | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
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

  const createMutation = useMutation({
    mutationFn: (data: BranchFormData) => branchesApi.create(data),
    onSuccess: () => {
      toast({ title: "Success", description: "Branch created successfully" });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to create branch",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<BranchFormData>) => branchesApi.update(branch!.id, data),
    onSuccess: () => {
      toast({ title: "Success", description: "Branch updated successfully" });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to update branch",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: BranchFormData) => {
    if (branch) {
      await updateMutation.mutateAsync(data);
    } else {
      await createMutation.mutateAsync(data);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{branch ? "Edit Branch" : "Create Branch"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="px-6 pb-6">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name" className="block mb-2">
                  Name *
                </Label>
                <Input id="name" {...register("name")} className="w-full" />
                {errors.name && (
                  <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="code" className="block mb-2">
                  Code *
                </Label>
                <Input
                  id="code"
                  {...register("code")}
                  className="w-full"
                  disabled={!!branch}
                  placeholder="e.g., DTN"
                />
                {errors.code && (
                  <p className="text-red-500 text-xs mt-1">{errors.code.message}</p>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="description" className="block mb-2">
                Description
              </Label>
              <Textarea id="description" {...register("description")} rows={2} className="w-full" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="phone" className="block mb-2">
                  Phone *
                </Label>
                <Input id="phone" {...register("phone")} className="w-full" />
                {errors.phone && (
                  <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="email" className="block mb-2">
                  Email
                </Label>
                <Input id="email" type="email" {...register("email")} className="w-full" />
              </div>
              <div>
                <Label htmlFor="fax" className="block mb-2">
                  Fax
                </Label>
                <Input id="fax" {...register("fax")} className="w-full" />
              </div>
            </div>
            <div>
              <Label htmlFor="address" className="block mb-2">
                Address *
              </Label>
              <Input id="address" {...register("address")} className="w-full" />
              {errors.address && (
                <p className="text-red-500 text-xs mt-1">{errors.address.message}</p>
              )}
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <Label htmlFor="city" className="block mb-2">
                  City *
                </Label>
                <Input id="city" {...register("city")} className="w-full" />
                {errors.city && (
                  <p className="text-red-500 text-xs mt-1">{errors.city.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="state" className="block mb-2">
                  State *
                </Label>
                <Input id="state" {...register("state")} className="w-full" />
                {errors.state && (
                  <p className="text-red-500 text-xs mt-1">{errors.state.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="zip_code" className="block mb-2">
                  Zip Code *
                </Label>
                <Input id="zip_code" {...register("zip_code")} className="w-full" />
                {errors.zip_code && (
                  <p className="text-red-500 text-xs mt-1">{errors.zip_code.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="country" className="block mb-2">
                  Country
                </Label>
                <Input id="country" {...register("country")} className="w-full" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="opening_time" className="block mb-2">
                  Opening Time
                </Label>
                <Input id="opening_time" type="time" {...register("opening_time")} className="w-full" />
              </div>
              <div>
                <Label htmlFor="closing_time" className="block mb-2">
                  Closing Time
                </Label>
                <Input id="closing_time" type="time" {...register("closing_time")} className="w-full" />
              </div>
              <div>
                <Label htmlFor="timezone" className="block mb-2">
                  Timezone
                </Label>
                <Input id="timezone" {...register("timezone")} className="w-full" />
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  {...register("is_active")}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Active</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  {...register("is_headquarters")}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Headquarters</span>
              </label>
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit(onSubmit)}
            disabled={isSubmitting}
          >
            {branch ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

