"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { roadsideApi } from "@/lib/api/roadside";
import { customersApi } from "@/lib/api/customers";
import { vehiclesApi } from "@/lib/api/vehicles";
import { subscriptionsApi } from "@/lib/api/subscriptions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    ArrowLeft, MapPin, Phone, AlertCircle,
    Search, Truck, User as UserIcon, Plus,
    Info, Navigation, Check, X,
    Car, Briefcase, Map as MapIcon,
    ArrowRight
} from "lucide-react";
import Link from "next/link";
import { useToast } from "@/lib/hooks/useToast";
import { Textarea } from "@/components/ui/textarea";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect } from "react";

const roadsideRequestSchema = z.object({
    customer: z.number().min(1, "Customer is required"),
    vehicle: z.number().min(1, "Vehicle is required"),
    service_type: z.enum([
        'towing',
        'battery_boost',
        'flat_tyre',
        'key_lockout',
        'emergency_fuel',
        'extrication',
        'mechanical_first_aid',
        'other'
    ]),
    breakdown_location: z.string().min(1, "Breakdown location is required"),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    description: z.string().optional(),
    customer_phone: z.string().min(1, "Phone number is required"),
    tow_distance_km: z.number().min(0).optional(),
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

export default function NewRoadsideRequestDashboardPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialCustomerId = searchParams.get("customer");

    const queryClient = useQueryClient();
    const { toast } = useToast();

    const [customerSearch, setCustomerSearch] = useState("");
    const debouncedCustomerSearch = useDebounce(customerSearch, 500);
    const [serverError, setServerError] = useState<string | null>(null);
    const [isLocating, setIsLocating] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
        watch,
        setValue,
        resetField,
    } = useForm<RoadsideRequestFormData>({
        resolver: zodResolver(roadsideRequestSchema),
        defaultValues: {
            customer: initialCustomerId ? parseInt(initialCustomerId) : undefined,
            service_type: undefined,
        },
    });

    const selectedCustomerId = watch("customer");
    const selectedVehicleId = watch("vehicle");
    const serviceType = watch("service_type");
    const towDistance = watch("tow_distance_km");

    // Fetch customers - if no search, just get regular list
    const { data: customersData, isLoading: isLoadingCustomers } = useQuery({
        queryKey: ["customers", "search", debouncedCustomerSearch],
        queryFn: () => customersApi.list({
            search: debouncedCustomerSearch || undefined,
            page_size: 10,
            status: 'active'
        }),
    });

    const { data: customerVehicles, isLoading: isLoadingVehicles } = useQuery({
        queryKey: ["customer", "vehicles", selectedCustomerId],
        queryFn: () => customersApi.vehicles(selectedCustomerId!),
        enabled: !!selectedCustomerId,
    });

    const selectedCustomer = customersData?.results.find(c => c.id === selectedCustomerId);

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

    const activeSubscription = activeSubscriptionData?.results?.[0];

    const createMutation = useMutation({
        mutationFn: (data: RoadsideRequestFormData) => roadsideApi.create(data),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["roadside"] });
            toast({
                title: "Request Created",
                description: `Roadside request ${data.request_number} has been created successfully.`,
            });
            router.push(`/roadside/${data.id}`);
        },
        onError: (error: any) => {
            const errorMessage = error.response?.data?.detail ||
                Object.values(error.response?.data || {}).flat().join(", ") ||
                "Failed to create request";
            setServerError(errorMessage);
        },
    });

    const getCurrentLocation = () => {
        if (!navigator.geolocation) {
            toast({
                title: "Not Supported",
                description: "Geolocation is not supported by your browser",
                variant: "destructive"
            });
            return;
        }

        setIsLocating(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = parseFloat(position.coords.latitude.toFixed(6));
                const lng = parseFloat(position.coords.longitude.toFixed(6));
                setValue("latitude", lat);
                setValue("longitude", lng);
                setIsLocating(false);
                toast({
                    title: "Location Updated",
                    description: `Coordinates: ${lat}, ${lng}`
                });
            },
            (error) => {
                setIsLocating(false);
                toast({
                    title: "Error",
                    description: "Could not get your current location",
                    variant: "destructive"
                });
            }
        );
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

    const onSubmit = (data: RoadsideRequestFormData) => {
        setServerError(null);

        // Final check: round coordinates to 6 decimal places to satisfy backend DecimalField(9, 6)
        const submissionData = {
            ...data,
            latitude: (typeof data.latitude === 'number' && !isNaN(data.latitude))
                ? parseFloat(data.latitude.toFixed(6))
                : undefined,
            longitude: (typeof data.longitude === 'number' && !isNaN(data.longitude))
                ? parseFloat(data.longitude.toFixed(6))
                : undefined,
        };

        createMutation.mutate(submissionData);
    };

    const serviceTypes = [
        { value: 'towing', label: 'Towing Service' },
        { value: 'battery_boost', label: 'Battery Boost' },
        { value: 'flat_tyre', label: 'Flat Tyre Service' },
        { value: 'key_lockout', label: 'Key Lock Out' },
        { value: 'emergency_fuel', label: 'Emergency Fuel Delivery' },
        { value: 'extrication', label: 'Extrication Service' },
        { value: 'mechanical_first_aid', label: 'Mechanical & Electrical First Aid' },
        { value: 'other', label: 'Other' },
    ];

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-12">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <Link href="/roadside">
                        <Button variant="secondary">
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">New Roadside Request</h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Log a new breakdown assistance request</p>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {serverError && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 p-4 rounded-lg flex items-start gap-2">
                        <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                        <p className="text-sm">{serverError}</p>
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
                                        <Label htmlFor="customer_search" className="font-semibold">Search Customer *</Label>
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                id="customer_search"
                                                placeholder="Name, Phone, or Customer #"
                                                value={customerSearch}
                                                onChange={(e) => setCustomerSearch(e.target.value)}
                                                className="pl-9 h-11 border-gray-200 dark:border-gray-700"
                                            />
                                            {isLoadingCustomers && <div className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-primary border-r-transparent animate-spin" />}
                                        </div>
                                        <div className="relative">
                                            <select
                                                id="customer"
                                                className={cn(
                                                    "w-full px-3 py-2.5 border rounded-lg bg-white dark:bg-gray-800 transition-all",
                                                    errors.customer ? "border-red-500 ring-red-500/10" : "border-gray-200 dark:border-gray-700 focus:ring-blue-500/10"
                                                )}
                                                value={selectedCustomerId || ""}
                                                onChange={(e) => {
                                                    const id = parseInt(e.target.value);
                                                    if (!isNaN(id)) {
                                                        setValue("customer", id, { shouldValidate: true });
                                                        const cust = customersData?.results.find(c => c.id === id);
                                                        if (cust?.phone) setValue("customer_phone", cust.phone);
                                                        resetField("vehicle");
                                                    } else {
                                                        setValue("customer", 0);
                                                    }
                                                }}
                                            >
                                                <option value="">
                                                    {isLoadingCustomers ? "Loading customers..." : "-- Choose Customer --"}
                                                </option>
                                                {customersData?.results.map(c => (
                                                    <option key={c.id} value={c.id}>
                                                        {c.full_name || c.company_name} ({c.customer_number})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        {errors.customer && (
                                            <p className="text-xs text-red-600 font-medium flex items-center gap-1">
                                                <AlertCircle className="w-3 h-3" />
                                                {errors.customer.message}
                                            </p>
                                        )}
                                    </div>

                                    <div className="space-y-3">
                                        <Label htmlFor="vehicle" className="font-semibold">Select Vehicle *</Label>
                                        <div className="relative">
                                            <select
                                                id="vehicle"
                                                {...register("vehicle", { valueAsNumber: true })}
                                                disabled={!selectedCustomerId || isLoadingVehicles}
                                                className={cn(
                                                    "w-full h-11 px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 transition-all disabled:opacity-50",
                                                    errors.vehicle ? "border-red-500 ring-red-500/10" : "border-gray-200 dark:border-gray-700 focus:ring-blue-500/10"
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
                                            <p className="text-xs text-red-600 font-medium flex items-center gap-1">
                                                <AlertCircle className="w-3 h-3" />
                                                {errors.vehicle.message}
                                            </p>
                                        )}
                                        {!selectedCustomerId && (
                                            <p className="text-xs text-amber-600 font-medium px-1">← Select a customer first</p>
                                        )}
                                        {selectedCustomerId && !isLoadingVehicles && customerVehicles?.length === 0 && (
                                            <p className="text-xs text-red-600 font-medium px-1">This customer has no vehicles registered.</p>
                                        )}
                                    </div>
                                </div>

                                {selectedCustomer && (
                                    <div className="mt-4 p-4 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/50 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-700 dark:text-blue-300">
                                                    <UserIcon className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-gray-900 dark:text-gray-100">{selectedCustomer.full_name || selectedCustomer.company_name}</h4>
                                                    <p className="text-xs text-gray-500">{selectedCustomer.customer_number} • {selectedCustomer.phone || "No phone"}</p>
                                                </div>
                                            </div>
                                            <Badge variant="secondary" className="bg-white dark:bg-gray-800">Verified</Badge>
                                        </div>

                                        {selectedVehicleId && (
                                            <div className="pt-3 border-t border-blue-100 dark:border-blue-900/30">
                                                {isLoadingSubscription ? (
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                        <div className="h-3 w-3 rounded-full border-2 border-primary border-r-transparent animate-spin" />
                                                        Checking subscription coverage...
                                                    </div>
                                                ) : activeSubscription ? (
                                                    <div className="flex items-center justify-between text-sm">
                                                        <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-medium">
                                                            <Check className="w-4 h-4" />
                                                            <span>Active Subscription: {activeSubscription.package_name || "Standard Coverage"}</span>
                                                        </div>
                                                        <Badge variant="success" className="bg-green-100 text-green-800 border-green-200">Covered</Badge>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-between text-sm">
                                                        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-medium">
                                                            <Info className="w-4 h-4" />
                                                            <span>No Active Subscription Found</span>
                                                        </div>
                                                        <Badge variant="warning" className="bg-amber-100 text-amber-800 border-amber-200">Pay-Per-Use</Badge>
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
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <MapIcon className="w-4 h-4" />
                                    Location Information
                                </CardTitle>
                                <CardDescription className="text-xs">Where did the breakdown happen?</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="breakdown_location" className="font-semibold">Breakdown Location *</Label>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            type="button"
                                            onClick={getCurrentLocation}
                                            disabled={isLocating}
                                            className="h-8 text-xs gap-2"
                                        >
                                            {isLocating ? <div className="h-3 w-3 rounded-full border-2 border-primary border-r-transparent animate-spin" /> : <Navigation className="w-3 h-3" />}
                                            Get Current Location
                                        </Button>
                                    </div>
                                    <div className="relative">
                                        <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                        <Textarea
                                            id="breakdown_location"
                                            {...register("breakdown_location")}
                                            placeholder="Street name, landmark, City or GPS location..."
                                            className="pl-9 min-h-[80px]"
                                        />
                                    </div>
                                    {errors.breakdown_location && (
                                        <p className="text-xs text-red-600 font-medium flex items-center gap-1">
                                            <AlertCircle className="w-3 h-3" />
                                            {errors.breakdown_location.message}
                                        </p>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="latitude" className="text-xs font-medium text-gray-500">Latitude (Optional)</Label>
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
                                        <Label htmlFor="longitude" className="text-xs font-medium text-gray-500">Longitude (Optional)</Label>
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
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm flex items-center gap-2">
                                    <Truck className="w-4 h-4" />
                                    Service Configuration
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="space-y-3">
                                    <Label htmlFor="service_type" className="font-semibold">Service Type *</Label>
                                    <select
                                        id="service_type"
                                        {...register("service_type")}
                                        className={cn(
                                            "w-full h-11 px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 transition-all",
                                            errors.service_type ? "border-red-500 ring-red-500/10" : "border-gray-200 dark:border-gray-700 focus:ring-blue-500/10"
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
                                        <p className="text-xs text-red-600 font-medium flex items-center gap-1">
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
                                        <p className="text-xs text-red-600 font-medium flex items-center gap-1">
                                            <AlertCircle className="w-3 h-3" />
                                            {errors.customer_phone.message}
                                        </p>
                                    )}
                                </div>

                                {serviceType === 'towing' && (
                                    <div className="space-y-4 pt-2 p-4 rounded-xl bg-orange-50/30 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/50 animate-in zoom-in-95 duration-200">
                                        <div className="space-y-3">
                                            <Label htmlFor="tow_distance_km" className="font-semibold text-orange-800 dark:text-orange-400">Tow Distance (km) *</Label>
                                            <div className="relative">
                                                <Input
                                                    id="tow_distance_km"
                                                    type="number"
                                                    step="0.1"
                                                    {...register("tow_distance_km", { valueAsNumber: true })}
                                                    placeholder="0"
                                                    className="h-11 border-orange-200 dark:border-orange-800"
                                                />
                                            </div>
                                            {errors.tow_distance_km && (
                                                <p className="text-xs text-red-600 font-medium">{errors.tow_distance_km.message}</p>
                                            )}
                                        </div>
                                        <div className="space-y-3">
                                            <Label htmlFor="destination" className="font-semibold text-orange-800 dark:text-orange-400">Destination Location</Label>
                                            <Input
                                                id="destination"
                                                {...register("destination")}
                                                placeholder="Repair Shop, Home, etc."
                                                className="h-11 border-orange-200 dark:border-orange-800"
                                            />
                                        </div>
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

                                <div className="pt-2">
                                    <div className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800">
                                        <Info className="h-5 w-5 text-blue-600 mt-0.5" />
                                        <div className="space-y-1">
                                            <p className="text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">Policy Check</p>
                                            <p className="text-[11px] text-gray-500 leading-relaxed">System will auto-check AA Membership during submission and apply covered benefits immediately.</p>
                                        </div>
                                    </div>
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
                                        <div className="h-4 w-4 rounded-full border-2 border-white border-r-transparent animate-spin" />
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
