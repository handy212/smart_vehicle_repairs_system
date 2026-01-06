"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { subscriptionsApi, packagesApi, Subscription, Package } from "@/lib/api/subscriptions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Package as PackageIcon, Calendar, Check, X, RefreshCw, ShoppingCart, CreditCard } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/lib/hooks/useToast";
import { authApi } from "@/lib/api/auth";

export default function MySubscriptionsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isPurchaseDialogOpen, setIsPurchaseDialogOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
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

  const purchaseMutation = useMutation({
    mutationFn: (pkg: Package) => {
      const customerId = user?.customer_profile?.id || (user as any)?.customer?.id;
      if (!customerId) {
        throw new Error("Customer ID not found");
      }
      return subscriptionsApi.create({
        customer: customerId,
        package: pkg.id,
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
        description: error.response?.data?.detail || "Failed to purchase subscription",
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
        description: error.response?.data?.detail || "Failed to renew subscription",
        variant: "destructive",
      });
    },
  });

  const handlePurchase = (pkg: Package) => {
    setSelectedPackage(pkg);
    setIsPurchaseDialogOpen(true);
  };

  const confirmPurchase = () => {
    if (selectedPackage) {
      purchaseMutation.mutate(selectedPackage);
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
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {Object.entries(subscription.remaining_allowances).map(([key, value]) => {
                            const numValue = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
                            const isLow = numValue <= 1 && numValue > 0;
                            const isEmpty = numValue === 0;
                            return (
                              <div 
                                key={key} 
                                className={`p-2 rounded border ${
                                  isEmpty 
                                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' 
                                    : isLow 
                                    ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                                    : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                                }`}
                              >
                                <div className="flex justify-between items-center">
                                  <span className="text-xs text-muted-foreground capitalize">
                                    {key.replace(/_/g, " ")}
                                  </span>
                                  <span className={`text-sm font-bold ${
                                    isEmpty ? 'text-red-600 dark:text-red-400' 
                                    : isLow ? 'text-yellow-600 dark:text-yellow-400'
                                    : 'text-green-600 dark:text-green-400'
                                  }`}>
                                    {value}
                                  </span>
                                </div>
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
                      <Badge variant="outline">{pkg.code}</Badge>
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
      <Dialog open={isPurchaseDialogOpen} onOpenChange={setIsPurchaseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Purchase Subscription</DialogTitle>
          </DialogHeader>
          {selectedPackage && (
            <div className="space-y-4">
              <div>
                <p className="font-semibold">{selectedPackage.name}</p>
                <p className="text-sm text-muted-foreground">{selectedPackage.description}</p>
              </div>
              <div className="border-t pt-4">
                <div className="flex justify-between mb-2">
                  <span>Price:</span>
                  <span className="font-bold">${parseFloat(selectedPackage.price).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Duration:</span>
                  <span>{selectedPackage.duration_months} months</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                After purchase, you will be able to use the subscription benefits. Payment will be processed separately.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsPurchaseDialogOpen(false);
                setSelectedPackage(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmPurchase}
              disabled={purchaseMutation.isPending}
            >
              {purchaseMutation.isPending ? "Processing..." : "Confirm Purchase"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

