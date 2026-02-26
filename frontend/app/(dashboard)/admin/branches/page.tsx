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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  MoreVertical,
  Eye,
  Filter,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { useDebounce } from "@/lib/hooks/useDebounce";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hasPermission } = usePermissions();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      <div className="space-y-4 p-6">
        <div className="flex justify-between items-center">
          <div>
            <div className="h-6 w-32 bg-border rounded animate-pulse mb-1"></div>
            <div className="h-4 w-48 bg-border rounded animate-pulse"></div>
          </div>
        </div>
        <Card className="border-none shadow-none">
          <CardContent className="p-0">
            <TableSkeleton rows={8} columns={6} />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 bg-background min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4">
        <div>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
            <Link href="/admin" className="hover:text-primary transition-colors">Admin</Link>
            <span>/</span>
            <span className="text-foreground font-medium">Branches</span>
          </div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Branch Management</h1>
        </div>
        <PermissionGuard permission="manage_branches">
          <Button onClick={() => setIsCreateDialogOpen(true)} size="sm" className="h-8 dark:bg-primary dark:hover:bg-primary/90">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New Branch
          </Button>
        </PermissionGuard>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mx-4">
        <Card className="shadow-sm">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total Branches</p>
              <p className="text-xl font-bold text-foreground">
                {totalBranches}
              </p>
            </div>
            <Building2 className="w-5 h-5 text-muted-foreground opacity-80" />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Active</p>
              <p className="text-xl font-bold text-success">
                {activeBranches}
              </p>
            </div>
            <Building2 className="w-5 h-5 text-green-500 opacity-80" />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">HQ</p>
              <p className="text-xl font-bold text-primary">
                {headquarters}
              </p>
            </div>
            <Building2 className="w-5 h-5 text-primary opacity-80" />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total Staff</p>
              <p className="text-xl font-bold text-foreground">
                {totalStaff}
              </p>
            </div>
            <Users className="w-5 h-5 text-purple-500 opacity-80" />
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter Bar */}
      <Card className="mx-4 border-none shadow-sm bg-muted/50">
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
              <Input
                type="text"
                placeholder="Search branches..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm bg-card"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <Select
                value={statusFilter}
                onValueChange={(val) => setStatusFilter(val)}
              >
                <SelectTrigger className="w-[160px] h-8 text-sm bg-card">
                  <SelectValue placeholder="All Branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  <SelectItem value="active">Active Only</SelectItem>
                  <SelectItem value="inactive">Inactive Only</SelectItem>
                  <SelectItem value="headquarters">Headquarters</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Branches Table */}
      <Card className="mx-4 border-t shadow-sm">
        <CardHeader className="py-3 px-4 border-b bg-muted/30">
          <CardTitle className="text-sm font-semibold text-card-foreground">
            Branches Directory <span className="text-muted-foreground font-normal ml-1">({filteredBranches.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filteredBranches.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">
                {branches.length === 0
                  ? "No branches found. Create your first branch to get started."
                  : "No branches match your search criteria."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Name</th>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Code</th>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Location</th>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Contact</th>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Staff</th>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-4 py-2 text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-gray-100">
                  {filteredBranches.map((branch) => (
                    <TableRow key={branch.id} className="hover:bg-muted/80 transition-colors group">
                      <TableCell className="px-4 py-2.5">
                        <div className="flex items-center space-x-2">
                          <Building2 className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <div className="text-sm font-medium text-foreground">
                              {branch.name}
                            </div>
                            {branch.description && (
                              <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                                {branch.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-2.5">
                        <code className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-mono border border-border">
                          {branch.code}
                        </code>
                      </TableCell>
                      <TableCell className="px-4 py-2.5">
                        <div className="flex items-start space-x-1.5">
                          <MapPin className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <div>
                            <div className="text-xs text-foreground">
                              {branch.city}, {branch.state}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                              {branch.address}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-2.5">
                        <div>
                          {branch.phone && (
                            <div className="text-xs text-muted-foreground">{branch.phone}</div>
                          )}
                          {branch.email && (
                            <div className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                              {branch.email}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-2.5">
                        <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                          <Users className="w-3 h-3 text-muted-foreground" />
                          <span>{branch.staff_count || 0}</span>
                          {branch.manager_count && branch.manager_count > 0 && (
                            <span className="text-[10px] text-muted-foreground ml-1">({branch.manager_count} mgrs)</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {branch.is_headquarters && (
                            <Badge variant="default" className="text-[9px] bg-primary h-4 px-1">
                              HQ
                            </Badge>
                          )}
                          {branch.is_active ? (
                            <div className="flex items-center space-x-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-success/100"></span>
                              <span className="text-xs text-green-700 font-medium">Active</span>
                            </div>
                          ) : (
                            <div className="flex items-center space-x-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                              <span className="text-xs text-red-600">Inactive</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end space-x-1 transition-opacity">
                          <PermissionGuard permission="view_branches">
                            <Link
                              href={`/admin/branches/${branch.id}`}
                            >
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary">
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                            </Link>
                          </PermissionGuard>
                          <PermissionGuard permission="manage_branches">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingBranch(branch)}
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-success"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                          </PermissionGuard>
                          <PermissionGuard permission="manage_branches">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(branch)}
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </PermissionGuard>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </table>
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
        country: "Ghana",
        is_active: true,
        is_headquarters: false,
        timezone: "Africa/accra",
      },
  });

  // Reset form when branch changes
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

    const cleanedData: any = { ...data };

    if (cleanedData.description === "") delete cleanedData.description;
    if (cleanedData.email === "") delete cleanedData.email;
    if (cleanedData.fax === "") delete cleanedData.fax;
    if (cleanedData.opening_time === "" || cleanedData.opening_time === null) delete cleanedData.opening_time;
    if (cleanedData.closing_time === "" || cleanedData.closing_time === null) delete cleanedData.closing_time;
    if (cleanedData.timezone === "") cleanedData.timezone = "America/New_York";

    if (cleanedData.code) {
      cleanedData.code = cleanedData.code.toUpperCase().trim();
    }

    if (branch) {
      delete cleanedData.code;
      await updateMutation.mutateAsync(cleanedData);
    } else {
      await createMutation.mutateAsync(cleanedData);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{branch ? "Edit Branch" : "Create Branch"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name" className="text-xs">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input id="name" {...register("name")} className="w-full h-8 text-sm mt-1" />
              {errors.name && (
                <p className="text-red-500 text-[10px] mt-0.5">{errors.name.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="code" className="text-xs">
                Code <span className="text-red-500">*</span>
              </Label>
              <Input
                id="code"
                {...register("code")}
                className="w-full h-8 text-sm font-mono mt-1"
                disabled={!!branch}
                placeholder="e.g., DTN"
                maxLength={10}
              />
              {errors.code && (
                <p className="text-red-500 text-[10px] mt-0.5">{errors.code.message}</p>
              )}
            </div>
          </div>
          <div>
            <Label htmlFor="description" className="text-xs">Description</Label>
            <Textarea id="description" {...register("description")} rows={2} className="w-full text-sm mt-1 bg-muted border-border" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="phone" className="text-xs">
                Phone <span className="text-red-500">*</span>
              </Label>
              <Input id="phone" {...register("phone")} className="w-full h-8 text-sm mt-1" />
              {errors.phone && (
                <p className="text-red-500 text-[10px] mt-0.5">{errors.phone.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="email" className="text-xs">Email</Label>
              <Input id="email" type="email" {...register("email")} className="w-full h-8 text-sm mt-1" />
            </div>
            <div>
              <Label htmlFor="fax" className="text-xs">Fax</Label>
              <Input id="fax" {...register("fax")} className="w-full h-8 text-sm mt-1" />
            </div>
          </div>
          <div>
            <Label htmlFor="address" className="text-xs">
              Address <span className="text-red-500">*</span>
            </Label>
            <Input id="address" {...register("address")} className="w-full h-8 text-sm mt-1" />
            {errors.address && (
              <p className="text-red-500 text-[10px] mt-0.5">{errors.address.message}</p>
            )}
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <Label htmlFor="city" className="text-xs">
                City <span className="text-red-500">*</span>
              </Label>
              <Input id="city" {...register("city")} className="w-full h-8 text-sm mt-1" />
              {errors.city && (
                <p className="text-red-500 text-[10px] mt-0.5">{errors.city.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="state" className="text-xs">
                State <span className="text-red-500">*</span>
              </Label>
              <Input id="state" {...register("state")} className="w-full h-8 text-sm mt-1" />
              {errors.state && (
                <p className="text-red-500 text-[10px] mt-0.5">{errors.state.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="zip_code" className="text-xs">
                Zip Code <span className="text-red-500">*</span>
              </Label>
              <Input id="zip_code" {...register("zip_code")} className="w-full h-8 text-sm mt-1" />
              {errors.zip_code && (
                <p className="text-red-500 text-[10px] mt-0.5">{errors.zip_code.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="country" className="text-xs">Country</Label>
              <Input id="country" {...register("country")} className="w-full h-8 text-sm mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="opening_time" className="text-xs">Opening Time</Label>
              <Input id="opening_time" type="time" {...register("opening_time")} className="w-full h-8 text-sm mt-1" />
            </div>
            <div>
              <Label htmlFor="closing_time" className="text-xs">Closing Time</Label>
              <Input id="closing_time" type="time" {...register("closing_time")} className="w-full h-8 text-sm mt-1" />
            </div>
            <div>
              <Label htmlFor="timezone" className="text-xs">Timezone</Label>
              <Input id="timezone" {...register("timezone")} className="w-full h-8 text-sm mt-1" />
            </div>
          </div>
          <div className="flex items-center space-x-6 pt-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_active"
                onCheckedChange={(checked) => {
                  const event = { target: { name: 'is_active', type: 'checkbox', checked: checked === true } };
                  register("is_active").onChange(event);
                }}
                defaultChecked={branch?.is_active ?? true}
              />
              <Label htmlFor="is_active" className="cursor-pointer text-sm font-medium">
                Active Status
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_headquarters"
                onCheckedChange={(checked) => {
                  const event = { target: { name: 'is_headquarters', type: 'checkbox', checked: checked === true } };
                  register("is_headquarters").onChange(event);
                }}
                defaultChecked={branch?.is_headquarters ?? false}
              />
              <Label htmlFor="is_headquarters" className="cursor-pointer text-sm font-medium">
                Headquarters
              </Label>
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} className="h-8">
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting} className="h-8">
              {branch ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
