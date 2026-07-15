"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { roadsideApi } from "@/lib/api/roadside";
import { customersApi } from "@/lib/api/customers";
import { subscriptionsApi } from "@/lib/api/subscriptions";
import { branchesApi } from "@/lib/api/branches";
import type { Branch } from "@/lib/api/branches";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    MapPin, Phone, AlertCircle,
    Truck, User as UserIcon,
    Info, Navigation, Check,
    Map as MapIcon,
    ArrowRight, Building2, PencilLine
} from "lucide-react";
import Link from "next/link";
import { useToast } from "@/lib/hooks/useToast";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";
import { useEffect } from "react";
import { CustomerSelector } from "@/components/customers/CustomerSelector";
import { getUserFacingError } from "@/lib/api/errors";
import { RoadsideBranchSelect } from "@/components/roadside/RoadsideBranchSelect";
import { useBranchStore } from "@/store/branchStore";
import { captureCurrentPosition, getGeolocationErrorMessage } from "@/lib/utils/geolocation";

const serviceTypeValues = [
    'towing',
    'battery_boost',
    'flat_tyre',
    'key_lockout',
    'emergency_fuel',
    'extrication',
    'mechanical_first_aid',
    'accident_estimate',
    'pre_purchase_inspection',
    'other'
] as const;

const serviceTypes: Array<{ value: (typeof serviceTypeValues)[number]; label: string }> = [
    { value: 'towing', label: 'Towing Service' },
    { value: 'battery_boost', label: 'Battery Boost' },
    { value: 'flat_tyre', label: 'Flat Tyre Service' },
    { value: 'key_lockout', label: 'Key Lock Out' },
    { value: 'emergency_fuel', label: 'Emergency Fuel Delivery' },
    { value: 'extrication', label: 'Extrication Service' },
    { value: 'mechanical_first_aid', label: 'Mechanical & Electrical First Aid' },
    { value: 'accident_estimate', label: 'Accident Estimate' },
    { value: 'pre_purchase_inspection', label: 'Pre-Purchase Inspection' },
    { value: 'other', label: 'Other' },
];

const requiredId = (fieldName: string) =>
    z.number({ error: `${fieldName} is required` })
        .int(`${fieldName} must be valid`)
        .min(1, `${fieldName} is required`);

const optionalNumber = (message: string) =>
    z.union([
        z.number({ error: message }),
        z.nan().transform(() => undefined),
    ]).optional();

const roadsideRequestSchema = z.object({
    customer: requiredId("Customer"),
    vehicle: requiredId("Vehicle"),
    branch: requiredId("Branch"),
    service_type: z.enum(serviceTypeValues, { error: "Service type is required" }),
    breakdown_location: z.string().min(1, "Breakdown location is required"),
    latitude: optionalNumber("Latitude must be a valid number"),
    longitude: optionalNumber("Longitude must be a valid number"),
    description: z.string().optional(),
    customer_phone: z.string().min(1, "Phone number is required"),
    tow_distance_km: z.union([
        z.number({ error: "Tow distance is required for towing service" })
            .min(0, "Tow distance cannot be negative"),
        z.nan().transform(() => undefined),
    ]).optional(),
    charge_amount: optionalNumber("Charge amount must be a valid number"),
    destination: z.string().optional(),
    notes: z.string().optional(),
}).refine((data) => {
    if (data.service_type === 'towing') {
        return data.tow_distance_km !== undefined && data.tow_distance_km > 0;
    }
    return true;
}, {
    message: "Tow distance is required for towing service",
    path: ["tow_distance_km"],
});

type RoadsideRequestFormData = z.infer<typeof roadsideRequestSchema>;
type RoadsideRequestSubmissionData = RoadsideRequestFormData & { pay_as_you_go?: boolean };

type ApiErrorResponse = {
    response?: {
        data?: {
            pay_as_you_go_available?: boolean;
        };
    };
};

export default function NewRoadsideRequestDashboardPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialCustomerId = searchParams.get("customer");

    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { activeBranchId } = useBranchStore();

    const [serverError, setServerError] = useState<string | null>(null);
    const [payAsYouGoDraft, setPayAsYouGoDraft] = useState<RoadsideRequestSubmissionData | null>(null);
    const [isLocating, setIsLocating] = useState(false);
    // 'branch' = user selected a branch, 'custom' = manual text entry
    const [destinationMode, setDestinationMode] = useState<'branch' | 'custom'>('branch');

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
        setValue,
        resetField,
        control,
    } = useForm<RoadsideRequestFormData>({
        resolver: zodResolver(roadsideRequestSchema),
        defaultValues: {
            customer: initialCustomerId ? parseInt(initialCustomerId) : undefined,
            branch: activeBranchId ?? undefined,
            service_type: undefined,
        },
    });

    const selectedCustomerId = useWatch({ control, name: "customer" });
    const selectedVehicleId = useWatch({ control, name: "vehicle" });
    const serviceType = useWatch({ control, name: "service_type" });
    const selectedDestination = useWatch({ control, name: "destination" });

    const { data: selectedCustomer } = useQuery({
        queryKey: ["customer", selectedCustomerId],
        queryFn: () => customersApi.get(selectedCustomerId!),
        enabled: !!selectedCustomerId,
    });

    const { data: customerVehicles, isLoading: isLoadingVehicles } = useQuery({
        queryKey: ["customer", "vehicles", selectedCustomerId],
        queryFn: () => customersApi.vehicles(selectedCustomerId!),
        enabled: !!selectedCustomerId,
    });

    // Check for active subscription
    const { data: activeSubscriptionData, isLoading: isLoadingSubscription } = useQuery({
        queryKey: ["subscription", "check", selectedCustomerId, selectedVehicleId],
        queryFn: () => subscriptionsApi.list({
            customer: selectedCustomerId,
            vehicle: selectedVehicleId,
            status: 'active'
        }),
        enabled: !!selectedCustomerId && !!selectedVehicleId,
    });

    // Fetch active branches (only needed when towing is selected)
    const { data: branchesData } = useQuery({
        queryKey: ["branches", "active"],
        queryFn: () => branchesApi.list({ is_active: true }),
        enabled: serviceType === 'towing',
        staleTime: 5 * 60 * 1000,
    });
    const branches: Branch[] = branchesData ?? [];

    const activeSubscription = activeSubscriptionData?.results?.find((subscription) => subscription.is_active_status) || null;
    const pendingActivationSubscription = activeSubscriptionData?.results?.find((subscription) => !subscription.is_active_status) || null;
    const shouldShowChargeAmount = !!payAsYouGoDraft || (!!selectedCustomerId && !!selectedVehicleId && !isLoadingSubscription && !activeSubscription);

    const createMutation = useMutation({
        mutationFn: (data: RoadsideRequestSubmissionData) => roadsideApi.create(data),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["roadside"] });
            setPayAsYouGoDraft(null);
            toast({
                title: "Request Created",
                description: `Roadside request ${data.request_number} has been created successfully.`,
            });
            router.push(`/roadside/${data.id}`);
        },

        onError: (error: unknown) => {
            const errorMessage = getUserFacingError(error, "Failed to create request");
            const payAsYouGoAvailable = Boolean((error as ApiErrorResponse)?.response?.data?.pay_as_you_go_available);
            setServerError(errorMessage);
            if (!payAsYouGoAvailable) {
                setPayAsYouGoDraft(null);
            }
        },
    });

    const getCurrentLocation = async () => {
        setIsLocating(true);
        try {
            const { latitude, longitude, label } = await captureCurrentPosition();
            setValue("latitude", latitude);
            setValue("longitude", longitude);
            setValue("breakdown_location", label, { shouldValidate: true });
            toast({
                title: "Location updated",
                description: "Breakdown location has been filled in.",
            });
        } catch (error) {
            toast({
                title: "Location unavailable",
                description: getGeolocationErrorMessage(
                    error instanceof GeolocationPositionError || error instanceof Error
                        ? error
                        : new Error("Could not get location")
                ),
                variant: "destructive",
            });
        } finally {
            setIsLocating(false);
        }
    };

    // React to initialCustomerId or changes in customer query
    useEffect(() => {
        if (initialCustomerId) {
            const id = parseInt(initialCustomerId);
            if (!isNaN(id)) {
                setValue("customer", id);
            }
        }
    }, [initialCustomerId, setValue]);

    useEffect(() => {
        if (activeBranchId) {
            setValue("branch", activeBranchId, { shouldValidate: true });
        }
    }, [activeBranchId, setValue]);

    const buildSubmissionData = (data: RoadsideRequestFormData, payAsYouGo = false): RoadsideRequestSubmissionData => ({
        ...data,
        pay_as_you_go: payAsYouGo || undefined,
        latitude: (typeof data.latitude === 'number' && !isNaN(data.latitude))
            ? parseFloat(data.latitude.toFixed(6))
            : undefined,
        longitude: (typeof data.longitude === 'number' && !isNaN(data.longitude))
            ? parseFloat(data.longitude.toFixed(6))
            : undefined,
    });

    const onSubmit = (data: RoadsideRequestFormData) => {
        setServerError(null);
        setPayAsYouGoDraft(null);

        const submissionData = buildSubmissionData(data);
        setPayAsYouGoDraft(submissionData);
        createMutation.mutate(submissionData);
    };

    const continueAsPayAsYouGo = () => {
        if (!payAsYouGoDraft) return;
        handleSubmit((data) => {
            setServerError(null);
            createMutation.mutate(buildSubmissionData(data, true));
        })();
    };

    return (
        <div className="space-y-6 pb-12">
            {/* Header */}
            <div className="flex flex-col space-y-4">
                <div className="flex justify-between items-center">
                    <div>
                        <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
                            <Link href="/dashboard" className="hover:text-primary transition-colors">Dashboard</Link>
                            <span>/</span>
                            <Link href="/roadside" className="hover:text-primary transition-colors">Roadside</Link>
                            <span>/</span>
                            <span className="text-foreground font-medium">New Request</span>
                        </div>
                        <h1 className="text-xl font-bold tracking-tight text-foreground">
                            New Roadside Request
                        </h1>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {serverError && (
                    <div className="bg-destructive/10 dark:bg-destructive/20 border border-destructive/20 dark:border-destructive/30 text-destructive dark:text-destructive p-4 rounded-lg flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                        <div className="space-y-3">
                            <p className="text-sm">{serverError}</p>
                            {payAsYouGoDraft && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8 border-destructive/30 bg-card text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    disabled={createMutation.isPending}
                                    onClick={continueAsPayAsYouGo}
                                >
                                    Continue as Pay As You Go
                                </Button>
                            )}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Left Column - Main Details */}
                    <div className="lg:col-span-2 space-y-4">
                        {/* Customer & Vehicle Selection */}
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <UserIcon className="w-4 h-4" />
                                    Customer & Vehicle
                                </CardTitle>
                                <CardDescription className="text-xs">Select the customer and the vehicle needing assistance</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-3">
                                        <Label className="font-semibold">Customer *</Label>
                                        <CustomerSelector
                                            selectedCustomerId={selectedCustomerId}
                                            onSelect={(cust) => {
                                                setValue("customer", cust.id, { shouldValidate: true });
                                                if (cust.phone) setValue("customer_phone", cust.phone);
                                                resetField("vehicle");
                                            }}
                                        />
                                        {errors.customer && (
                                            <p className="text-xs text-destructive font-medium flex items-center gap-1">
                                                <AlertCircle className="w-3 h-3" />
                                                {errors.customer.message}
                                            </p>
                                        )}
                                    </div>

                                    <div className="space-y-3">
                                        <Label htmlFor="vehicle" className="font-semibold">Selected Vehicle *</Label>
                                        <div className="relative">
                                            <select
                                                id="vehicle"
                                                {...register("vehicle", { valueAsNumber: true })}
                                                disabled={!selectedCustomerId || isLoadingVehicles}
                                                className={cn(
                                                    "w-full h-11 px-3 py-2 border rounded-lg bg-card transition-all disabled:opacity-50",
                                                    errors.vehicle ? "border-destructive ring-destructive/10" : "border-border focus:ring-primary/10"
                                                )}
                                            >
                                                <option value="">
                                                    {isLoadingVehicles ? "Loading vehicles..." : "-- Choose Vehicle --"}
                                                </option>
                                                {customerVehicles?.map(v => (
                                                    <option key={v.id} value={v.id}>
                                                        {v.year} {v.make} {v.model} [{v.license_plate}]
                                                    </option>
                                                ))}
                                            </select>
                                            {isLoadingVehicles && <div className="absolute right-9 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-primary border-r-transparent animate-spin" />}
                                        </div>
                                        {errors.vehicle && (
                                            <p className="text-xs text-destructive font-medium flex items-center gap-1">
                                                <AlertCircle className="w-3 h-3" />
                                                {errors.vehicle.message}
                                            </p>
                                        )}
                                        {!selectedCustomerId && (
                                            <p className="text-xs text-warning font-medium px-1">← Select a customer first</p>
                                        )}
                                    </div>
                                </div>

                                {selectedCustomer && (
                                    <div className="mt-4 p-4 rounded-xl bg-primary/5 dark:bg-warning/10 border border-warning/20 dark:border-warning/30 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="h-10 w-10 rounded-full bg-warning/15 flex items-center justify-center text-primary dark:text-warning">
                                                    <UserIcon className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-foreground">{selectedCustomer.full_name || selectedCustomer.company_name}</h4>
                                                    <p className="text-xs text-muted-foreground">{selectedCustomer.customer_number} • {selectedCustomer.phone || "No phone"}</p>
                                                </div>
                                            </div>
                                            <Badge variant="secondary" className="bg-card">Verified</Badge>
                                        </div>

                                        {selectedVehicleId && (
                                            <div className="pt-3 border-t border-warning/20 dark:border-warning/30">
                                                {isLoadingSubscription ? (
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                        <div className="h-3 w-3 rounded-full border-2 border-primary border-r-transparent animate-spin" />
                                                        Checking subscription coverage...
                                                    </div>
                                                ) : activeSubscription ? (
                                                    <div className="flex items-center justify-between text-sm">
                                                        <div className="flex items-center gap-2 text-success dark:text-success font-medium">
                                                            <Check className="w-4 h-4" />
                                                            <span>Subscription Package: {activeSubscription.package_name || "Standard Coverage"}</span>
                                                        </div>
                                                        <Badge variant="success" className="bg-success/15 text-success border-success/20">Covered</Badge>
                                                    </div>
                                                ) : pendingActivationSubscription ? (
                                                    <div className="flex items-center justify-between text-sm">
                                                        <div className="flex items-center gap-2 text-warning dark:text-warning font-medium">
                                                            <Info className="w-4 h-4" />
                                                            <span>Membership activates {pendingActivationSubscription.activation_date || "after payment processing"}</span>
                                                        </div>
                                                        <Badge variant="warning" className="bg-warning/15 text-warning border-warning/20">Not Yet Usable</Badge>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-between text-sm">
                                                        <div className="flex items-center gap-2 text-warning dark:text-warning font-medium">
                                                            <Info className="w-4 h-4" />
                                                            <span>No Active Subscription Found</span>
                                                        </div>
                                                        <Badge variant="warning" className="bg-warning/15 text-warning border-warning/20">Pay-Per-Use</Badge>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Location Details */}
                        <Card>
                            <CardHeader className="py-3 px-4 border-b">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                        <MapIcon className="w-4 h-4 text-primary" />
                                        Location
                                    </CardTitle>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        type="button"
                                        onClick={getCurrentLocation}
                                        disabled={isLocating}
                                        className="h-8 text-xs gap-2"
                                    >
                                        {isLocating ? (
                                            <div className="h-3 w-3 rounded-full border-2 border-primary border-r-transparent animate-spin" />
                                        ) : (
                                            <Navigation className="w-3 h-3" />
                                        )}
                                        Get current location
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="p-4 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Controller
                                        control={control}
                                        name="branch"
                                        render={({ field }) => (
                                            <RoadsideBranchSelect
                                                variant="inline"
                                                id="dashboard-roadside-branch"
                                                value={field.value}
                                                onChange={(id) => field.onChange(id)}
                                                error={errors.branch?.message}
                                            />
                                        )}
                                    />
                                    <div className="space-y-1.5">
                                        <Label htmlFor="breakdown_location" className="font-semibold text-sm">
                                            Breakdown location *
                                        </Label>
                                        <div className="relative">
                                            <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                id="breakdown_location"
                                                {...register("breakdown_location")}
                                                placeholder="Street, landmark, or coordinates"
                                                className={cn("pl-9 h-10", errors.breakdown_location && "border-destructive")}
                                            />
                                        </div>
                                        {errors.breakdown_location && (
                                            <p className="text-xs text-destructive font-medium flex items-center gap-1">
                                                <AlertCircle className="w-3 h-3" />
                                                {errors.breakdown_location.message}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="latitude" className="text-xs font-medium text-muted-foreground">Latitude (Optional)</Label>
                                        <Input
                                            id="latitude"
                                            type="number"
                                            step="any"
                                            {...register("latitude", { valueAsNumber: true })}
                                            placeholder="Ex: 5.6037"
                                            className="h-9 text-sm"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="longitude" className="text-xs font-medium text-muted-foreground">Longitude (Optional)</Label>
                                        <Input
                                            id="longitude"
                                            type="number"
                                            step="any"
                                            {...register("longitude", { valueAsNumber: true })}
                                            placeholder="Ex: -0.1870"
                                            className="h-9 text-sm"
                                        />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Right Column - Service & Summary */}
                    <div className="space-y-3">
                        <Card>
                            <CardHeader className="py-3 px-4 border-b">
                                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                    <Truck className="w-4 h-4 text-primary" />
                                    Service Details
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-4">
                                <div className="space-y-3">
                                    <Label htmlFor="service_type" className="font-semibold">Service Type *</Label>
                                    <select
                                        id="service_type"
                                        {...register("service_type")}
                                        className={cn(
                                            "w-full h-11 px-3 py-2 border rounded-lg bg-card transition-all",
                                            errors.service_type ? "border-destructive ring-destructive/10" : "border-border focus:ring-primary/10"
                                        )}
                                    >
                                        <option value="">Select Service Type</option>
                                        {serviceTypes.map((type) => (
                                            <option key={type.value} value={type.value}>
                                                {type.label}
                                            </option>
                                        ))}
                                    </select>
                                    {errors.service_type && (
                                        <p className="text-xs text-destructive font-medium flex items-center gap-1">
                                            <AlertCircle className="w-3 h-3" />
                                            {errors.service_type.message}
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-3">
                                    <Label htmlFor="customer_phone" className="font-semibold">Contact Phone *</Label>
                                    <div className="relative">
                                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            id="customer_phone"
                                            {...register("customer_phone")}
                                            placeholder="+233..."
                                            className="pl-9 h-11"
                                        />
                                    </div>
                                    {errors.customer_phone && (
                                        <p className="text-xs text-destructive font-medium flex items-center gap-1">
                                            <AlertCircle className="w-3 h-3" />
                                            {errors.customer_phone.message}
                                        </p>
                                    )}
                                </div>

                                {serviceType === 'towing' && (
                                    <div className="space-y-4 pt-2 p-4 rounded-xl bg-warning/10 dark:bg-warning/10 border border-warning/20 dark:border-warning/30 animate-in zoom-in-95 duration-200">
                                        <div className="space-y-3">
                                            <Label htmlFor="tow_distance_km" className="font-semibold text-warning dark:text-warning">Tow Distance (km) *</Label>
                                            <div className="relative">
                                                <Input
                                                    id="tow_distance_km"
                                                    type="number"
                                                    step="0.1"
                                                    {...register("tow_distance_km", { valueAsNumber: true })}
                                                    placeholder="0"
                                                    className="h-11 border-warning/20 dark:border-warning/30"
                                                />
                                            </div>
                                            {errors.tow_distance_km && (
                                                <p className="text-xs text-destructive font-medium">{errors.tow_distance_km.message}</p>
                                            )}
                                        </div>

                                        {/* Destination — branch picker + custom */}
                                        <div className="space-y-3">
                                            <Label className="font-semibold text-warning dark:text-warning">Destination Location</Label>

                                            {/* Toggle */}
                                            <div className="flex rounded-lg border border-warning/20 dark:border-warning/30 overflow-hidden text-xs">
                                                <button
                                                    type="button"
                                                    onClick={() => setDestinationMode('branch')}
                                                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 transition-colors ${destinationMode === 'branch'
                                                            ? 'bg-primary text-white font-semibold'
                                                            : 'bg-card text-muted-foreground hover:bg-muted'
                                                        }`}
                                                >
                                                    <Building2 className="h-3 w-3" /> Select Branch
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { setDestinationMode('custom'); setValue('destination', ''); }}
                                                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 transition-colors ${destinationMode === 'custom'
                                                            ? 'bg-primary text-white font-semibold'
                                                            : 'bg-card text-muted-foreground hover:bg-muted'
                                                        }`}
                                                >
                                                    <PencilLine className="h-3 w-3" /> Custom Location
                                                </button>
                                            </div>

                                            {destinationMode === 'branch' ? (
                                                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                                                    {branches.length === 0 ? (
                                                        <p className="text-xs text-muted-foreground italic">No branches available.</p>
                                                    ) : branches.map(branch => {
                                                        // Include branch name to guarantee uniqueness if multiple branches share an address
                                                        const destinationText = `${branch.name}${branch.address ? ` - ${branch.address}` : ''}${branch.city ? `, ${branch.city}` : ''}`;
                                                        const isSelected = selectedDestination === destinationText;
                                                        return (
                                                            <button
                                                                key={branch.id}
                                                                type="button"
                                                                onClick={() => setValue('destination', destinationText, { shouldValidate: true })}
                                                                className={`w-full text-left p-2.5 rounded-lg border text-xs transition-all ${isSelected
                                                                        ? 'border-primary bg-primary/10 text-primary font-semibold'
                                                                        : 'border-border bg-card hover:border-warning/40 hover:bg-warning/10 dark:hover:bg-warning/10'
                                                                    }`}
                                                            >
                                                                <div className="flex items-center justify-between">
                                                                    <span className="font-semibold truncate">{branch.name}</span>
                                                                    {isSelected && <Check className="h-3 w-3 shrink-0 ml-1" />}
                                                                </div>
                                                                <div className="text-muted-foreground mt-0.5 truncate">{[branch.address, branch.city].filter(Boolean).join(', ')}</div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <Input
                                                    id="destination"
                                                    {...register("destination")}
                                                    placeholder="Repair shop, home address, etc."
                                                    className="h-11 border-warning/20 dark:border-warning/30"
                                                />
                                            )}
                                        </div>
                                    </div>
                                )}

                                {shouldShowChargeAmount && (
                                    <div className="space-y-3 p-4 rounded-xl bg-muted/50 border border-border">
                                        <Label htmlFor="charge_amount" className="font-semibold">Pay As You Go Charge *</Label>
                                        <Input
                                            id="charge_amount"
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            {...register("charge_amount", { valueAsNumber: true })}
                                            placeholder="0.00"
                                            className="h-11"
                                        />
                                        {errors.charge_amount && (
                                            <p className="text-xs text-destructive font-medium">{errors.charge_amount.message}</p>
                                        )}
                                    </div>
                                )}

                                <div className="space-y-3">
                                    <Label htmlFor="description" className="font-semibold">Technical Findings / Notes</Label>
                                    <Textarea
                                        id="description"
                                        {...register("description")}
                                        placeholder="Briefly describe the vehicle issue..."
                                        rows={4}
                                        className="resize-none"
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <div className="flex flex-col gap-2">
                            <Button
                                type="submit"
                                className="w-full"
                                size="lg"
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? (
                                    <span className="flex items-center gap-2">
                                        <div className="h-4 w-4 rounded-full border-2 border-card border-r-transparent animate-spin" />
                                        Processing...
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        Log Request <ArrowRight className="w-4 h-4" />
                                    </span>
                                )}
                            </Button>
                            <Link href="/roadside" className="w-full">
                                <Button variant="secondary" type="button" className="w-full">Cancel</Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </form>
        </div>
    );
}
