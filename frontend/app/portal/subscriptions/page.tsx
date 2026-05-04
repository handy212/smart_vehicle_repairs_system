"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { subscriptionsApi, packagesApi, Subscription, Package } from "@/lib/api/subscriptions";
import { portalApi } from "@/lib/api/portal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Package as PackageIcon, Check, RefreshCw, ShoppingCart, CreditCard, Car } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/lib/hooks/useToast";
import { authApi } from "@/lib/api/auth";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { PortalPageHeader } from "../components/PortalPageHeader";
import { cn } from "@/lib/utils/cn";
import { getApiErrorMessage } from "@/lib/api/errors";

export default function MySubscriptionsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { formatCurrency } = useCurrency();
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

  const { data: vehiclesRaw } = useQuery({
    queryKey: ["portal", "vehicles-subscriptions"],
    queryFn: portalApi.getVehicles,
    enabled: !!user,
  });
  const vehicles = Array.isArray(vehiclesRaw) ? vehiclesRaw : (vehiclesRaw as any)?.results ?? [];

  const purchaseMutation = useMutation({
    mutationFn: (pkg: Package) => {
      if (!selectedVehicleId) throw new Error("Please select a vehicle");
      return subscriptionsApi.create({
        package: pkg.id,
        vehicle: parseInt(selectedVehicleId),
        payment_status: "pending",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-subscriptions"] });
      toast({ title: "Invoice Created", description: "Please pay the invoice before membership benefits become usable." });
      setIsPurchaseDialogOpen(false);
      setSelectedPackage(null);
      setSelectedVehicleId("");
      setViewMode("my-subscriptions");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: getApiErrorMessage(error, "Failed to purchase subscription"), variant: "destructive" });
    },
  });

  const renewMutation = useMutation({
    mutationFn: (subscription: Subscription) => subscriptionsApi.renew(subscription.id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["my-subscriptions"] });
      toast({
        title: "Renewal Invoice Created",
        description: data.message || `Invoice ${data.invoice_number || data.invoice_id || ""} is pending payment.`,
      });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: getApiErrorMessage(error, "Failed to renew subscription"), variant: "destructive" });
    },
  });

  const handlePurchase = (pkg: Package) => {
    setSelectedPackage(pkg);
    setSelectedVehicleId("");
    setIsPurchaseDialogOpen(true);
  };

  const confirmPurchase = () => {
    if (selectedPackage) purchaseMutation.mutate(selectedPackage);
  };

  const handleRenew = (subscription: Subscription) => {
    if (subscription.status === "expired" || subscription.status === "cancelled") {
      toast({ title: "Cannot Renew", description: "Please purchase a new subscription instead.", variant: "destructive" });
      return;
    }
    if (subscription.days_remaining && subscription.days_remaining > 30) {
      toast({ title: "Too Early", description: "You can only renew within 30 days of expiration.", variant: "destructive" });
      return;
    }
    if (confirm(`Renew subscription ${subscription.subscription_number}? An invoice will be created for payment.`)) {
      renewMutation.mutate(subscription);
    }
  };

  if (isLoadingSubscriptions && viewMode === "my-subscriptions") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        {[1, 2].map((i) => (
          <Card key={i}><CardContent className="p-4"><Skeleton className="h-5 w-48 mb-3" /><Skeleton className="h-4 w-full mb-2" /><Skeleton className="h-4 w-3/4" /></CardContent></Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <PortalPageHeader
        title="My Subscriptions"
        description="Manage your service subscription packages."
        action={
          <div className="flex gap-2">
            <Button
              variant={viewMode === "my-subscriptions" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("my-subscriptions")}
            >
              My Subscriptions
            </Button>
            <Button
              variant={viewMode === "available-packages" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("available-packages")}
            >
              <ShoppingCart className="mr-2 h-3.5 w-3.5" />
              Browse Packages
            </Button>
          </div>
        }
      />

      {viewMode === "my-subscriptions" ? (
        <>
          {!mySubscriptions || mySubscriptions.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <PackageIcon className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <h3 className="text-sm font-semibold mb-1">No Active Subscriptions</h3>
                <p className="text-sm text-muted-foreground mb-4">You don't have any active subscriptions yet.</p>
                <Button size="sm" onClick={() => setViewMode("available-packages")}>
                  <ShoppingCart className="mr-2 h-3.5 w-3.5" />
                  Browse Packages
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {mySubscriptions.map((subscription) => (
                <Card key={subscription.id}>
                  <CardHeader className="pb-3 border-b border-border">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <PackageIcon className="h-4 w-4 text-muted-foreground" />
                          {subscription.package_name}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">{subscription.subscription_number}</p>
                      </div>
                      <Badge
                        variant={subscription.status === "active" && subscription.is_active_status !== false ? "default" : subscription.status === "expired" ? "danger" : "secondary"}
                        className="capitalize text-[10px] shrink-0"
                      >
                        {subscription.status === "active" && subscription.is_active_status === false ? "pending activation" : subscription.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em] mb-1">Start Date</p>
                        <p className="text-sm font-medium">{format(new Date(subscription.start_date), "MMM dd, yyyy")}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em] mb-1">End Date</p>
                        <p className="text-sm font-medium">{format(new Date(subscription.end_date), "MMM dd, yyyy")}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em] mb-1">Days Remaining</p>
                        <p className="text-sm font-medium">{subscription.days_remaining || 0} days</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em] mb-1">Payment</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={subscription.payment_status === "paid" ? "default" : "secondary"} className="capitalize text-[10px]">
                            {subscription.payment_status}
                          </Badge>
                          {subscription.payment_status === "pending" && (
                            <Link
                              href={subscription.invoice_id ? `/portal/payment/${subscription.invoice_id}` : `/portal/subscriptions`}
                              onClick={async (e) => {
                                if (!subscription.invoice_id) {
                                  e.preventDefault();
                                  try {
                                    const fullSub = await subscriptionsApi.get(subscription.id);
                                    if (fullSub.invoice_id) {
                                      window.location.href = `/portal/payment/${fullSub.invoice_id}`;
                                    } else {
                                      toast({ title: "Payment Unavailable", description: "Invoice is being processed. Please try again.", variant: "destructive" });
                                    }
                                  } catch (error: any) {
                                    toast({ title: "Error", description: error.response?.data?.detail || "Failed to load payment details", variant: "destructive" });
                                  }
                                }
                              }}
                            >
                              <Button variant="default" size="sm" className="h-6 text-xs px-2">
                                <CreditCard className="h-3 w-3 mr-1" />
                                Pay Now
                              </Button>
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>

                    {subscription.status === "active" && subscription.is_active_status === false && (
                      <div className="mb-3 rounded-md border border-warning/20 bg-warning/10 px-3 py-2 text-xs text-warning">
                        Benefits are not usable until {subscription.activation_date ? format(new Date(subscription.activation_date), "MMM dd, yyyy") : "activation is complete"}.
                      </div>
                    )}

                    {subscription.remaining_allowances && Object.keys(subscription.remaining_allowances).length > 0 && (
                      <div className="border-t pt-3">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em] mb-2">Remaining Allowances</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {Object.entries(subscription.remaining_allowances).map(([key, value]) => {
                            const numValue = typeof value === 'number' ? value : parseFloat(String(value)) || 0;
                            const isLow = numValue <= 1 && numValue > 0;
                            const isEmpty = numValue === 0;
                            return (
                              <div
                                key={key}
                                className={cn("px-3 py-2 rounded border text-xs", isEmpty
                                  ? "bg-destructive/5 border-destructive/20"
                                  : isLow
                                  ? "bg-warning/5 border-warning/20"
                                  : "bg-muted border-border"
                                )}
                              >
                                <div className="flex justify-between items-center">
                                  <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                                  <span className={cn("font-bold", isEmpty ? "text-destructive" : isLow ? "text-warning" : "text-success")}>
                                    {value}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {subscription.status === "active" && subscription.days_remaining !== undefined && subscription.days_remaining <= 30 && (
                      <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                        <Button variant="outline" size="sm" onClick={() => handleRenew(subscription)} disabled={renewMutation.isPending}>
                          <RefreshCw className="mr-2 h-3.5 w-3.5" />
                          {renewMutation.isPending ? "Renewing..." : "Renew Now"}
                        </Button>
                      </div>
                    )}

                    {subscription.status === "expired" && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-xs text-muted-foreground">
                          This subscription has expired. Purchase a new subscription to continue.
                        </p>
                      </div>
                    )}
                    {subscription.status === "cancelled" && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-xs text-muted-foreground">This subscription has been cancelled.</p>
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
          {isLoadingPackages ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}><CardContent className="p-4"><Skeleton className="h-5 w-48 mb-3" /><Skeleton className="h-4 w-full mb-2" /><Skeleton className="h-4 w-3/4" /></CardContent></Card>
              ))}
            </div>
          ) : !availablePackages || availablePackages.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <PackageIcon className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <h3 className="text-sm font-semibold mb-1">No Packages Available</h3>
                <p className="text-sm text-muted-foreground">There are no subscription packages available at this time.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availablePackages.map((pkg) => (
                <Card key={pkg.id} className="flex flex-col">
                  <CardHeader className="pb-3 border-b border-border">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm font-semibold">{pkg.name}</CardTitle>
                      <Badge variant="outline" className="text-[10px] shrink-0">{pkg.code}</Badge>
                    </div>
                    <div className="mt-1">
                      <span className="text-xl font-bold">{formatCurrency(pkg.price)}</span>
                      <span className="text-sm text-muted-foreground"> / {pkg.duration_months} months</span>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 pt-3">
                    {pkg.description && (
                      <p className="text-xs text-muted-foreground mb-3">{pkg.description}</p>
                    )}
                    <div className="space-y-1.5 mb-4">
                      {pkg.features.kilometers && (
                        <div className="flex items-center gap-2 text-xs">
                          <Check className="h-3.5 w-3.5 text-success shrink-0" />
                          <span>{pkg.features.kilometers} Kilometers</span>
                        </div>
                      )}
                      {pkg.features.call_out_charges && (
                        <div className="flex items-center gap-2 text-xs">
                          <Check className="h-3.5 w-3.5 text-success shrink-0" />
                          <span>{pkg.features.call_out_charges} Call Out Charges</span>
                        </div>
                      )}
                      {pkg.features.towing_services && (
                        <div className="flex items-center gap-2 text-xs">
                          <Check className="h-3.5 w-3.5 text-success shrink-0" />
                          <span>{pkg.features.towing_services} Towing Services</span>
                        </div>
                      )}
                      {pkg.features.free_inspections && (
                        <div className="flex items-center gap-2 text-xs">
                          <Check className="h-3.5 w-3.5 text-success shrink-0" />
                          <span>{pkg.features.free_inspections} Free Inspections</span>
                        </div>
                      )}
                      {pkg.features.roadside_assistance && (
                        <div className="flex items-center gap-2 text-xs">
                          <Check className="h-3.5 w-3.5 text-success shrink-0" />
                          <span>Roadside Assistance</span>
                        </div>
                      )}
                      {pkg.features.discount_percentage && (
                        <div className="flex items-center gap-2 text-xs">
                          <Check className="h-3.5 w-3.5 text-success shrink-0" />
                          <span>{pkg.features.discount_percentage}% Discount</span>
                        </div>
                      )}
                    </div>
                    <Button size="sm" className="w-full" onClick={() => handlePurchase(pkg)}>
                      <ShoppingCart className="mr-2 h-3.5 w-3.5" />
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
                <p className="text-sm font-semibold">{selectedPackage.name}</p>
                {selectedPackage.description && (
                  <p className="text-sm text-muted-foreground">{selectedPackage.description}</p>
                )}
              </div>
              <div className="border-t pt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Price</span>
                  <span className="font-semibold">{formatCurrency(selectedPackage.price)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Duration</span>
                  <span>{selectedPackage.duration_months} months</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sub-vehicle" className="flex items-center gap-1.5">
                  <Car className="h-3.5 w-3.5" />
                  Select Vehicle <span className="text-red-500">*</span>
                </Label>
                {vehicles.length === 0 ? (
                  <p className="text-xs text-muted-foreground border rounded-md px-3 py-2 bg-muted">
                    No vehicles found. Please add a vehicle first.
                  </p>
                ) : (
                  <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
                    <SelectTrigger id="sub-vehicle">
                      <SelectValue placeholder="-- Choose a vehicle --" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles.map((v: any) => (
                        <SelectItem key={v.id} value={v.id.toString()}>
                          {v.year} {v.make} {v.model} ({v.license_plate})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                After purchase, subscription benefits are activated. Payment will be processed separately.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsPurchaseDialogOpen(false); setSelectedPackage(null); setSelectedVehicleId(""); }}>
              Cancel
            </Button>
            <Button onClick={confirmPurchase} disabled={purchaseMutation.isPending || !selectedVehicleId}>
              {purchaseMutation.isPending ? "Processing..." : "Confirm Purchase"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
