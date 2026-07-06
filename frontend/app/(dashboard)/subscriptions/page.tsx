
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { subscriptionsApi, packagesApi, Subscription, Package } from "@/lib/api/subscriptions";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { customersApi, Customer } from "@/lib/api/customers";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Search,
  RefreshCw,
  X,
  Eye,
  Settings,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Package as PackageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DataTable } from "@/components/shared/DataTable";
import { useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import Link from "next/link";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { getUserFacingError } from "@/lib/api/errors";

import { CreateSubscriptionDialog } from "./components/CreateSubscriptionDialog";
import { SubscriptionDetailsDialog } from "./components/SubscriptionDetailsDialog";


export default function SubscriptionsPage() {
  const { formatCurrency } = useCurrency();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [packageFilter, setPackageFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isChangePlanDialogOpen, setIsChangePlanDialogOpen] = useState(false);
  const [newPackageId, setNewPackageId] = useState<number | null>(null);
  const debouncedSearch = useDebounce(search, 500);

  // Fetch packages for filter and change plan
  const { data: packagesData } = useQuery({
    queryKey: ["packages", "available"],
    queryFn: () => packagesApi.getAvailable(),
  });
  const packages = Array.isArray(packagesData) ? packagesData : [];

  const { data: subscriptionsData, isLoading } = useQuery({
    queryKey: ["subscriptions", debouncedSearch, statusFilter, packageFilter, paymentFilter],
    queryFn: () =>
      subscriptionsApi.list({
        status: statusFilter === "all" ? undefined : statusFilter,
        search: debouncedSearch || undefined,
      }),
  });

  const subscriptions = Array.isArray(subscriptionsData)
    ? subscriptionsData
    : subscriptionsData?.results || [];

  const filteredSubscriptions = subscriptions.filter((sub) => {
    if (statusFilter !== "all" && sub.status !== statusFilter) return false;
    if (packageFilter !== "all" && sub.package !== parseInt(packageFilter)) return false;
    if (paymentFilter !== "all" && sub.payment_status !== paymentFilter) return false;
    return true;
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      subscriptionsApi.cancel(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      toast({ title: "Success", description: "Subscription cancelled successfully" });
      setIsCancelDialogOpen(false);
      setCancelReason("");
      setSelectedSubscription(null);
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to cancel subscription"),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => subscriptionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      toast({ title: "Success", description: "Subscription deleted successfully" });
      setIsDeleteDialogOpen(false);
      setSelectedSubscription(null);
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to delete subscription"),
        variant: "destructive",
      });
    },
  });

  const changePlanMutation = useMutation({
    mutationFn: ({ id, packageId }: { id: number; packageId: number }) =>
      subscriptionsApi.changePlan(id, packageId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      toast({ title: "Success", description: data.message || "Plan changed successfully" });
      setIsChangePlanDialogOpen(false);
      setSelectedSubscription(null);
      setNewPackageId(null);
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to change plan"),
        variant: "destructive",
      });
    },
  });

  const renewMutation = useMutation({
    mutationFn: ({ id, months }: { id: number; months?: number }) =>
      subscriptionsApi.renew(id, months),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      toast({
        title: "Renewal Invoice Created",
        description: data.message || `Invoice ${data.invoice_number || data.invoice_id || ""} is pending payment before the new period starts.`,
      });
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to renew subscription"),
        variant: "destructive",
      });
    },
  });

  const handleCancel = () => {
    if (selectedSubscription) {
      cancelMutation.mutate({
        id: selectedSubscription.id,
        reason: cancelReason,
      });
    }
  };

  const handleRenew = (subscription: Subscription) => {
    if (confirm(`Renew subscription ${subscription.subscription_number}?`)) {
      renewMutation.mutate({ id: subscription.id });
    }
  };

  const handleDelete = () => {
    if (selectedSubscription) {
      deleteMutation.mutate(selectedSubscription.id);
    }
  };

  const handleChangePlan = () => {
    if (selectedSubscription && newPackageId) {
      changePlanMutation.mutate({
        id: selectedSubscription.id,
        packageId: newPackageId,
      });
    }
  };

  const handleViewDetails = async (subscription: Subscription) => {
    try {
      const fullSubscription = await subscriptionsApi.get(subscription.id);
      setSelectedSubscription(fullSubscription);
      setIsDetailsDialogOpen(true);

    } catch (error: unknown) {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to load subscription details"),
        variant: "destructive",
      });
    }
  };

  // Statistics
  const totalSubscriptions = subscriptions.length;
  const activeSubscriptions = subscriptions.filter((s) => s.status === "active").length;
  const expiredSubscriptions = subscriptions.filter((s) => s.status === "expired").length;

  // Define columns for DataTable
  const columns = [
    {
      header: "Subscription #",
      accessor: "subscription_number" as const,
      cell: (subscription: Subscription) => (
        <span className="font-medium font-mono text-xs">{subscription.subscription_number}</span>
      ),
    },
    {
      header: "Customer",
      accessor: "customer_name" as const,
      cell: (subscription: Subscription) => (
        <div className="flex flex-col">
          <span className="font-medium text-sm text-foreground">
            {subscription.customer_name || `Customer #${subscription.customer}`}
          </span>
          {subscription.vehicle && (
            <span className="text-xs text-muted-foreground">
              {subscription.vehicle_license_plate || subscription.vehicle_display || `Vehicle #${subscription.vehicle}`}
            </span>
          )}
        </div>
      ),
    },
    {
      header: "Package",
      accessor: "package_name" as const,
      cell: (subscription: Subscription) => (
        <Badge variant="secondary" className="font-normal">
          {subscription.package_name}
        </Badge>
      ),
    },
    {
      header: "Period",
      accessor: "start_date" as const,
      cell: (subscription: Subscription) => (
        <div className="flex flex-col text-xs">
          <span className="text-foreground">
            {format(new Date(subscription.start_date), "MMM dd, yyyy")} - {format(new Date(subscription.end_date), "MMM dd, yyyy")}
          </span>
          {subscription.days_remaining !== undefined && (
            <span className={cn(
              "mt-0.5",
              subscription.days_remaining < 30 ? "text-destructive font-medium" : "text-muted-foreground"
            )}>
              {subscription.days_remaining} days left
            </span>
          )}
        </div>
      ),
    },
    {
      header: "Status",
      accessor: "status" as const,
      cell: (subscription: Subscription) => {
        const variant =
          subscription.status === "active" ? "success" :
            subscription.status === "expired" ? "danger" :
              subscription.status === "cancelled" ? "secondary" : "default";
        return (
          <Badge variant={variant} className="capitalize">
            {subscription.status}
          </Badge>
        );
      },
    },
    {
      header: "Payment",
      accessor: "payment_status" as const,
      cell: (subscription: Subscription) => {
        const variant =
          subscription.payment_status === "paid" ? "success" :
            subscription.payment_status === "pending" ? "warning" : "danger";
        return (
          <Badge variant={variant} className="capitalize">
            {subscription.payment_status}
          </Badge>
        );
      },
    },
    {
      header: "Actions",
      accessor: "id" as const,
      cell: (subscription: Subscription) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleViewDetails(subscription)}
            title="View Details"
          >
            <Eye className="h-4 w-4" />
          </Button>
          {subscription.status === "active" && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRenew(subscription)}
                title="Renew"
              >
                <RefreshCw className="h-4 w-4 text-primary" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                title="Change Plan"
                onClick={() => {
                  setSelectedSubscription(subscription);
                  setNewPackageId(subscription.package);
                  setIsChangePlanDialogOpen(true);
                }}
              >
                <Settings className="h-4 w-4 text-muted-foreground" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedSubscription(subscription);
                  setIsCancelDialogOpen(true);
                }}
                title="Cancel"
              >
                <X className="h-4 w-4 text-destructive" />
              </Button>
            </>
          )}
          <PermissionGuard permission="manage_subscriptions">
            <Button
              variant="ghost"
              size="sm"
              title="Delete Subscription"
              onClick={() => {
                setSelectedSubscription(subscription);
                setIsDeleteDialogOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </PermissionGuard>
        </div>
      )
    }
  ];

  if (isLoading && !subscriptionsData) {
    return <div className="p-8"><TableSkeleton rows={5} columns={6} /></div>;
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1800px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">Subscriptions</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage customer subscriptions and packages
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/subscriptions/packages">
              <Button variant="outline" size="sm" className="h-9">
                <Settings className="mr-2 h-4 w-4" />
                Manage Packages
              </Button>
            </Link>
            <PermissionGuard permission="manage_subscriptions">
              <Button size="sm" className="h-9" onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New Subscription
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
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total Subscriptions</p>
                  <p className="text-2xl font-black text-foreground mt-1">{totalSubscriptions}</p>
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
                  <p className="text-2xl font-black text-success mt-1">{activeSubscriptions}</p>
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
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Expired</p>
                  <p className="text-2xl font-black text-destructive dark:text-red-400 mt-1">{expiredSubscriptions}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-destructive/10 dark:bg-red-950/20 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-destructive dark:text-red-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Card with Toolbar and DataTable */}
        <Card className="border-border shadow-sm">
          <CardContent className="p-4 space-y-4">
            {/* Toolbar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search subscriptions..."
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
                  <option value="expired">Expired</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="suspended">Suspended</option>
                  <option value="pending">Pending</option>
                </select>
                <select
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value)}
                  className="h-9 px-3 text-xs font-medium rounded-lg border border-border bg-card bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="all">All Payments</option>
                  <option value="paid">Paid</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
            </div>

            <DataTable
              data={filteredSubscriptions}
              columns={columns}
              isLoading={isLoading}
              emptyMessage="No subscriptions found matching your filters."
            />
          </CardContent>
        </Card>

        {/* New Components */}
        <SubscriptionDetailsDialog
          subscription={selectedSubscription}
          open={isDetailsDialogOpen}
          onOpenChange={setIsDetailsDialogOpen}
        />

        <CreateSubscriptionDialog
          open={isCreateDialogOpen}
          onOpenChange={setIsCreateDialogOpen}
        />

        {/* Cancel Dialog */}
        <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Cancel Subscription</DialogTitle>
            </DialogHeader>
            <div className="px-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to cancel subscription{" "}
                <span className="font-mono font-semibold">{selectedSubscription?.subscription_number}</span>?
              </p>
              <div className="space-y-2">
                <Label htmlFor="cancel_reason" className="text-sm font-medium">Cancellation Reason (Optional)</Label>
                <Textarea
                  id="cancel_reason"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Enter reason for cancellation..."
                  className="min-h-[100px]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="secondary"
                onClick={() => {
                  setIsCancelDialogOpen(false);
                  setCancelReason("");
                  setSelectedSubscription(null);
                }}
              >
                No, Keep Subscription
              </Button>
              <Button
                variant="destructive"
                onClick={handleCancel}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? "Cancelling..." : "Yes, Cancel Subscription"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Change Plan Dialog */}
        <Dialog open={isChangePlanDialogOpen} onOpenChange={setIsChangePlanDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Change Subscription Plan</DialogTitle>
            </DialogHeader>
            <div className="px-6 space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                Select a new package for subscription <span className="font-mono font-semibold">{selectedSubscription?.subscription_number}</span>.
                This will update the package and reset allowances.
              </p>
              <div className="space-y-2">
                <Label htmlFor="new_package">New Package</Label>
                <Select
                  value={newPackageId?.toString()}
                  onValueChange={(val) => setNewPackageId(parseInt(val))}
                >
                  <SelectTrigger id="new_package">
                    <SelectValue placeholder="Select a new package" />
                  </SelectTrigger>
                  <SelectContent>
                    {packages.map((pkg: Package) => (
                      <SelectItem key={pkg.id} value={pkg.id.toString()}>
                        {pkg.name} - {formatCurrency(parseFloat(pkg.price))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="secondary"
                onClick={() => {
                  setIsChangePlanDialogOpen(false);
                  setNewPackageId(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleChangePlan}
                disabled={changePlanMutation.isPending || !newPackageId || newPackageId === selectedSubscription?.package}
              >
                {changePlanMutation.isPending ? "Updating..." : "Change Plan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-destructive">Delete Subscription</DialogTitle>
            </DialogHeader>
            <div className="px-6 py-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to <strong>permanently delete</strong> subscription{" "}
                <span className="font-mono font-semibold">{selectedSubscription?.subscription_number}</span>?
              </p>
              <p className="text-xs text-destructive font-medium">
                This action cannot be undone. All usage history and allowances for this subscription will be lost.
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="secondary"
                onClick={() => {
                  setIsDeleteDialogOpen(false);
                  setSelectedSubscription(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Deleting..." : "Permanently Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
