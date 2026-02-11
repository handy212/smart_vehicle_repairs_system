"use client";

import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { roadsideApi, RoadsideRequestCreate } from "@/lib/api/roadside";
import { subscriptionsApi } from "@/lib/api/subscriptions";
import { vehiclesApi } from "@/lib/api/vehicles";
import { authApi } from "@/lib/api/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, MapPin, Phone, AlertCircle, Truck, Battery, Disc, Key, Droplet, AlertTriangle, Wrench, MoreHorizontal, Car, Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils/cn";

const roadsideRequestSchema = z.object({
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

export default function NewRoadsideRequestPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);

  const { data: user } = useQuery({
    queryKey: ["user"],
    queryFn: () => authApi.getCurrentUser(),
  });

  const customerId = user?.customer_profile?.id || (user as any)?.customer?.id;

  const { data: vehicles } = useQuery({
    queryKey: ["portal", "vehicles", customerId],
    queryFn: () => vehiclesApi.list({ owner: customerId, status: "active" }),
    enabled: !!customerId,
  });



  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
    control,
  } = useForm<RoadsideRequestFormData>({
    resolver: zodResolver(roadsideRequestSchema),
    defaultValues: {
      customer_phone: user?.phone || "",
    },
  });

  const serviceType = watch("service_type");
  const selectedVehicle = watch("vehicle");

  const { data: vehicleSubscriptions } = useQuery({
    queryKey: ["subscriptions", "vehicle", selectedVehicle],
    queryFn: () => subscriptionsApi.list({ vehicle: selectedVehicle, status: "active" }),
    enabled: !!selectedVehicle,
  });

  // Get the first active subscription for the vehicle (should be unique per vehicle)
  const activeSubscription = vehicleSubscriptions?.results?.[0];

  const [isLocating, setIsLocating] = useState(false);

  // Get current location
  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setValue("latitude", position.coords.latitude);
          setValue("longitude", position.coords.longitude);
          // Set the visible input field so the user knows something happened
          setValue("breakdown_location", `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`, { shouldValidate: true });
          setIsLocating(false);
          toast({
            title: "Location captured",
            description: "Your current location has been set",
          });
        },
        (error) => {
          setIsLocating(false);
          toast({
            title: "Location error",
            description: "Could not get your location. Please enter it manually.",
            variant: "destructive",
          });
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    } else {
      toast({
        title: "Not Supported",
        description: "Geolocation is not supported by your browser",
        variant: "destructive",
      });
    }
  };

  const createMutation = useMutation({
    mutationFn: (data: RoadsideRequestFormData) => {
      if (!customerId) {
        throw new Error("Customer profile not found");
      }
      const requestData: RoadsideRequestCreate = {
        customer: customerId,
        vehicle: data.vehicle,
        service_type: data.service_type,
        breakdown_location: data.breakdown_location,
        latitude: data.latitude ? Number(data.latitude.toFixed(6)) : undefined,
        longitude: data.longitude ? Number(data.longitude.toFixed(6)) : undefined,
        description: data.description,
        customer_phone: data.customer_phone,
        tow_distance_km: data.tow_distance_km,
        destination: data.destination,
        notes: data.notes,
      };
      return roadsideApi.create(requestData);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["portal", "roadside"] });
      toast({
        title: "Request Submitted!",
        description: "Your roadside assistance request has been received. We'll dispatch help shortly.",
      });
      router.push(`/portal/roadside/${data.id}`);
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.detail ||
        error.response?.data?.message ||
        Object.values(error.response?.data || {}).flat().join(", ") ||
        "Failed to submit request. Please try again.";
      setServerError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: RoadsideRequestFormData) => {
    setServerError(null);
    createMutation.mutate(data);
  };

  const onError = (errors: any) => {
    const missingFields = Object.keys(errors).map(field => {
      if (field === 'vehicle') return 'Vehicle';
      if (field === 'service_type') return 'Service Type';
      if (field === 'breakdown_location') return 'Location';
      if (field === 'customer_phone') return 'Phone';
      if (field === 'tow_distance_km') return 'Tow Distance';
      return field;
    }).join(', ');

    toast({
      title: "Please check the form",
      description: `Missing or invalid fields: ${missingFields}`,
      variant: "destructive",
    });
  };

  const serviceTypes = [
    { value: 'towing', label: 'Towing Service', icon: Truck },
    { value: 'battery_boost', label: 'Battery Boost', icon: Battery },
    { value: 'flat_tyre', label: 'Flat Tyre Service', icon: Disc },
    { value: 'key_lockout', label: 'Key Lock Out', icon: Key },
    { value: 'emergency_fuel', label: 'Emergency Fuel', icon: Droplet },
    { value: 'extrication', label: 'Extrication', icon: AlertTriangle },
    { value: 'mechanical_first_aid', label: 'Mechanical', icon: Wrench },
    { value: 'other', label: 'Other', icon: MoreHorizontal },
  ];

  const serviceToAllowanceMap: Record<string, string> = {
    towing: 'towing_services_km',
    battery_boost: 'battery_boosts',
    flat_tyre: 'flat_tyre_service',
    key_lockout: 'key_lock_out',
    emergency_fuel: 'emergency_fuel',
    extrication: 'extrication',
    mechanical_first_aid: 'roadside_first_aid',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/portal/roadside">
          <Button variant="secondary" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Request Roadside Assistance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Submit a request for roadside assistance. We'll dispatch help as soon as possible.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Service Request Details</CardTitle>
          <CardDescription>
            Provide details about your breakdown and location
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit, onError)} className="space-y-6">
            {serverError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 p-4 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Error</p>
                  <p className="text-sm">{serverError}</p>
                </div>
              </div>
            )}

            {/* Vehicle Selection */}
            <div>
              <Label htmlFor="vehicle">Vehicle *</Label>
              <select
                id="vehicle"
                {...register("vehicle", { valueAsNumber: true })}
                className={cn(
                  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                  errors.vehicle ? "border-red-500" : ""
                )}
              >
                <option value="">Select a vehicle</option>
                {vehicles?.results?.map((vehicle: any) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.year} {vehicle.make} {vehicle.model} {vehicle.license_plate ? `(${vehicle.license_plate})` : ''}
                  </option>
                ))}
              </select>
              {errors.vehicle && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.vehicle.message}</p>
              )}
            </div>

            {/* Service Type */}
            <div>
              <Label htmlFor="service_type">Service Type *</Label>
              <Controller
                control={control}
                name="service_type"
                render={({ field }) => (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {serviceTypes.map((type) => {
                      const Icon = type.icon;
                      const isSelected = field.value === type.value;

                      // Check allowance
                      let isDisabled = false;
                      let allowanceText = null;
                      let isPayAsYouGo = false;

                      if (activeSubscription && activeSubscription.remaining_allowances) {
                        const allowanceKey = serviceToAllowanceMap[type.value];
                        if (allowanceKey) {
                          const remaining = activeSubscription.remaining_allowances[allowanceKey];
                          if (remaining === 0) {
                            // Previously disabled, now allowed as Pay-As-You-Go
                            isPayAsYouGo = true;
                            allowanceText = "0 Left (Chargeable)";
                          } else if (remaining !== undefined) {
                            allowanceText = type.value === 'towing' ? `${remaining}km left` : `${remaining} left`;
                          }
                        } else if (type.value !== 'other') {
                          // Not in allowances -> Not covered -> Pay-As-You-Go
                          const key = serviceToAllowanceMap[type.value];
                          if (key && activeSubscription.remaining_allowances[key] === undefined) {
                            isPayAsYouGo = true;
                            allowanceText = "Pay-As-You-Go";
                          }
                        }
                      }

                      return (
                        <div
                          key={type.value}
                          onClick={() => !isDisabled && field.onChange(type.value)}
                          className={cn(
                            "cursor-pointer rounded-lg border-2 p-4 flex flex-col items-center gap-3 transition-all relative",
                            isDisabled
                              ? "border-muted bg-border opacity-60 cursor-not-allowed"
                              : isSelected
                                ? isPayAsYouGo
                                  ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20 shadow-sm"
                                  : "border-primary bg-primary/5 dark:bg-primary/10 shadow-sm"
                                : isPayAsYouGo
                                  ? "border-dashed border-amber-300 bg-amber-50/30 hover:bg-amber-50 hover:border-amber-400 dark:border-amber-800 dark:bg-amber-950/10"
                                  : "border-muted bg-card hover:border-primary/50"
                          )}
                        >
                          <div className={cn(
                            "p-2 rounded-full",
                            isSelected
                              ? isPayAsYouGo ? "bg-amber-500 text-white" : "bg-primary text-primary-foreground"
                              : "bg-secondary text-secondary-foreground"
                          )}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <span className="text-sm font-medium text-center leading-tight">{type.label}</span>
                          {allowanceText && (
                            <span className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                              isDisabled
                                ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                                : isPayAsYouGo
                                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                  : "bg-green-100 text-success dark:bg-green-900/30 dark:text-green-400"
                            )}>
                              {allowanceText}
                            </span>
                          )}
                          {isSelected && <div className="absolute top-2 right-2 text-primary"><Check className="w-4 h-4" /></div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              />
              {errors.service_type && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.service_type.message}</p>
              )}
            </div>

            {/* Breakdown Location */}
            <div>
              <Label htmlFor="breakdown_location">Breakdown Location *</Label>
              <div className="flex gap-2">
                <Input
                  id="breakdown_location"
                  {...register("breakdown_location")}
                  placeholder="e.g., Accra-Tema Motorway, KM 15"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={getCurrentLocation}
                  disabled={isLocating}
                  className="flex items-center gap-2"
                >
                  <MapPin className={cn("w-4 h-4", isLocating && "animate-pulse")} />
                  {isLocating ? "Locating..." : "Use Current Location"}
                </Button>
              </div>
              {errors.breakdown_location && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.breakdown_location.message}</p>
              )}
            </div>

            {/* Description */}
            <div>
              <Label htmlFor="description">Problem Description</Label>
              <Textarea
                id="description"
                {...register("description")}
                placeholder="Describe the problem with your vehicle..."
                rows={4}
              />
              {errors.description && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.description.message}</p>
              )}
            </div>

            {/* Customer Phone */}
            <div>
              <Label htmlFor="customer_phone">Contact Phone Number *</Label>
              <Input
                id="customer_phone"
                type="tel"
                {...register("customer_phone")}
                placeholder="+233241234567"
                className="flex items-center gap-2"
              />
              {errors.customer_phone && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.customer_phone.message}</p>
              )}
            </div>

            {/* Towing Specific Fields */}
            {serviceType === 'towing' && (
              <>
                <div>
                  <Label htmlFor="tow_distance_km">Tow Distance (km) *</Label>
                  <Input
                    id="tow_distance_km"
                    type="number"
                    step="0.1"
                    min="0"
                    {...register("tow_distance_km", { valueAsNumber: true })}
                    placeholder="25.5"
                  />
                  {errors.tow_distance_km && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.tow_distance_km.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="destination">Destination</Label>
                  <Input
                    id="destination"
                    {...register("destination")}
                    placeholder="e.g., AAPL Service Center, Awudome Estates"
                  />
                  {errors.destination && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.destination.message}</p>
                  )}
                </div>
              </>
            )}

            {/* Notes */}
            <div>
              <Label htmlFor="notes">Additional Notes</Label>
              <Textarea
                id="notes"
                {...register("notes")}
                placeholder="Any additional information..."
                rows={3}
              />
            </div>

            <div className="flex items-center justify-end gap-4 pt-4 border-t">
              <Link href="/portal/roadside">
                <Button type="button" variant="secondary">Cancel</Button>
              </Link>
              <Button type="submit" disabled={isSubmitting || createMutation.isPending}>
                {isSubmitting || createMutation.isPending ? "Submitting..." : "Submit Request"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
