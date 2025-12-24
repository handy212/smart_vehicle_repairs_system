"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { subscriptionsApi, packagesApi, Subscription, Package } from "@/lib/api/subscriptions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Package as PackageIcon, Calendar, Check, X, RefreshCw, ShoppingCart, CreditCard, Download, Car } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/lib/hooks/useToast";
import { authApi } from "@/lib/api/auth";
import { vehiclesApi, Vehicle } from "@/lib/api/vehicles";

const formatError = (error: any, defaultMessage: string) => {
  const data = error.response?.data;
  if (!data) return defaultMessage;

  if (typeof data === 'string') return data;

  // DRF detail error
  if (data.detail) return data.detail;
  if (data.message) return data.message;

  // DRF field-specific validation errors
  if (typeof data === 'object') {
    const messages = Object.entries(data)
      .map(([key, value]) => {
        const fieldName = key === 'non_field_errors' ? '' : `${key}: `;
        const message = Array.isArray(value) ? value[0] : value;
        return `${fieldName}${message}`;
      })
      .join('\n');
    return messages || defaultMessage;
  }

  return defaultMessage;
};

export default function MySubscriptionsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isPurchaseDialogOpen, setIsPurchaseDialogOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [viewMode, setViewMode] = useState<"my-subscriptions" | "available-packages">("my-subscriptions");

  const { data: user } = useQuery({
    queryKey: ["user"],
    queryFn: () => authApi.getCurrentUser(),
  });

  const { data: mySubscriptions, isLoading: isLoadingSubscriptions } = useQuery({
    queryKey: ["my-subscriptions"],
    queryFn: () => subscriptionsApi.getMySubscriptions(),
    enabled: !!user,
  });

  const { data: availablePackages, isLoading: isLoadingPackages } = useQuery({
    queryKey: ["available-packages"],
    queryFn: () => packagesApi.getAvailable(),
    enabled: viewMode === "available-packages",
  });

  const { data: userVehicles } = useQuery({
    queryKey: ["my-vehicles"],
    queryFn: () => {
      const customerId = user?.customer_profile?.id || (user as any)?.customer?.id;
      if (!customerId) return Promise.resolve({ count: 0, next: null, previous: null, results: [] });
      return vehiclesApi.list({ owner: customerId });
    },
    enabled: !!user,
  });

  const purchaseMutation = useMutation({
    mutationFn: (pkg: Package) => {
      const customerId = user?.customer_profile?.id || (user as any)?.customer?.id;
      if (!customerId) {
        throw new Error("Customer ID not found");
      }
      return subscriptionsApi.create({
        customer: customerId,
        package: pkg.id,
        vehicle: parseInt(selectedVehicleId),
        payment_status: "pending",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-subscriptions"] });
      toast({ title: "Success", description: "Subscription purchased successfully" });
      setIsPurchaseDialogOpen(false);
      setSelectedPackage(null);
      setViewMode("my-subscriptions");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: formatError(error, "Failed to purchase subscription"),
        variant: "destructive",
      });
    },
  });

  const renewMutation = useMutation({
    mutationFn: (subscription: Subscription) => subscriptionsApi.renew(subscription.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-subscriptions"] });
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

  const handlePurchase = (pkg: Package) => {
    setSelectedPackage(pkg);
    setSelectedVehicleId(""); // Reset vehicle selection
    setIsPurchaseDialogOpen(true);
  };

  const confirmPurchase = () => {
    if (selectedPackage && selectedVehicleId) {
      purchaseMutation.mutate(selectedPackage);
    } else if (!selectedVehicleId) {
      toast({
        title: "Vehicle Required",
        description: "Please select a vehicle for this subscription.",
        variant: "destructive",
      });
    }
  };

  const handleRenew = (subscription: Subscription) => {
    if (subscription.status === "expired" || subscription.status === "cancelled") {
      toast({
        title: "Cannot Renew",
        description: "This subscription cannot be renewed. Please purchase a new subscription.",
        variant: "destructive",
      });
      return;
    }

    if (subscription.days_remaining && subscription.days_remaining > 30) {
      toast({
        title: "Too Early",
        description: "You can only renew subscriptions within 30 days of expiration.",
        variant: "destructive",
      });
      return;
    }

    if (confirm(`Renew subscription ${subscription.subscription_number}? An invoice will be created for payment.`)) {
      renewMutation.mutate(subscription);
    }
  };

  if (isLoadingSubscriptions && viewMode === "my-subscriptions") {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-6 w-48 mb-4" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">My Subscriptions</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage your subscription packages
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={viewMode === "my-subscriptions" ? "default" : "outline"}
            onClick={() => setViewMode("my-subscriptions")}
          >
            My Subscriptions
          </Button>
          <Button
            variant={viewMode === "available-packages" ? "default" : "outline"}
            onClick={() => setViewMode("available-packages")}
          >
            <ShoppingCart className="mr-2 h-4 w-4" />
            Browse Packages
          </Button>
        </div>
      </div>

      {viewMode === "my-subscriptions" ? (
        <>
          {/* My Subscriptions */}
          {!mySubscriptions || mySubscriptions.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <PackageIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Active Subscriptions</h3>
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  You don't have any active subscriptions yet.
                </p>
                <Button onClick={() => setViewMode("available-packages")}>
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  Browse Available Packages
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {mySubscriptions.map((subscription) => (
                <Card key={subscription.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <PackageIcon className="h-5 w-5" />
                          {subscription.package_name}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          {subscription.subscription_number}
                        </p>
                      </div>
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
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Start Date</p>
                        <p className="font-medium">
                          {format(new Date(subscription.start_date), "MMM dd, yyyy")}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">End Date</p>
                        <p className="font-medium">
                          {format(new Date(subscription.end_date), "MMM dd, yyyy")}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Days Remaining</p>
                        <p className="font-medium">
                          {subscription.days_remaining || 0} days
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Payment Status</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant={
                              subscription.payment_status === "paid" ? "default" : "secondary"
                            }
                          >
                            {subscription.payment_status}
                          </Badge>
                          {subscription.payment_status === "pending" && (
                            <Link
                              href={subscription.invoice_id
                                ? `/portal/payment/${subscription.invoice_id}`
                                : `/portal/subscriptions`
                              }
                              onClick={async (e) => {
                                if (!subscription.invoice_id) {
                                  e.preventDefault();
                                  // Fetch full subscription details to get invoice_id
                                  try {
                                    const fullSub = await subscriptionsApi.get(subscription.id);
                                    if (fullSub.invoice_id) {
                                      window.location.href = `/portal/payment/${fullSub.invoice_id}`;
                                    } else {
                                      toast({
                                        title: "Payment Unavailable",
                                        description: "Invoice is being processed. Please try again in a moment.",
                                        variant: "destructive",
                                      });
                                    }
                                  } catch (error: any) {
                                    toast({
                                      title: "Error",
                                      description: error.response?.data?.detail || "Failed to load payment details",
                                      variant: "destructive",
                                    });
                                  }
                                }
                              }}
                            >
                              <Button variant="default" size="sm" className="h-7 text-xs">
                                <CreditCard className="h-3 w-3 mr-1" />
                                Pay Now
                              </Button>
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>

                    {subscription.remaining_allowances && Object.keys(subscription.remaining_allowances).length > 0 && (
                      <div className="border-t pt-4">
                        <p className="text-sm font-semibold mb-3">Remaining Allowances</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {Object.entries(subscription.remaining_allowances).map(([key, value]) => {
                            const numValue = typeof value === 'number' ? value : parseFloat(String(value)) || 0;

                            // Determine max value based on key (heuristics or metadata if available)
                            // Ideally, backend should provide {used, total} but we have {remaining}
                            // We can try to map back to package features but it's tricky without a direct link to the package definition in this context easily
                            // For now, we visualize the remaining amount. 
                            // If we knew the total, we could show a proper progress bar.
                            // Let's assume some defaults for common keys if we want a "full" bar, 
                            // or just use the progress bar to show relative health (e.g. green/yellow/red) logic

                            // Actually, let's just show the number prominently with a visual indicator of "health"
                            const isLow = numValue <= 1 && numValue > 0;
                            const isEmpty = numValue === 0;

                            // Simplified progress visual: 
                            // If we don't know total, we can't do a percentage. 
                            // But we can check if the package features are available in the subscription object?
                            // The subscription object has `package_name`, but not full features.
                            // So we will stick to a nice card layout instead of a percentage bar for now, 
                            // OR we can make a "infinite" or "static" bar that changes color.

                            // Let's improve the card design first.

                            return (
                              <div
                                key={key}
                                className="flex flex-col gap-1"
                              >
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-xs text-muted-foreground capitalize">
                                    {key.replace(/_/g, " ")}
                                  </span>
                                  <span className={`text-sm font-bold ${isEmpty ? 'text-destructive' :
                                    isLow ? 'text-yellow-600' : 'text-primary'
                                    }`}>
                                    {value} remaining
                                  </span>
                                </div>
                                <Progress
                                  value={isEmpty ? 0 : isLow ? 20 : 100}
                                  className={`h-2 ${isEmpty ? 'bg-destructive/20' : ''}`}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {subscription.status === "active" && (
                      <div className="flex gap-2 mt-4">
                        {subscription.days_remaining !== undefined && subscription.days_remaining <= 30 && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleRenew(subscription)}
                            disabled={renewMutation.isPending || subscription.days_remaining > 30}
                          >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            {renewMutation.isPending ? "Renewing..." : "Renew Now"}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => subscriptionsApi.downloadCard(subscription.id, subscription.subscription_number)}
                          className="h-8 gap-1"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download Card
                        </Button>
                      </div>
                    )}
                    {subscription.status === "expired" && (
                      <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-800">
                        <p className="text-sm text-yellow-800 dark:text-yellow-200">
                          This subscription has expired. Purchase a new subscription to continue using services.
                        </p>
                      </div>
                    )}
                    {subscription.status === "cancelled" && (
                      <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
                        <p className="text-sm text-red-800 dark:text-red-200">
                          This subscription has been cancelled.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Available Packages */}
          {isLoadingPackages ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <Skeleton className="h-6 w-48 mb-4" />
                    <Skeleton className="h-4 w-full mb-2" />
                    <Skeleton className="h-4 w-3/4" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : !availablePackages || availablePackages.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <PackageIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Packages Available</h3>
                <p className="text-gray-500 dark:text-gray-400">
                  There are no subscription packages available at this time.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {availablePackages.map((pkg) => (
                <Card key={pkg.id} className="flex flex-col">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{pkg.name}</span>
                      <Badge variant="info">{pkg.code}</Badge>
                    </CardTitle>
                    <div className="mt-2">
                      <span className="text-3xl font-bold">${parseFloat(pkg.price).toFixed(2)}</span>
                      <span className="text-muted-foreground"> / {pkg.duration_months} months</span>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1">
                    {pkg.description && (
                      <p className="text-sm text-muted-foreground mb-4">{pkg.description}</p>
                    )}
                    <div className="space-y-2 mb-4">
                      {pkg.features.kilometers && (
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-500" />
                          <span>{pkg.features.kilometers} Kilometers</span>
                        </div>
                      )}
                      {pkg.features.call_out_charges && (
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-500" />
                          <span>{pkg.features.call_out_charges} Call Out Charges</span>
                        </div>
                      )}
                      {pkg.features.towing_services && (
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-500" />
                          <span>{pkg.features.towing_services} Towing Services</span>
                        </div>
                      )}
                      {pkg.features.free_inspections && (
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-500" />
                          <span>{pkg.features.free_inspections} Free Inspections</span>
                        </div>
                      )}
                      {pkg.features.roadside_assistance && (
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-500" />
                          <span>Roadside Assistance</span>
                        </div>
                      )}
                      {pkg.features.discount_percentage && (
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-500" />
                          <span>{pkg.features.discount_percentage}% Discount</span>
                        </div>
                      )}
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => handlePurchase(pkg)}
                    >
                      <ShoppingCart className="mr-2 h-4 w-4" />
                      Purchase Package
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Purchase Dialog */}
      {/* Purchase Dialog */}
      <Dialog open={isPurchaseDialogOpen} onOpenChange={setIsPurchaseDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader className="pb-4 border-b">
            <DialogTitle className="text-xl flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              Complete Your Purchase
            </DialogTitle>
            <DialogDescription>
              Review your package selection and assign a vehicle.
            </DialogDescription>
          </DialogHeader>

          {selectedPackage && (
            <div className="py-6 space-y-6">
              {/* Package Summary Card */}
              <div className="bg-primary/5 dark:bg-primary/10 border border-primary/10 rounded-lg p-4 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-lg text-primary">{selectedPackage.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {selectedPackage.description}
                    </p>
                  </div>
                  <Badge variant="secondary" className="bg-background text-primary border border-primary/20">
                    {selectedPackage.code}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Price</span>
                    <span className="text-2xl font-bold flex items-baseline gap-1">
                      ${parseFloat(selectedPackage.price).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Duration</span>
                    <div className="flex items-center gap-2 mt-1">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{selectedPackage.duration_months} Months</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Vehicle Selection */}
              <div className="space-y-3">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Car className="h-4 w-4 text-primary" />
                  Assign Vehicle
                </label>
                <div className="relative">
                  <Select
                    value={selectedVehicleId}
                    onChange={(e) => setSelectedVehicleId(e.target.value)}
                    className="pl-2"
                  >
                    <option value="" disabled>Select a vehicle from your garage</option>
                    {userVehicles?.results?.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id.toString()}>
                        {vehicle.year} {vehicle.make} {vehicle.model} — {vehicle.license_plate}
                      </option>
                    ))}
                  </Select>
                </div>
                {!userVehicles?.results?.length ? (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                    <X className="h-3 w-3" />
                    No vehicles found. Please add a vehicle first.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    This subscription will be linked to the selected vehicle.
                  </p>
                )}
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200 p-3 rounded text-xs leading-relaxed">
                <strong>Note:</strong> Payment will be processed in the next step via our secure invoice system. Your subscription will activate immediately upon confirmation.
              </div>
            </div>
          )}

          <DialogFooter className="pt-2 border-t mt-0">
            <Button
              variant="outline"
              onClick={() => {
                setIsPurchaseDialogOpen(false);
                setSelectedPackage(null);
                setSelectedVehicleId("");
              }}
              className="mt-2 sm:mt-0"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmPurchase}
              disabled={purchaseMutation.isPending || !selectedVehicleId}
              className="w-full sm:w-auto min-w-[120px]"
            >
              {purchaseMutation.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-3 w-3 animate-spin" />
                  Processing
                </>
              ) : (
                <>
                  Confirm Purchase
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

