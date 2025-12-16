"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { subscriptionsApi, Subscription } from "@/lib/api/subscriptions";
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

export default function SubscriptionsPage() {
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
  const debouncedSearch = useDebounce(search, 500);

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
        description: error.response?.data?.detail || "Failed to renew subscription",
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
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          )}
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
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Days Remaining</Label>
                  <p className="text-sm font-semibold">{selectedSubscription.days_remaining || 0} days</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Purchase Price</Label>
                  <p className="text-sm font-semibold">${parseFloat(selectedSubscription.purchase_price).toFixed(2)}</p>
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
              </div>

              {selectedSubscription.remaining_allowances && Object.keys(selectedSubscription.remaining_allowances).length > 0 && (
                <div className="border-t pt-4 space-y-3">
                  <Label className="text-sm font-semibold">Remaining Allowances</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(selectedSubscription.remaining_allowances).map(([key, value]) => (
                      <div key={key} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800 rounded">
                        <span className="text-sm capitalize text-gray-600 dark:text-gray-400">{key.replace(/_/g, " ")}</span>
                        <span className="text-sm font-semibold">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
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
    </div>
  );
}

