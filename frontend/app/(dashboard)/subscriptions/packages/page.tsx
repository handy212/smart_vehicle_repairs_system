"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { packagesApi, subscriptionsApi, Package, Subscription } from "@/lib/api/subscriptions";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Edit,
  Trash2,
  Package as PackageIcon,
  Search,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  DollarSign,
  Calendar,
  CreditCard,
  CheckCircle2,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  AlertCircle,
  Archive
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { DataTable } from "@/components/shared/DataTable";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Switch } from "@/components/ui/switch";
import Link from "next/link";
import { cn } from "@/lib/utils";

import { useCurrency } from "@/lib/hooks/useCurrency";
import { getUserFacingError } from "@/lib/api/errors";
import { RevenueProductSelect } from "@/components/accounting/RevenueProductSelect";

const packageSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().min(1, "Code is required").max(50),
  description: z.string().optional(),
  price: z.string().min(1, "Price is required"),
  duration_months: z.number().min(1, "Duration must be at least 1 month"),
  is_active: z.boolean().optional(),
  revenue_product: z.number().optional().nullable(),
  features: z.object({
    roadside_first_aid: z.number().min(0).optional(),
    towing_services_km: z.number().min(0).optional(),
    emergency_fuel: z.number().min(0).optional(),
    key_lock_out: z.number().min(0).optional(),
    extrication: z.number().min(0).optional(),
    accident_estimate: z.number().min(0).optional(),
    pre_purchase_inspection: z.number().min(0).optional(),
    battery_boosts: z.number().min(0).optional(),
    flat_tyre_service: z.number().min(0).optional(),
    total_service_calls: z.number().min(0).optional(),
  }).optional(),
});

type PackageFormData = z.infer<typeof packageSchema>;

