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
import { useCurrency } from "@/lib/hooks/useCurrency";
import { PortalPageHeader } from "../components/PortalPageHeader";
import { PortalList } from "../components/PortalList";
import { PortalCard } from "../components/PortalCard";

const formatError = (error: any, defaultMessage: string) => {
  const data = error.response?.data;
  if (!data) return defaultMessage;
  if (typeof data === 'string') return data;
  if (data.detail) return data.detail;
  if (data.message) return data.message;
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
  const { formatCurrency } = useCurrency();
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
    setSelectedVehicleId("");
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

  const handlePayNow = async (e: React.MouseEvent, subscription: Subscription) => {
    if (!subscription.invoice_id) {
      e.preventDefault();
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
  };

  // Helper for status badge variant
  const getStatusVariant = (status: string) => {
    switch (status) {
      case "active": return "success";
      case "expired": return "danger";
      case "cancelled": return "secondary";
      default: return "secondary";
    }
  };

  return (
    <div>
      <PortalPageHeader
        title="My Subscriptions"
        description="Manage your subscription packages"
        action={
          <div className="flex gap-2">
            <Button
              variant={viewMode === "my-subscriptions" ? "default" : "outline"}
              onClick={() => setViewMode("my-subscriptions")}
              size="sm"
            >
              My Subscriptions
            </Button>
            <Button
              variant={viewMode === "available-packages" ? "default" : "outline"}
              onClick={() => setViewMode("available-packages")}
              size="sm"
            >
              <ShoppingCart className="mr-2 h-4 w-4" />
              Browse Packages
            </Button>
          </div>
        }
      />

      {viewMode === "my-subscriptions" ? (
        <div className="mt-6">
          <PortalList
            data={mySubscriptions || []}
            isLoading={isLoadingSubscriptions}
            emptyMessage="No active subscriptions found."
            emptyAction={<Button variant="link" onClick={() => setViewMode("available-packages")}>Browse Packages</Button>}
            columns={[
              {
                header: "Package",
                cell: (sub) => (
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                      <PackageIcon className="w-4 h-4 text-primary" />
                      {sub.package_name}
                    </div>
                    <div className="text-xs text-gray-500 font-mono mt-0.5">
                      {sub.subscription_number}
                    </div>
                  </div>
                )
              },
              {
                header: "Start Date",
                className: "hidden md:table-cell",
                cell: (sub) => <span className="text-sm text-gray-600 dark:text-gray-400">{format(new Date(sub.start_date), "MMM d, yyyy")}</span>
              },
              {
                header: "End Date",
                className: "hidden md:table-cell",
                cell: (sub) => <span className="text-sm text-gray-600 dark:text-gray-400">{format(new Date(sub.end_date), "MMM d, yyyy")}</span>
              },
              {
                header: "Remaining",
                className: "hidden md:table-cell",
                cell: (sub) => <span className="font-medium">{sub.days_remaining} days</span>
              },
              {
                header: "Status",
                cell: (sub) => (
                  <div className="flex flex-col items-start gap-1">
                    <Badge variant={getStatusVariant(sub.status)}>{sub.status}</Badge>
                    {sub.payment_status === "pending" && (
                      <Badge variant="warning" className="text-[10px] px-1.5 h-5">Payment Pending</Badge>
                    )}
                  </div>
                )
              },
              {
                header: "Action",
                className: "text-right",
                cell: (sub) => (
                  <div className="flex justify-end items-center gap-2">
                    {sub.payment_status === "pending" && (
                      <Link
                        href={sub.invoice_id ? `/portal/payment/${sub.invoice_id}` : "#"}
                        onClick={(e) => handlePayNow(e, sub)}
                      >
                        <Button size="sm" className="h-8 text-xs">Pay Now</Button>
                      </Link>
                    )}
                    {sub.status === "active" && sub.days_remaining !== undefined && sub.days_remaining <= 30 && (
                      <Button variant="secondary" size="sm" className="h-8 text-xs" onClick={() => handleRenew(sub)} disabled={renewMutation.isPending}>
                        <RefreshCw className="mr-1 h-3 w-3" />
                        Renew
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => subscriptionsApi.downloadCard(sub.id, sub.subscription_number)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                )
              }
            ]}
            renderMobileItem={(sub) => (
              <PortalCard
                key={sub.id}
                // No href for general click, actions are specific
                icon={<PackageIcon className="w-5 h-5 text-primary" />}
                title={sub.package_name}
                subtitle={`${format(new Date(sub.start_date), "MMM d")} - ${format(new Date(sub.end_date), "MMM d, yyyy")}`}
                status={
                  <Badge variant={getStatusVariant(sub.status)} className="text-[10px] h-5 px-1.5 capitalize">
                    {sub.status}
                  </Badge>
                }
              >
                <div className="flex flex-col gap-3 mt-2">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{sub.days_remaining} days remaining</span>
                    <span className="uppercase">{sub.payment_status}</span>
                  </div>
                  <div className="flex gap-2 justify-end relative z-20">
                    {sub.payment_status === "pending" && (
                      <Link
                        href={sub.invoice_id ? `/portal/payment/${sub.invoice_id}` : "#"}
                        onClick={(e) => handlePayNow(e, sub)}
                        className="flex-1"
                      >
                        <Button size="sm" className="w-full h-8 text-xs">Pay Now</Button>
                      </Link>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-8 text-xs"
                      onClick={() => subscriptionsApi.downloadCard(sub.id, sub.subscription_number)}
                    >
                      <Download className="mr-1 h-3 w-3" />
                      Card
                    </Button>
                  </div>
                </div>
              </PortalCard>
            )}
          />
        </div>
      ) : (
        <div className="mt-6">
          {/* Available Packages Grid - Preserving existing card layout as it works well for catalogs */}
          {isLoadingPackages ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i}><CardContent className="p-6"><Skeleton className="h-6 w-48 mb-4" /><Skeleton className="h-4 w-full mb-2" /><Skeleton className="h-4 w-3/4" /></CardContent></Card>
              ))}
            </div>
          ) : !availablePackages || availablePackages.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <PackageIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Packages Available</h3>
                <p className="text-gray-500 dark:text-gray-400">There are no subscription packages available at this time.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {availablePackages.map((pkg) => (
                <Card key={pkg.id} className="flex flex-col hover:border-primary/50 transition-colors">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{pkg.name}</span>
                      <Badge variant="info">{pkg.code}</Badge>
                    </CardTitle>
                    <div className="mt-2 text-primary font-bold">
                      <span className="text-3xl">{formatCurrency(parseFloat(pkg.price))}</span>
                      <span className="text-muted-foreground text-sm font-normal"> / {pkg.duration_months} months</span>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col">
                    {pkg.description && (
                      <p className="text-sm text-muted-foreground mb-4 flex-grow">{pkg.description}</p>
                    )}
                    <div className="space-y-2 mb-6">
                      {pkg.features.kilometers && (
                        <div className="flex items-center gap-2 text-sm"><Check className="h-4 w-4 text-green-500" /><span>{pkg.features.kilometers} Kilometers</span></div>
                      )}
                      {pkg.features.call_out_charges && (
                        <div className="flex items-center gap-2 text-sm"><Check className="h-4 w-4 text-green-500" /><span>{pkg.features.call_out_charges} Call Out Charges</span></div>
                      )}
                      {pkg.features.free_inspections && (
                        <div className="flex items-center gap-2 text-sm"><Check className="h-4 w-4 text-green-500" /><span>{pkg.features.free_inspections} Free Inspections</span></div>
                      )}
                      {pkg.features.towing_services && (
                        <div className="flex items-center gap-2 text-sm"><Check className="h-4 w-4 text-green-500" /><span>{pkg.features.towing_services} Towing Services</span></div>
                      )}
                    </div>
                    <Button className="w-full" onClick={() => handlePurchase(pkg)}>
                      <ShoppingCart className="mr-2 h-4 w-4" />
                      Purchase
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Purchase Dialog - Kept largely same */}
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
                      {formatCurrency(parseFloat(selectedPackage.price))}
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
              ) : "Confirm Purchase"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

