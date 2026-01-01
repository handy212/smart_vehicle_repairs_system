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
} from "lucide-react";
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

  if (isLoading && !subscriptionsData) {
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
            <TableSkeleton rows={8} columns={7} />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Subscriptions</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage customer subscriptions
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/subscriptions/packages">
            <Button variant="secondary">
              <Settings className="mr-2 h-4 w-4" />
              Manage Packages
            </Button>
          </Link>
          <PermissionGuard permission="manage_subscriptions">
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Subscription
            </Button>
          </PermissionGuard>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Subscriptions</CardTitle>
            <PackageIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSubscriptions}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <PackageIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeSubscriptions}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expired</CardTitle>
            <PackageIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{expiredSubscriptions}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle>Subscriptions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search subscriptions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border rounded-md bg-white dark:bg-gray-800"
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
              className="px-3 py-2 border rounded-md bg-white dark:bg-gray-800"
            >
              <option value="all">All Payments</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subscription #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Package</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSubscriptions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No subscriptions found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSubscriptions.map((subscription) => (
                    <TableRow key={subscription.id}>
                      <TableCell className="font-medium">
                        {subscription.subscription_number}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span>{subscription.customer_name || `Customer #${subscription.customer}`}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{subscription.package_name}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(subscription.start_date), "MMM dd, yyyy")}
                          </div>
                          <div className="text-muted-foreground">
                            to {format(new Date(subscription.end_date), "MMM dd, yyyy")}
                          </div>
                          {subscription.days_remaining !== undefined && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {subscription.days_remaining} days remaining
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            subscription.status === "active"
                              ? "default"
                              : subscription.status === "expired"
                                ? "danger"
                                : "secondary"
                          }
                        >
                          {subscription.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            subscription.payment_status === "paid"
                              ? "default"
                              : subscription.payment_status === "pending"
                                ? "secondary"
                                : "danger"
                          }
                        >
                          {subscription.payment_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewDetails(subscription)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {subscription.status === "active" && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRenew(subscription)}
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedSubscription(subscription);
                                  setIsCancelDialogOpen(true);
                                }}
                              >
                                <X className="h-4 w-4 text-red-500" />
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
                                <Settings className="h-4 w-4 text-blue-500" />
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
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Subscription Details</DialogTitle>
          </DialogHeader>
          {selectedSubscription && (
            <div className="px-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Subscription Number</Label>
                  <p className="font-mono text-sm">{selectedSubscription.subscription_number}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</Label>
                  <div>
                    <Badge variant={selectedSubscription.status === "active" ? "default" : "secondary"}>
                      {selectedSubscription.status}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Customer</Label>
                  <p className="text-sm">{selectedSubscription.customer_full_name || selectedSubscription.customer_name}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Package</Label>
                  <p className="text-sm">{selectedSubscription.package_name}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Start Date</Label>
                  <p className="text-sm">{format(new Date(selectedSubscription.start_date), "MMM dd, yyyy")}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">End Date</Label>
                  <p className="text-sm">{format(new Date(selectedSubscription.end_date), "MMM dd, yyyy")}</p>
                </div>

                {/* AA Compliance Fields */}
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Activation Date (AA Policy)</Label>
                  <p className="text-sm font-semibold text-blue-600">
                    {selectedSubscription.activation_date
                      ? format(new Date(selectedSubscription.activation_date), "MMM dd, yyyy")
                      : "Pending Payment / Processing"}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Days Remaining</Label>
                  <p className="text-sm font-semibold">{selectedSubscription.days_remaining || 0} days</p>
                </div>

                <div className="space-y-1 border-t pt-2">
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Original Price</Label>
                  <p className="text-sm">{formatCurrency(parseFloat(selectedSubscription.original_price || selectedSubscription.purchase_price))}</p>
                </div>
                <div className="space-y-1 border-t pt-2">
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Paid Amount</Label>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{formatCurrency(parseFloat(selectedSubscription.purchase_price))}</p>
                    {selectedSubscription.discount_applied > 0 && (
                      <Badge variant="success" className="text-[10px] py-0">
                        {selectedSubscription.discount_applied}% {selectedSubscription.discount_reason}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Payment Status</Label>
                  <div>
                    <Badge variant={selectedSubscription.payment_status === "paid" ? "default" : "secondary"}>
                      {selectedSubscription.payment_status}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Auto Renew</Label>
                  <p className="text-sm">{selectedSubscription.auto_renew ? "Yes" : "No"}</p>
                </div>

                {/* Refund Visibility */}
                {selectedSubscription.status === 'active' && (
                  <div className="col-span-2 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-md border border-amber-200 dark:border-amber-800">
                    <p className="text-xs font-semibold uppercase text-amber-700 dark:text-amber-400 mb-1">Administrative: Refund Eligibility</p>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">{selectedSubscription.is_refund_eligible ? "✅ Within 30-day window" : "❌ Past 30-day window"}</span>
                      {selectedSubscription.is_refund_eligible && (
                        <span className="text-sm font-bold">Estimated: {formatCurrency(parseFloat(selectedSubscription.calculated_refund_amount || "0"))}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Usage History Section */}
              <div className="border-t pt-4 space-y-3">
                <Label className="text-sm font-semibold">Usage History</Label>
                {isLoadingUsage ? (
                  <div className="text-sm text-gray-500">Loading usage history...</div>
                ) : usageHistory && usageHistory.length > 0 ? (
                  <div className="rounded-md border max-h-40 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-8">Date</TableHead>
                          <TableHead className="h-8">Type</TableHead>
                          <TableHead className="h-8">Amount</TableHead>
                          <TableHead className="h-8">Ref</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {usageHistory.map((usage: any) => (
                          <TableRow key={usage.id} className="h-8">
                            <TableCell className="py-1">{format(new Date(usage.service_date), "MMM dd")}</TableCell>
                            <TableCell className="py-1 capitalize">{usage.usage_type?.replace(/_/g, " ")}</TableCell>
                            <TableCell className="py-1">{usage.quantity_used}</TableCell>
                            <TableCell className="py-1 text-xs text-muted-foreground">{usage.reference_type || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 italic">No usage history recorded.</p>
                )}
              </div>

              {selectedSubscription.remaining_allowances && Object.keys(selectedSubscription.remaining_allowances).length > 0 && (
                <div className="border-t pt-4 space-y-3">
                  <Label className="text-sm font-semibold">Remaining Allowances</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(selectedSubscription.remaining_allowances).map(([key, value]) => {
                      const labelMap: Record<string, string> = {
                        roadside_first_aid: "Mech/Elec First Aid",
                        towing_services_km: "Towing Limit (km)",
                        emergency_fuel: "Emergency Fuel",
                        key_lock_out: "Key Lock Out",
                        extrication: "Extrication",
                        accident_estimate: "Accident Estimate",
                        pre_purchase_inspection: "Pre-Purchase Insp.",
                        battery_boosts: "Battery Boosts",
                        flat_tyre_service: "Flat Tyre Service",
                        total_service_calls: "Total Service Calls",
                      };
                      return (
                        <div key={key} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800 rounded">
                          <span className="text-sm text-gray-600 dark:text-gray-400">{labelMap[key] || key.replace(/_/g, " ")}</span>
                          <span className="text-sm font-semibold">{value}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex justify-between items-center sm:justify-between">
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
  );
}