export default function PackagesPage() {
  const { formatCurrency } = useCurrency();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<Package | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [packageToDelete, setPackageToDelete] = useState<Package | null>(null);
  const [packageRevenueProduct, setPackageRevenueProduct] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const debouncedSearch = useDebounce(search, 500);

  const { data: packagesData, isLoading } = useQuery({
    queryKey: ["packages", debouncedSearch, statusFilter],
    queryFn: () =>
      packagesApi.list({
        is_active: statusFilter === "all" ? undefined : statusFilter === "active",
        search: debouncedSearch || undefined,
      }),
  });

  // Fetch subscription counts for each package
  const { data: subscriptionsData } = useQuery({
    queryKey: ["subscriptions"],
    queryFn: () => subscriptionsApi.list(),
  });

  const subscriptions = Array.isArray(subscriptionsData)
    ? subscriptionsData
    : subscriptionsData?.results || [];

  const packages = Array.isArray(packagesData)
    ? packagesData
    : packagesData?.results || [];

  const filteredPackages = packages.filter((pkg) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "active") return pkg.is_active;
    if (statusFilter === "inactive") return !pkg.is_active;
    return true;
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => packagesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packages"] });
      toast({ title: "Success", description: "Package deleted successfully" });
      setIsDeleteDialogOpen(false);
      setPackageToDelete(null);
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to delete package"),
        variant: "destructive",
      });
    },
  });

  const handleDelete = (pkg: Package) => {
    setPackageToDelete(pkg);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (packageToDelete) {
      deleteMutation.mutate(packageToDelete.id);
    }
  };

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setValue,
    watch,
  } = useForm<PackageFormData>({
    resolver: zodResolver(packageSchema),
    defaultValues: {
      is_active: true,
      features: {
        roadside_first_aid: 0,
        towing_services_km: 0,
        emergency_fuel: 0,
        key_lock_out: 0,
        extrication: 0,
        accident_estimate: 0,
        pre_purchase_inspection: 0,
        battery_boosts: 0,
        flat_tyre_service: 0,
        total_service_calls: 0,
      },
    },
  });

  const watchedFeatures = watch("features") || {};

  const createMutation = useMutation({
    mutationFn: (data: PackageFormData) => packagesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packages"] });
      toast({ title: "Success", description: "Package created successfully" });
      setIsCreateDialogOpen(false);
      reset();
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to create package"),
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Package> }) =>
      packagesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packages"] });
      toast({ title: "Success", description: "Package updated successfully" });
      setIsCreateDialogOpen(false);
      setEditingPackage(null);
      reset();
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to update package"),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: PackageFormData) => {
    const payload = { ...data, revenue_product: packageRevenueProduct };
    if (editingPackage) {
      updateMutation.mutate({ id: editingPackage.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEdit = (pkg: Package) => {
    setEditingPackage(pkg);
    setPackageRevenueProduct(pkg.revenue_product ?? null);
    reset({
      name: pkg.name,
      code: pkg.code,
      description: pkg.description || "",
      price: pkg.price,
      duration_months: pkg.duration_months,
      is_active: pkg.is_active,
      features: pkg.features || {},
    });
    setIsCreateDialogOpen(true);
  };

  const handleNew = () => {
    setEditingPackage(null);
    setPackageRevenueProduct(null);
    reset({
      name: "",
      code: "",
      description: "",
      price: "0.00",
      duration_months: 12,
      is_active: true,
      features: {
        roadside_first_aid: 0,
        towing_services_km: 0,
        emergency_fuel: 0,
        key_lock_out: 0,
        extrication: 0,
        accident_estimate: 0,
        pre_purchase_inspection: 0,
        battery_boosts: 0,
        flat_tyre_service: 0,
        total_service_calls: 0,
      },
    });
    setIsCreateDialogOpen(true);
  };

  const columns = [
    {
      header: "Name",
      accessor: "name" as const,
      cell: (pkg: Package) => (
        <div className="flex flex-col">
          <span className="font-medium text-sm text-foreground">{pkg.name}</span>
          <span className="text-xs text-muted-foreground">{pkg.description}</span>
        </div>
      )
    },
    {
      header: "Code",
      accessor: "code" as const,
      cell: (pkg: Package) => (
        <Badge variant="secondary" className="font-mono">{pkg.code}</Badge>
      )
    },
    {
      header: "Price",
      accessor: "price" as const,
      cell: (pkg: Package) => (
        <span className="font-mono font-medium text-foreground">{formatCurrency(parseFloat(pkg.price))}</span>
      )
    },
    {
      header: "Duration",
      accessor: "duration_months" as const,
      cell: (pkg: Package) => (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Calendar className="w-3.5 h-3.5" />
          <span>{pkg.duration_months} months</span>
        </div>
      )
    },
    {
      header: "Features",
      accessor: "features" as const,
      cell: (pkg: Package) => (
        <div className="flex flex-wrap gap-1 max-w-xs">
          {pkg.features.total_service_calls && (
            <Badge variant="outline" className="text-[10px] bg-muted bg-background">Calls: {pkg.features.total_service_calls}</Badge>
          )}
          {pkg.features.towing_services_km && (
            <Badge variant="outline" className="text-[10px] bg-muted bg-background">Tow: {pkg.features.towing_services_km}km</Badge>
          )}
          {pkg.features.emergency_fuel && (
            <Badge variant="outline" className="text-[10px] bg-muted bg-background">Fuel: {pkg.features.emergency_fuel}</Badge>
          )}
        {/* // Show +N more if many features? For now let's just show key ones or trunc */}
        </div>
      )
    },
    {
      header: "Active Subs",
      accessor: "id" as const,
      cell: (pkg: Package) => {

        const count = subscriptions.filter((s: Subscription) => s.package === pkg.id && s.status === "active").length;
        return (
          <div className="flex items-center gap-1.5">
            <span className={cn("text-sm font-bold", count > 0 ? "text-primary" : "text-muted-foreground")}>{count}</span>
            <span className="text-xs text-muted-foreground">active</span>
          </div>
        )
      }
    },
    {
      header: "Status",
      accessor: "is_active" as const,
      cell: (pkg: Package) => (
        <Badge variant={pkg.is_active ? "success" : "secondary"}>
          {pkg.is_active ? "Active" : "Inactive"}
        </Badge>
      )
    },
    {
      header: "Actions",
      accessor: "id" as const,
      cell: (pkg: Package) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleEdit(pkg)}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDelete(pkg)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      )
    }
  ];

  if (isLoading && !packagesData) {
    return (
      <div className="p-8">
        <TableSkeleton rows={5} columns={6} />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1800px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">Subscription Packages</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage subscription packages and their features
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/subscriptions">
              <Button variant="outline" size="sm" className="h-9">
                <CreditCard className="mr-2 h-4 w-4" />
                View Subscriptions
              </Button>
            </Link>
            <PermissionGuard permission="manage_subscriptions">
              <Button size="sm" className="h-9" onClick={handleNew}>
                <Plus className="mr-2 h-4 w-4" />
                New Package
              </Button>
            </PermissionGuard>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-border shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total Packages</p>
                  <p className="text-2xl font-black text-foreground mt-1">{packages.length}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-primary/10 dark:bg-orange-950/20 flex items-center justify-center">
                  <PackageIcon className="w-5 h-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Active</p>
                  <p className="text-2xl font-black text-success mt-1">{packages.filter((p) => p.is_active).length}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-success/10 dark:bg-green-950/20 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Inactive</p>
                  <p className="text-2xl font-black text-muted-foreground mt-1">{packages.filter((p) => !p.is_active).length}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-border flex items-center justify-center">
                  <Archive className="w-5 h-5 text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Search */}
        <Card className="border-border shadow-sm">
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search packages..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-9 px-3 text-xs font-medium rounded-lg border border-border bg-card bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <DataTable
              data={filteredPackages}
              columns={columns}
              isLoading={isLoading}
              emptyMessage="No packages found matching your criteria."
            />
          </CardContent>
        </Card>

        {/* Create/Edit Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingPackage ? "Edit Package" : "Create New Package"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="px-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    {...register("name")}
                    placeholder="e.g., Lite Package"
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive">{errors.name.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">Code *</Label>
                  <Input
                    id="code"
                    {...register("code")}
                    onChange={(e) => {
                      e.target.value = e.target.value.toUpperCase();
                      register("code").onChange(e);
                    }}
                    placeholder="e.g., LITE"
                  />
                  {errors.code && (
                    <p className="text-sm text-destructive">{errors.code.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  {...register("description")}
                  placeholder="Package description..."
                  className="min-h-[80px]"
                />
              </div>

              <div className="space-y-2">
                <Label>Revenue product (owner account)</Label>
                <RevenueProductSelect
                  value={packageRevenueProduct}
                  onChange={setPackageRevenueProduct}
                  revenueClass="subscription"
                  className="w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price">Price *</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    {...register("price")}
                    placeholder="0.00"
                  />
                  {errors.price && (
                    <p className="text-sm text-destructive">{errors.price.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="duration_months">Duration (months) *</Label>
                  <Input
                    id="duration_months"
                    type="number"
                    {...register("duration_months", { valueAsNumber: true })}
                    placeholder="12"
                  />
                  {errors.duration_months && (
                    <p className="text-sm text-destructive">{errors.duration_months.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-4 border-t pt-4">
                <h3 className="font-semibold text-base">Package Features</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="total_service_calls">Total Service Calls</Label>
                    <Input
                      id="total_service_calls"
                      type="number"
                      value={String(watchedFeatures?.total_service_calls || 0)}
                      onChange={(e) =>
                        setValue("features", { ...watchedFeatures, total_service_calls: parseInt(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="towing_services_km">Towing Limit (km)</Label>
                    <Input
                      id="towing_services_km"
                      type="number"
                      value={String(watchedFeatures?.towing_services_km || 0)}
                      onChange={(e) =>
                        setValue("features", { ...watchedFeatures, towing_services_km: parseInt(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="roadside_first_aid">Roadside First Aid (Mech/Elec)</Label>
                    <Input
                      id="roadside_first_aid"
                      type="number"
                      value={String(watchedFeatures?.roadside_first_aid || 0)}
                      onChange={(e) =>
                        setValue("features", { ...watchedFeatures, roadside_first_aid: parseInt(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emergency_fuel">Emergency Fuel</Label>
                    <Input
                      id="emergency_fuel"
                      type="number"
                      value={String(watchedFeatures?.emergency_fuel || 0)}
                      onChange={(e) =>
                        setValue("features", { ...watchedFeatures, emergency_fuel: parseInt(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="key_lock_out">Key Lock Out</Label>
                    <Input
                      id="key_lock_out"
                      type="number"
                      value={String(watchedFeatures?.key_lock_out || 0)}
                      onChange={(e) =>
                        setValue("features", { ...watchedFeatures, key_lock_out: parseInt(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="extrication">Extrication</Label>
                    <Input
                      id="extrication"
                      type="number"
                      value={String(watchedFeatures?.extrication || 0)}
                      onChange={(e) =>
                        setValue("features", { ...watchedFeatures, extrication: parseInt(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="accident_estimate">Accident Estimate</Label>
                    <Input
                      id="accident_estimate"
                      type="number"
                      value={String(watchedFeatures?.accident_estimate || 0)}
                      onChange={(e) =>
                        setValue("features", { ...watchedFeatures, accident_estimate: parseInt(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pre_purchase_inspection">Pre-Purchase Inspection</Label>
                    <Input
                      id="pre_purchase_inspection"
                      type="number"
                      value={String(watchedFeatures?.pre_purchase_inspection || 0)}
                      onChange={(e) =>
                        setValue("features", { ...watchedFeatures, pre_purchase_inspection: parseInt(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="battery_boosts">Battery Boosts</Label>
                    <Input
                      id="battery_boosts"
                      type="number"
                      value={String(watchedFeatures?.battery_boosts || 0)}
                      onChange={(e) =>
                        setValue("features", { ...watchedFeatures, battery_boosts: parseInt(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="flat_tyre_service">Flat Tyre Service</Label>
                    <Input
                      id="flat_tyre_service"
                      type="number"
                      value={String(watchedFeatures?.flat_tyre_service || 0)}
                      onChange={(e) =>
                        setValue("features", { ...watchedFeatures, flat_tyre_service: parseInt(e.target.value) || 0 })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 border-t pt-4">
                <Switch
                  checked={watch("is_active") || false}
                  onCheckedChange={(checked) => setValue("is_active", checked)}
                />
                <Label htmlFor="is_active" className="cursor-pointer">Active</Label>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setIsCreateDialogOpen(false);
                    reset();
                    setEditingPackage(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {editingPackage ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        {/* Delete Confirmation Dialog */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Delete Package</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to delete package{" "}
                <span className="font-semibold">{packageToDelete?.name}</span>?
                This action cannot be undone.
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="secondary"
                onClick={() => setIsDeleteDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete Package"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
