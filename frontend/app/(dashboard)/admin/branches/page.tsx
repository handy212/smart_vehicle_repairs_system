"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { branchesApi, Branch } from "@/lib/api/branches";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Edit,
  Trash2,
  MapPin,
  Users,
  Building2,
  Search,
  MoreVertical,
  Eye,
  TrendingUp,
  ChevronDown,
  Filter,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { TableSkeleton } from "@/components/ui/table-skeleton";

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
  const { hasPermission } = usePermissions();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actionMenuOpen, setActionMenuOpen] = useState<number | null>(null);
  const debouncedSearch = useDebounce(search, 500);

  const { data: branchesData, isLoading } = useQuery({
    queryKey: ["branches", debouncedSearch, statusFilter],
    queryFn: () =>
      branchesApi.list({
        is_active: statusFilter === "all" ? undefined : statusFilter === "active",
        search: debouncedSearch || undefined,
      }),
  });

  const branches = Array.isArray(branchesData)
    ? branchesData
    : branchesData?.results || [];

  const filteredBranches = branches.filter((branch) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "active") return branch.is_active;
    if (statusFilter === "inactive") return !branch.is_active;
    if (statusFilter === "headquarters") return branch.is_headquarters;
    return true;
  });

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
    if (
      confirm(
        `Are you sure you want to delete branch "${branch.name}"? This will set it as inactive.`
      )
    ) {
      deleteMutation.mutate(branch.id);
    }
  };

  // Statistics
  const totalBranches = branches.length;
  const activeBranches = branches.filter((b) => b.is_active).length;
  const headquarters = branches.filter((b) => b.is_headquarters).length;
  const totalStaff = branches.reduce((sum, b) => sum + (b.staff_count || 0), 0);

  if (isLoading && !branchesData) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <div className="h-9 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2"></div>
            <div className="h-5 w-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <TableSkeleton rows={8} columns={6} />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Branches</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage branch locations and settings
          </p>
        </div>
        <PermissionGuard permission="manage_branches">
          <Button onClick={() => setIsCreateDialogOpen(true)} className="dark:bg-blue-600 dark:hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            New Branch
          </Button>
        </PermissionGuard>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Total Branches
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {totalBranches}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Active Branches
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {activeBranches}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Headquarters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {headquarters}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Total Staff
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {totalStaff}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                type="text"
                placeholder="Search branches..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-600 focus-visible:ring-offset-2"
              >
                <option value="all">All Branches</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
                <option value="headquarters">Headquarters</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Branches Table */}
      <Card>
        <CardContent className="pt-6">
          {filteredBranches.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">
                {branches.length === 0
                  ? "No branches found. Create your first branch to get started."
                  : "No branches match your search criteria."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Staff</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBranches.map((branch) => (
                    <TableRow key={branch.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Building2 className="w-5 h-5 text-gray-400" />
                          <div>
                            <div className="font-medium text-gray-900 dark:text-gray-100">
                              {branch.name}
                            </div>
                            {branch.description && (
                              <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">
                                {branch.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-xs font-mono">
                          {branch.code}
                        </code>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-start space-x-2">
                          <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                          <div className="text-sm">
                            <div className="text-gray-900 dark:text-gray-100">
                              {branch.city}, {branch.state}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {branch.address}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {branch.phone && (
                            <div className="text-gray-900 dark:text-gray-100">{branch.phone}</div>
                          )}
                          {branch.email && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">
                              {branch.email}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-1 text-sm text-gray-600 dark:text-gray-400">
                          <Users className="w-4 h-4" />
                          <span>{branch.staff_count || 0} staff</span>
                          {branch.manager_count && branch.manager_count > 0 && (
                            <>
                              <span className="mx-1">•</span>
                              <span>{branch.manager_count} managers</span>
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {branch.is_headquarters && (
                            <Badge variant="default" className="bg-blue-600">
                              HQ
                            </Badge>
                          )}
                          <Badge variant={branch.is_active ? "default" : "secondary"}>
                            {branch.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="relative">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() =>
                              setActionMenuOpen(
                                actionMenuOpen === branch.id ? null : branch.id
                              )
                            }
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                          {actionMenuOpen === branch.id && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setActionMenuOpen(null)}
                              />
                              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-20">
                                <div className="py-1">
                                  <PermissionGuard permission="view_branches">
                                    <Link
                                      href={`/admin/branches/${branch.id}`}
                                      onClick={() => setActionMenuOpen(null)}
                                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                    >
                                      <Eye className="w-4 h-4" />
                                      View Details
                                    </Link>
                                  </PermissionGuard>
                                  <PermissionGuard permission="manage_branches">
                                    <button
                                      onClick={() => {
                                        setEditingBranch(branch);
                                        setActionMenuOpen(null);
                                      }}
                                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                    >
                                      <Edit className="w-4 h-4" />
                                      Edit Branch
                                    </button>
                                  </PermissionGuard>
                                  <PermissionGuard permission="manage_branches">
                                    <button
                                      onClick={() => {
                                        handleDelete(branch);
                                        setActionMenuOpen(null);
                                      }}
                                      className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                      Delete Branch
                                    </button>
                                  </PermissionGuard>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

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

  // Reset form when branch changes (for editing different branches)
  useEffect(() => {
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
        country: branch.country || "Ghana",
        is_active: branch.is_active ?? true,
        is_headquarters: branch.is_headquarters ?? false,
        opening_time: branch.opening_time || "",
        closing_time: branch.closing_time || "",
        timezone: branch.timezone || "Africa/accra",
      });
    } else {
      // Reset to default values for new branch
      reset({
        country: "Ghana",
        is_active: true,
        is_headquarters: false,
        timezone: "Africa/accra",
      });
    }
  }, [branch, reset]);

  const createMutation = useMutation({
    mutationFn: (data: BranchFormData) => branchesApi.create(data),
    onSuccess: () => {
      toast({ title: "Success", description: "Branch created successfully" });
      onSuccess();
      reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description:
          error.response?.data?.detail ||
          Object.values(error.response?.data || {}).flat().join(", ") ||
          "Failed to create branch",
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
        description:
          error.response?.data?.detail ||
          Object.values(error.response?.data || {}).flat().join(", ") ||
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
    
    // Ensure code is uppercase
    if (cleanedData.code) {
      cleanedData.code = cleanedData.code.toUpperCase().trim();
    }
    
    if (branch) {
      // Don't send code field on update since it's disabled/read-only
      delete cleanedData.code;
      await updateMutation.mutateAsync(cleanedData);
    } else {
      await createMutation.mutateAsync(cleanedData);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{branch ? "Edit Branch" : "Create Branch"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
                disabled={!!branch}
                placeholder="e.g., DTN"
                maxLength={10}
              />
              {errors.code && (
                <p className="text-red-500 text-xs mt-1">{errors.code.message}</p>
              )}
            </div>
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" {...register("description")} rows={2} className="w-full" />
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
          <div className="flex items-center space-x-4">
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
          <DialogFooter>
            <Button type="button"variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {branch ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
