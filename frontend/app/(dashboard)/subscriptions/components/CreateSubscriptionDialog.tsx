
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Checkbox } from "@/components/ui/checkbox";
import { Package } from "@/lib/api/subscriptions";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customersApi, Customer } from "@/lib/api/customers";
import type { Vehicle } from "@/lib/api/vehicles";
import { subscriptionsApi } from "@/lib/api/subscriptions";
import { packagesApi } from "@/lib/api/subscriptions";
import { useToast } from "@/lib/hooks/useToast";
import { useCurrency } from "@/lib/hooks/useCurrency";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Calendar, User, Car, Package as PackageIcon, CheckCircle2, ShieldCheck, Sparkles, AlertCircle } from "lucide-react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getUserFacingError } from "@/lib/api/errors";

const subscriptionCreateSchema = z.object({
    customer: z.number().min(1, "Customer is required"),
    vehicle: z.number().min(1, "Vehicle is required"),
    package: z.number().min(1, "Package is required"),
    start_date: z.string().optional(),
    auto_renew: z.boolean().optional(),
});

type SubscriptionCreateFormData = z.infer<typeof subscriptionCreateSchema>;

interface CreateSubscriptionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function CreateSubscriptionDialog({ open, onOpenChange }: CreateSubscriptionDialogProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { formatCurrency } = useCurrency();

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
            auto_renew: true,
        },
    });

    // Fetch Data
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

    const selectedCustomerId = watch("customer");
    const selectedPackageId = watch("package");
    const selectedPackage = packages.find((p) => p.id === selectedPackageId);

    const { data: customerVehicles, isLoading: isLoadingVehicles } = useQuery({
        queryKey: ["customers", selectedCustomerId, "vehicles"],
        queryFn: () => customersApi.vehicles(selectedCustomerId),
        enabled: !!selectedCustomerId,
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
                title: "Subscription Created",
                description: `Invoice #${data.invoice_id || "N/A"} generated and pending payment.`,
            });
            onOpenChange(false);
            reset();
        },

        onError: (error: unknown) => {
            toast({
                title: "Creation Failed",
                description: getUserFacingError(error, "Could not create subscription"),
                variant: "destructive",
            });
        },
    });

    const onSubmit = (data: SubscriptionCreateFormData) => {
        createMutation.mutate(data);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden bg-muted/50">

                {/* Header */}
                <div className="bg-card border-b px-8 py-6 flex justify-between items-center shadow-sm relative z-10">
                    <div>
                        <DialogTitle className="text-2xl font-black text-foreground flex items-center gap-2">
                            <div className="p-2 bg-primary rounded-lg text-white shadow-orange-200 shadow-lg">
                                <ShieldCheck className="w-5 h-5" />
                            </div>
                            New Subscription
                        </DialogTitle>
                        <p className="text-muted-foreground mt-1 pl-1">Configure a new vehicle protection plan</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col md:flex-row h-full max-h-[80vh] overflow-hidden">

                    {/* Main Content Area */}
                    <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-card/50">

                        {/* Step 1: Customer & Vehicle */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-sm font-bold text-foreground uppercase tracking-widest">
                                <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs">1</span>
                                Customer Details
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pl-8">
                                <div className="space-y-2">
                                    <Label htmlFor="customer" className="text-muted-foreground font-medium">Customer</Label>
                                    <Select
                                        onValueChange={(val) => {
                                            setValue("customer", parseInt(val));
                                            setValue("vehicle", 0);
                                        }}
                                    >
                                        <SelectTrigger id="customer">
                                            <SelectValue placeholder="Select Customer..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {customers.map((customer: Customer) => (
                                                <SelectItem key={customer.id} value={customer.id.toString()}>
                                                    {customer.full_name || customer.customer_number}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {errors.customer && <span className="text-xs text-destructive font-medium">{errors.customer.message}</span>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="vehicle" className="text-muted-foreground font-medium">Vehicle</Label>
                                    <Select
                                        onValueChange={(val) => setValue("vehicle", parseInt(val))}
                                        disabled={!selectedCustomerId || isLoadingVehicles}
                                    >
                                        <SelectTrigger id="vehicle">
                                            <SelectValue placeholder={!selectedCustomerId ? "Waiting for customer..." : isLoadingVehicles ? "Loading..." : "Select Vehicle..."} />
                                        </SelectTrigger>
                                        <SelectContent>

                                            {customerVehicles?.map((v: Vehicle) => {
                                                const vehicleType = v.vehicle_type || '';
                                                const isAllowed = ['saloon', 'suv', 'pickup', 'minivan'].includes(vehicleType.toLowerCase());
                                                return (
                                                    <SelectItem key={v.id} value={v.id.toString()} disabled={!isAllowed} className={!isAllowed ? "text-muted-foreground" : ""}>
                                                        {v.license_plate} - {v.year} {v.make} {v.model} {!isAllowed ? "(Ineligible)" : ""}
                                                    </SelectItem>
                                                );
                                            })}
                                        </SelectContent>
                                    </Select>
                                    {errors.vehicle && <span className="text-xs text-destructive font-medium">{errors.vehicle.message}</span>}
                                </div>
                            </div>
                        </div>

                        {/* Step 2: Plan Selection */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-sm font-bold text-foreground uppercase tracking-widest">
                                <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs">2</span>
                                Select Plan
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-8">
                                {packages.map((pkg: Package) => (
                                    <div
                                        key={pkg.id}
                                        onClick={() => setValue("package", pkg.id)}
                                        className={cn(
                                            "relative cursor-pointer border-2 rounded-xl p-4 transition-all duration-200 hover:shadow-md",
                                            selectedPackageId === pkg.id
                                                ? "border-primary bg-primary/5"
                                                : "border-border bg-card hover:border-border"
                                        )}
                                    >
                                        {selectedPackageId === pkg.id && (
                                            <div className="absolute top-3 right-3 text-primary">
                                                <CheckCircle2 className="w-5 h-5 fill-orange-100" />
                                            </div>
                                        )}

                                        <div className="space-y-1">
                                            <h3 className="font-bold text-foreground">{pkg.name}</h3>
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-xl font-black text-primary">{formatCurrency(parseFloat(pkg.price))}</span>
                                                <span className="text-xs text-muted-foreground font-medium">/ {pkg.duration_months} months</span>
                                            </div>
                                        </div>

                                        <div className="mt-4 flex flex-wrap gap-2">
                                            <Badge variant="secondary" className="bg-muted text-muted-foreground hover:bg-slate-200 border-0">
                                                {pkg.features?.towing_services_km || 0}km Towing
                                            </Badge>
                                            <Badge variant="secondary" className="bg-muted text-muted-foreground hover:bg-slate-200 border-0">
                                                {pkg.features?.total_service_calls || 0} Calls
                                            </Badge>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {errors.package && <p className="pl-8 text-xs text-destructive font-medium">{errors.package.message}</p>}
                        </div>

                        {/* Step 3: Settings */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-sm font-bold text-foreground uppercase tracking-widest">
                                <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs">3</span>
                                Configuration
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pl-8">
                                <div className="space-y-2">
                                    <Label htmlFor="start_date" className="text-muted-foreground font-medium">Start Date</Label>
                                    <Input
                                        id="start_date"
                                        type="date"
                                        className="bg-card"
                                        {...register("start_date")}
                                    />
                                </div>

                                <div className="flex items-start justify-between p-3 border rounded-lg bg-card">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="auto_renew" className="text-foreground font-medium cursor-pointer">Auto-Renew</Label>
                                        <p className="text-xs text-muted-foreground">Automatically renew when expired</p>
                                    </div>
                                    <input
                                        type="checkbox"
                                        id="auto_renew"
                                        {...register("auto_renew")}
                                        className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                                    />
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* Sidebar Summary */}
                    <div className="w-full md:w-[320px] bg-muted border-l flex flex-col">
                        <div className="p-6 border-b bg-card">
                            <h3 className="text-sm font-black uppercase tracking-widest text-foreground flex items-center gap-2">
                                Order Summary
                            </h3>
                        </div>

                        <div className="flex-1 p-6 space-y-6 overflow-y-auto">
                            {selectedPackage ? (
                                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div className="space-y-4">
                                        <div className="aspect-video rounded-lg bg-gradient-to-br from-primary to-indigo-700 p-4 text-white flex flex-col justify-between shadow-lg shadow-orange-200">
                                            <div className="flex justify-between items-start">
                                                <Sparkles className="w-5 h-5 text-orange-200" />
                                                <span className="font-mono text-xs text-orange-200">{selectedPackage.code}</span>
                                            </div>
                                            <div>
                                                <div className="text-lg font-bold">{selectedPackage.name}</div>
                                                <div className="text-sm text-orange-100">{selectedPackage.duration_months} Months Coverage</div>
                                            </div>
                                        </div>

                                        <div className="space-y-3 pt-2">
                                            <h4 className="text-xs font-bold text-muted-foreground uppercase">Includes</h4>
                                            <ul className="space-y-2 text-sm text-foreground">
                                                <li className="flex items-center gap-2">
                                                    <CheckCircle2 className="w-4 h-4 text-success" />
                                                    <span>{selectedPackage.features?.towing_services_km || 0} km Towing Range</span>
                                                </li>
                                                <li className="flex items-center gap-2">
                                                    <CheckCircle2 className="w-4 h-4 text-success" />
                                                    <span>{selectedPackage.features?.total_service_calls || 0} Service Calls</span>
                                                </li>
                                                <li className="flex items-center gap-2">
                                                    <CheckCircle2 className="w-4 h-4 text-success" />
                                                    <span>{selectedPackage.features?.emergency_fuel || 0} Emergency Fuel</span>
                                                </li>
                                            </ul>
                                        </div>
                                    </div>

                                    <div className="border-t border-dashed pt-4 space-y-2">
                                        <div className="flex justify-between text-sm text-muted-foreground">
                                            <span>Subtotal</span>
                                            <span>{formatCurrency(parseFloat(selectedPackage.price))}</span>
                                        </div>
                                        <div className="flex justify-between text-sm text-muted-foreground">
                                            <span>Tax (0%)</span>
                                            <span>{formatCurrency(0)}</span>
                                        </div>
                                        <div className="flex justify-between items-center pt-2 text-lg font-black text-foreground">
                                            <span>Total</span>
                                            <span>{formatCurrency(parseFloat(selectedPackage.price))}</span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground space-y-2 opacity-50">
                                    <PackageIcon className="w-12 h-12 stroke-1" />
                                    <p className="text-sm">Select a package to view details</p>
                                </div>
                            )}
                        </div>

                        <div className="p-6 bg-card border-t">
                            <div className="flex gap-3">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() => {
                                        onOpenChange(false);
                                        reset();
                                    }}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={isSubmitting || createMutation.isPending || !selectedPackage}
                                    className={cn("flex-[2] font-semibold text-white", createMutation.isPending ? "bg-slate-400" : "bg-primary hover:bg-primary/90 shadow-lg shadow-orange-200")}
                                >
                                    {createMutation.isPending ? "Accessing..." : "Create Subscription"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
