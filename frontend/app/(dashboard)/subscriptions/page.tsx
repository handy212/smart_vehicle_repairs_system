"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { subscriptionsApi, packagesApi, Subscription, Package } from "@/lib/api/subscriptions";
import { customersApi, Customer } from "@/lib/api/customers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Search,
  RefreshCw,
  X,
  Eye,
  Calendar,
  User,
  Package as PackageIcon,
  Settings,
  Plus,
  Download,
  Trash2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DataTable } from "@/components/shared/DataTable";
import { useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import Link from "next/link";
import { Select } from "@/components/ui/select";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useCurrency } from "@/lib/hooks/useCurrency";
const subscriptionCreateSchema = z.object({
  customer: z.number().min(1, "Customer is required"),
  vehicle: z.number().min(1, "Vehicle is required"),
  package: z.number().min(1, "Package is required"),
  start_date: z.string().optional(),
  auto_renew: z.boolean().optional(),
});

type SubscriptionCreateFormData = z.infer<typeof subscriptionCreateSchema>;

const formatError = (error: any, defaultMessage: string) => {
  console.error("Subscription Error:", error);
  const data = error.response?.data;
  if (!data) return defaultMessage;

  if (typeof data === 'string') return data;

  if (data.detail) return data.detail;
  if (data.message) return data.message;

  // DRF field errors
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const messages = Object.entries(data)
      .map(([key, value]) => {
        const message = Array.isArray(value) ? value[0] : value;
        return `${key}: ${message}`;
      })
      .join('\n');
    return messages || defaultMessage;
  }

  if (Array.isArray(data)) {
    return data[0] || defaultMessage;
  }

  return defaultMessage;
};

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
  const [packageFilter, setPackageFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isChangePlanDialogOpen, setIsChangePlanDialogOpen] = useState(false);
  const [newPackageId, setNewPackageId] = useState<number | null>(null);
  const debouncedSearch = useDebounce(search, 500);

  // Fetch packages and customers for the create form
  const { data: packagesData } = useQuery({
    queryKey: ["packages", "available"],
    queryFn: () => packagesApi.getAvailable(),
  });

  const { data: customersData } = useQuery({
    queryKey: ["customers", "for-subscription"],
    queryFn: () => customersApi.list({}),
  });

  const packages = Array.isArray(packagesData) ? packagesData : [];
  const customers = customersData?.results || [];

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setValue,
    watch,
  } = useForm<SubscriptionCreateFormData>({
    resolver: zodResolver(subscriptionCreateSchema),
    defaultValues: {
      auto_renew: false,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: SubscriptionCreateFormData) =>
      subscriptionsApi.create({
        customer: data.customer,
        vehicle: data.vehicle,
        package: data.package,
        start_date: data.start_date,
        auto_renew: data.auto_renew,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      toast({
        title: "Success",
        description: `Subscription created successfully. Invoice #${data.invoice_id || "N/A"} is pending payment.`,
      });
      setIsCreateDialogOpen(false);
      reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: formatError(error, "Failed to create subscription"),
        variant: "destructive",
      });
    },
  });

  const selectedCustomerId = watch("customer");
  const { data: customerVehicles, isLoading: isLoadingVehicles } = useQuery({
    queryKey: ["customers", selectedCustomerId, "vehicles"],
    queryFn: () => customersApi.vehicles(selectedCustomerId),
    enabled: !!selectedCustomerId,
  });

  const { data: usageHistory, isLoading: isLoadingUsage } = useQuery({
    queryKey: ["subscriptions", selectedSubscription?.id, "usage"],
    queryFn: () => subscriptionsApi.usage(selectedSubscription!.id),
    enabled: !!selectedSubscription && isDetailsDialogOpen,
  });

  const selectedPackageId = watch("package");
  const selectedPackage = packages.find((p: any) => p.id === selectedPackageId);

  const onSubmitCreate = (data: SubscriptionCreateFormData) => {
    createMutation.mutate(data);
  };

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
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to cancel subscription",
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
    onError: (error: any) => {
      toast({
        title: "Error",
        description: formatError(error, "Failed to delete subscription"),
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
    onError: (error: any) => {
      toast({
        title: "Error",
        description: formatError(error, "Failed to change plan"),
        variant: "destructive",
      });
    },
  });

  const renewMutation = useMutation({
    mutationFn: ({ id, months }: { id: number; months?: number }) =>
      subscriptionsApi.renew(id, months),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      toast({ title: "Success", description: "Subscription renewed successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: formatError(error, "Failed to renew subscription"),
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
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to load subscription details",
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
          <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
            {subscription.customer_name || `Customer #${subscription.customer}`}
          </span>
          {subscription.vehicle && (
            <span className="text-xs text-gray-500">Vehicle ID: {subscription.vehicle}</span>
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
          <span className="text-gray-900 dark:text-gray-100">
            {format(new Date(subscription.start_date), "MMM dd, yyyy")} - {format(new Date(subscription.end_date), "MMM dd, yyyy")}
          </span>
          {subscription.days_remaining !== undefined && (
            <span className={cn(
              "mt-0.5",
              subscription.days_remaining < 30 ? "text-red-600 font-medium" : "text-gray-500"
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
                <RefreshCw className="h-4 w-4 text-blue-600" />
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
                <Settings className="h-4 w-4 text-gray-600" />
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
                <X className="h-4 w-4 text-red-500" />
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
              <Trash2 className="h-4 w-4 text-red-600" />
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
            <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">Subscriptions</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
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
          <Card className="border-gray-100 dark:border-gray-800 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Total Subscriptions</p>
                  <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">{totalSubscriptions}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/20 flex items-center justify-center">
                  <PackageIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-gray-100 dark:border-gray-800 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Active</p>
                  <p className="text-2xl font-black text-green-600 dark:text-green-400 mt-1">{activeSubscriptions}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-green-50 dark:bg-green-950/20 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-gray-100 dark:border-gray-800 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Expired</p>
                  <p className="text-2xl font-black text-red-600 dark:text-red-400 mt-1">{expiredSubscriptions}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-950/20 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Card with Toolbar and DataTable */}
        <Card className="border-gray-100 dark:border-gray-800 shadow-sm">
          <CardContent className="p-4 space-y-4">
            {/* Toolbar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
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
                  className="h-9 px-3 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="h-9 px-3 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 focus:outline-none focus:ring-2 focus:ring-blue-500"
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

        {/* Details Dialog */}
        <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl">
                Subscription Details
                {selectedSubscription && (
                  <Badge variant={selectedSubscription.status === "active" ? "success" : "secondary"} className="ml-2">
                    {selectedSubscription.status}
                  </Badge>
                )}
              </DialogTitle>
            </DialogHeader>
            {selectedSubscription && (
              <div className="space-y-8">
                {/* Top Section: Overview */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Left Column */}
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">Subscription</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between border-b pb-2 border-dashed">
                          <span className="text-sm text-gray-600 dark:text-gray-400">Subscription #</span>
                          <span className="text-sm font-mono font-medium">{selectedSubscription.subscription_number}</span>
                        </div>
                        <div className="flex justify-between border-b pb-2 border-dashed">
                          <span className="text-sm text-gray-600 dark:text-gray-400">Package</span>
                          <span className="text-sm font-semibold">{selectedSubscription.package_name}</span>
                        </div>
                        <div className="flex justify-between border-b pb-2 border-dashed">
                          <span className="text-sm text-gray-600 dark:text-gray-400">Period</span>
                          <span className="text-sm font-medium">
                            {format(new Date(selectedSubscription.start_date), "MMM dd, yyyy")} - {format(new Date(selectedSubscription.end_date), "MMM dd, yyyy")}
                          </span>
                        </div>
                        <div className="flex justify-between border-b pb-2 border-dashed">
                          <span className="text-sm text-gray-600 dark:text-gray-400">Days Remaining</span>
                          <span className={cn("text-sm font-bold", (selectedSubscription.days_remaining || 0) < 30 ? "text-red-600" : "text-green-600")}>
                            {selectedSubscription.days_remaining} days
                          </span>
                        </div>
                        <div className="flex justify-between items-center pt-1">
                          <span className="text-sm text-gray-600 dark:text-gray-400">Auto Renew</span>
                          <Badge variant={selectedSubscription.auto_renew ? "default" : "outline"}>
                            {selectedSubscription.auto_renew ? "Enabled" : "Disabled"}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">Customer</h3>
                      <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg space-y-2">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-gray-400" />
                          <span className="text-sm font-medium">{selectedSubscription.customer_full_name || selectedSubscription.customer_name}</span>
                        </div>
                        {selectedSubscription.vehicle && (
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span>Vehicle ID: {selectedSubscription.vehicle}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">Payment & Financials</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between border-b pb-2 border-dashed">
                          <span className="text-sm text-gray-600 dark:text-gray-400">Price</span>
                          <span className="text-sm font-medium">{formatCurrency(parseFloat(selectedSubscription.original_price || selectedSubscription.purchase_price))}</span>
                        </div>
                        <div className="flex justify-between border-b pb-2 border-dashed">
                          <span className="text-sm text-gray-600 dark:text-gray-400">Total Paid</span>
                          <div className="flex flex-col items-end">
                            <span className="text-sm font-bold">{formatCurrency(parseFloat(selectedSubscription.purchase_price))}</span>
                            {selectedSubscription.discount_applied > 0 && (
                              <span className="text-[10px] text-green-600">
                                -{selectedSubscription.discount_applied}% ({selectedSubscription.discount_reason})
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-between items-center pt-1">
                          <span className="text-sm text-gray-600 dark:text-gray-400">Payment Status</span>
                          <Badge variant={selectedSubscription.payment_status === "paid" ? "success" : "warning"} className="capitalize">
                            {selectedSubscription.payment_status}
                          </Badge>
                        </div>

                        {/* AA Policy */}
                        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md border border-blue-100 dark:border-blue-900">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-medium text-blue-700 dark:text-blue-400">Activation Date (AA Policy)</span>
                            <span className="text-xs font-bold text-blue-800 dark:text-blue-300">
                              {selectedSubscription.activation_date
                                ? format(new Date(selectedSubscription.activation_date), "MMM dd, yyyy")
                                : "Pending"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Refund Eligibility */}
                    {selectedSubscription.status === 'active' && (
                      <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-md border border-amber-200 dark:border-amber-800">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-2">Refund Eligibility</p>
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-amber-900 dark:text-amber-100">
                            {selectedSubscription.is_refund_eligible ? "Eligible for Refund" : "Not Eligible"}
                          </span>
                          {selectedSubscription.is_refund_eligible && (
                            <span className="text-sm font-bold text-amber-900 dark:text-amber-100">
                              Est: {formatCurrency(parseFloat(selectedSubscription.calculated_refund_amount || "0"))}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {selectedSubscription.remaining_allowances && Object.keys(selectedSubscription.remaining_allowances).length > 0 && (
                  <div className="space-y-3 pt-4 border-t">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">Remaining Allowances</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {Object.entries(selectedSubscription.remaining_allowances).map(([key, value]) => {
                        const labelMap: Record<string, string> = {
                          roadside_first_aid: "Mech First Aid",
                          towing_services_km: "Towing (km)",
                          emergency_fuel: "Fuel",
                          key_lock_out: "Lock Out",
                          extrication: "Extrication",
                          accident_estimate: "Accident Est.",
                          pre_purchase_inspection: "Pre-Purchase",
                          battery_boosts: "Boosts",
                          flat_tyre_service: "Flat Tyre",
                          total_service_calls: "Service Calls",
                        };
                        return (
                          <div key={key} className="p-2 bg-gray-50 dark:bg-gray-800 rounded border border-gray-100 dark:border-gray-700 flex flex-col items-center text-center">
                            <span className="text-lg font-black text-gray-900 dark:text-white">{value}</span>
                            <span className="text-[10px] uppercase text-gray-500 font-medium mt-1">{labelMap[key] || key.replace(/_/g, " ")}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Usage History Section */}
                <div className="space-y-3 pt-4 border-t">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Usage History</h3>
                  {isLoadingUsage ? (
                    <div className="text-sm text-gray-500 py-4 text-center">Loading usage history...</div>
                  ) : usageHistory && usageHistory.length > 0 ? (
                    <div className="rounded-md border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50/50">
                            <TableHead className="h-9">Date</TableHead>
                            <TableHead className="h-9">Type</TableHead>
                            <TableHead className="h-9">Amount</TableHead>
                            <TableHead className="h-9">Ref</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {usageHistory.map((usage: any) => (
                            <TableRow key={usage.id} className="h-9">
                              <TableCell className="py-2 text-xs">{format(new Date(usage.service_date), "MMM dd, yyyy")}</TableCell>
                              <TableCell className="py-2 text-xs font-medium capitalize">{usage.usage_type?.replace(/_/g, " ")}</TableCell>
                              <TableCell className="py-2 text-xs">{usage.quantity_used}</TableCell>
                              <TableCell className="py-2 text-xs text-muted-foreground">{usage.reference_type || "-"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="p-8 text-center bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-dashed">
                      <p className="text-sm text-gray-500">No usage history recorded.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
            <DialogFooter className="flex justify-between items-center sm:justify-between sm:gap-0 gap-2 mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  if (selectedSubscription) {
                    subscriptionsApi.downloadCard(selectedSubscription.id, selectedSubscription.subscription_number);
                  }
                }}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Download Membership Card
              </Button>
              <Button onClick={() => setIsDetailsDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>


        {/* Cancel Dialog */}
        <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Cancel Subscription</DialogTitle>
            </DialogHeader>
            <div className="px-6 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
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

        {/* Create Subscription Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Subscription</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmitCreate)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customer">Customer *</Label>
                <Select
                  id="customer"
                  onChange={(e) => setValue("customer", parseInt(e.target.value))}
                  defaultValue=""
                >
                  <option value="">Select a customer</option>
                  {customers.map((customer: Customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.full_name || customer.customer_number} - {customer.email}
                    </option>
                  ))}
                </Select>
                {errors.customer && (
                  <p className="text-sm text-red-500">{errors.customer.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="package">Package *</Label>
                <Select
                  id="package"
                  onChange={(e) => setValue("package", parseInt(e.target.value))}
                  defaultValue=""
                >
                  <option value="">Select a package</option>
                  {packages.map((pkg: Package) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.name} - {formatCurrency(parseFloat(pkg.price))} ({pkg.duration_months} months)
                    </option>
                  ))}
                </Select>
                {errors.package && (
                  <p className="text-sm text-red-500">{errors.package.message}</p>
                )}
              </div>

              {selectedPackage && (
                <div className="bg-muted/50 p-3 rounded-md text-sm space-y-1 border">
                  <div className="font-medium">{selectedPackage.name} Summary</div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mt-1">
                    <div>Duration: {selectedPackage.duration_months} months</div>
                    <div>Price: {formatCurrency(parseFloat(selectedPackage.price))}</div>
                    <div>Calls: {selectedPackage.features?.total_service_calls || 0}</div>
                    <div>Towing: {selectedPackage.features?.towing_services_km || 0} km</div>
                    <div>Mechanic: {selectedPackage.features?.roadside_first_aid || 0}</div>
                    <div>Fuel: {selectedPackage.features?.emergency_fuel || 0}</div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="vehicle">Vehicle *</Label>
                <Select
                  id="vehicle"
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setValue("vehicle", isNaN(val) ? 0 : val);
                  }}
                  defaultValue=""
                  disabled={!selectedCustomerId || isLoadingVehicles}
                >
                  <option value="">{selectedCustomerId ? "Select a vehicle" : "Select a customer first"}</option>
                  {customerVehicles?.map((v: any) => {
                    const vehicleType = v.vehicle_type || '';
                    const isAllowed = ['saloon', 'suv', 'pickup', 'minivan'].includes(vehicleType.toLowerCase());
                    return (
                      <option key={v.id} value={v.id} disabled={!isAllowed}>
                        {v.year} {v.make} {v.model} ({v.license_plate}) - {vehicleType ? vehicleType.toUpperCase() : 'UNKNOWN'} {!isAllowed ? "(NOT COVERED)" : ""}
                      </option>
                    );
                  })}
                </Select>
                {errors.vehicle && (
                  <p className="text-sm text-red-500">{errors.vehicle.message}</p>
                )}
                {selectedCustomerId && customerVehicles && customerVehicles.length === 0 && !isLoadingVehicles && (
                  <p className="text-sm text-amber-600">No vehicles found for this customer.</p>
                )}
                {selectedCustomerId && customerVehicles && customerVehicles.length > 0 && customerVehicles.every((v: any) => !['saloon', 'suv', 'pickup', 'minivan'].includes((v.vehicle_type || '').toLowerCase())) && (
                  <p className="text-sm text-red-500">None of this customer's vehicles are eligible for AA membership (Saloon, SUV, Pick-Up, Mini van only).</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="start_date">Start Date (Optional)</Label>
                <Input
                  id="start_date"
                  type="date"
                  {...register("start_date")}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to start today
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="auto_renew"
                  {...register("auto_renew")}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="auto_renew" className="cursor-pointer">
                  Auto-renew subscription
                </Label>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setIsCreateDialogOpen(false);
                    reset();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting || createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create Subscription"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Change Plan Dialog */}
        <Dialog open={isChangePlanDialogOpen} onOpenChange={setIsChangePlanDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Change Subscription Plan</DialogTitle>
            </DialogHeader>
            <div className="px-6 space-y-4 py-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Select a new package for subscription <span className="font-mono font-semibold">{selectedSubscription?.subscription_number}</span>.
                This will update the package and reset allowances.
              </p>
              <div className="space-y-2">
                <Label htmlFor="new_package">New Package</Label>
                <Select
                  id="new_package"
                  value={newPackageId?.toString()}
                  onChange={(e) => setNewPackageId(parseInt(e.target.value))}
                >
                  <option value="">Select a new package</option>
                  {packages.map((pkg: Package) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.name} - {formatCurrency(parseFloat(pkg.price))}
                    </option>
                  ))}
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
              <DialogTitle className="text-red-600">Delete Subscription</DialogTitle>
            </DialogHeader>
            <div className="px-6 py-4 space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Are you sure you want to <strong>permanently delete</strong> subscription{" "}
                <span className="font-mono font-semibold">{selectedSubscription?.subscription_number}</span>?
              </p>
              <p className="text-xs text-red-500 font-medium">
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

