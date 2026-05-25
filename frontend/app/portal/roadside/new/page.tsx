"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { roadsideApi, RoadsideRequestCreate } from "@/lib/api/roadside";
import { subscriptionsApi } from "@/lib/api/subscriptions";
import { vehiclesApi } from "@/lib/api/vehicles";
import { authApi } from "@/lib/api/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  MapPin,
  Phone,
  AlertCircle,
  Truck,
  Battery,
  Disc,
  Key,
  Droplet,
  AlertTriangle,
  Wrench,
  MoreHorizontal,
  Check,
  Navigation,
  Car,
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils/cn";
import { getApiErrorMessage } from "@/lib/api/errors";
import { RoadsideBranchSelect } from "@/components/roadside/RoadsideBranchSelect";
import { PortalPageHeader } from "../../components/PortalPageHeader";
import { captureCurrentPosition, getGeolocationErrorMessage } from "@/lib/utils/geolocation";

const roadsideRequestSchema = z.object({
  branch: z.number().min(1, "Service branch is required"),
  vehicle: z.number().min(1, "Vehicle is required"),
  service_type: z.enum([
    "towing",
    "battery_boost",
    "flat_tyre",
    "key_lockout",
    "emergency_fuel",
    "extrication",
    "mechanical_first_aid",
    "accident_estimate",
    "pre_purchase_inspection",
    "other",
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
  if (data.service_type === "towing") {
    return data.tow_distance_km !== undefined && data.tow_distance_km > 0;
  }
  return true;
}, {
  message: "Tow distance is required for towing service",
  path: ["tow_distance_km"],
});

type RoadsideRequestFormData = z.infer<typeof roadsideRequestSchema>;

const serviceTypes = [
  { value: "towing", label: "Towing", icon: Truck },
  { value: "battery_boost", label: "Battery", icon: Battery },
  { value: "flat_tyre", label: "Flat tyre", icon: Disc },
  { value: "key_lockout", label: "Lockout", icon: Key },
  { value: "emergency_fuel", label: "Fuel", icon: Droplet },
  { value: "extrication", label: "Extrication", icon: AlertTriangle },
  { value: "mechanical_first_aid", label: "Mechanical", icon: Wrench },
  { value: "accident_estimate", label: "Accident est.", icon: AlertCircle },
  { value: "pre_purchase_inspection", label: "Pre-purchase", icon: AlertCircle },
  { value: "other", label: "Other", icon: MoreHorizontal },
] as const;

const serviceToAllowanceMap: Record<string, string> = {
  towing: "towing_services_km",
  battery_boost: "battery_boosts",
  flat_tyre: "flat_tyre_service",
  key_lockout: "key_lock_out",
  emergency_fuel: "emergency_fuel",
  extrication: "extrication",
  mechanical_first_aid: "roadside_first_aid",
  accident_estimate: "accident_estimate",
  pre_purchase_inspection: "pre_purchase_inspection",
};

export default function NewRoadsideRequestPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const { data: user } = useQuery({
    queryKey: ["user"],
    queryFn: () => authApi.getCurrentUser(),
  });

  const customerId = user?.customer_profile?.id || (user as { customer?: { id: number } })?.customer?.id;

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

  const activeSubscription =
    vehicleSubscriptions?.results?.find((s) => s.is_active_status) || null;
  const pendingActivationSubscription =
    vehicleSubscriptions?.results?.find((s) => !s.is_active_status) || null;

  const getCurrentLocation = async () => {
    setIsLocating(true);
    try {
      const { latitude, longitude, label } = await captureCurrentPosition();
      setValue("latitude", latitude);
      setValue("longitude", longitude);
      setValue("breakdown_location", label, { shouldValidate: true });
      toast({
        title: "Location captured",
        description: "Your breakdown location has been filled in.",
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

  const createMutation = useMutation({
    mutationFn: (data: RoadsideRequestFormData) => {
      if (!customerId) {
        throw new Error("Customer profile not found");
      }
      const requestData: RoadsideRequestCreate = {
        branch: data.branch,
        vehicle: data.vehicle,
        service_type: data.service_type,
        breakdown_location: data.breakdown_location,
        latitude: data.latitude,
        longitude: data.longitude,
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
        title: "Request submitted",
        description: "We received your request and will dispatch help shortly.",
      });
      router.push(`/portal/roadside/${data.id}`);
    },
    onError: (error: unknown) => {
      const errorMessage = getApiErrorMessage(error, "Failed to submit request. Please try again.");
      setServerError(errorMessage);
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    },
  });

  const onSubmit = (data: RoadsideRequestFormData) => {
    setServerError(null);
    createMutation.mutate(data);
  };

  const onError = (formErrors: Record<string, { message?: string }>) => {
    const missingFields = Object.keys(formErrors)
      .map((field) => {
        if (field === "branch") return "Service branch";
        if (field === "vehicle") return "Vehicle";
        if (field === "service_type") return "Service type";
        if (field === "breakdown_location") return "Location";
        if (field === "customer_phone") return "Phone";
        if (field === "tow_distance_km") return "Tow distance";
        return field;
      })
      .join(", ");

    toast({
      title: "Please check the form",
      description: `Missing or invalid: ${missingFields}`,
      variant: "destructive",
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-10">
      <PortalPageHeader
        title="Roadside assistance"
        description="Tell us where you are and what you need. We route your request to the right branch."
        action={
          <Link href="/portal/roadside">
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        }
      />

      <form onSubmit={handleSubmit(onSubmit, onError)} className="space-y-5">
        {serverError && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex gap-2"
          >
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{serverError}</span>
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Car className="h-4 w-4 text-primary" />
              Vehicle & contact
            </CardTitle>
            <CardDescription>Which vehicle needs help and how we can reach you</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="vehicle">Vehicle *</Label>
              <select
                id="vehicle"
                {...register("vehicle", { valueAsNumber: true })}
                className={cn(
                  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                  errors.vehicle && "border-destructive"
                )}
              >
                <option value="">Select vehicle</option>
                {vehicles?.results?.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.year} {vehicle.make} {vehicle.model}
                    {vehicle.license_plate ? ` (${vehicle.license_plate})` : ""}
                  </option>
                ))}
              </select>
              {errors.vehicle && (
                <p className="text-xs text-destructive">{errors.vehicle.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customer_phone" className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                Phone *
              </Label>
              <Input
                id="customer_phone"
                type="tel"
                {...register("customer_phone")}
                placeholder="+233241234567"
              />
              {errors.customer_phone && (
                <p className="text-xs text-destructive">{errors.customer_phone.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Service needed *</CardTitle>
            <CardDescription>Select the type of roadside help</CardDescription>
          </CardHeader>
          <CardContent>
            <Controller
              control={control}
              name="service_type"
              render={({ field }) => (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                  {serviceTypes.map((type) => {
                    const Icon = type.icon;
                    const isSelected = field.value === type.value;
                    let allowanceText: string | null = null;
                    let isPayAsYouGo = false;

                    if (activeSubscription?.remaining_allowances) {
                      const allowanceKey = serviceToAllowanceMap[type.value];
                      if (allowanceKey) {
                        const remaining = activeSubscription.remaining_allowances[allowanceKey];
                        if (remaining === 0) {
                          isPayAsYouGo = true;
                          allowanceText = "Chargeable";
                        } else if (remaining !== undefined) {
                          allowanceText =
                            type.value === "towing" ? `${remaining} km` : `${remaining} left`;
                        }
                      }
                    } else if (pendingActivationSubscription) {
                      isPayAsYouGo = true;
                      allowanceText = "Pending";
                    }

                    return (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => field.onChange(type.value)}
                        className={cn(
                          "rounded-lg border p-2.5 flex flex-col items-center gap-1.5 text-center transition-colors relative",
                          isSelected
                            ? isPayAsYouGo
                              ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30"
                              : "border-primary bg-primary/5"
                            : "border-border bg-card hover:border-primary/40"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="text-[11px] font-medium leading-tight">{type.label}</span>
                        {allowanceText && (
                          <span className="text-[9px] text-muted-foreground">{allowanceText}</span>
                        )}
                        {isSelected && (
                          <Check className="absolute top-1 right-1 h-3 w-3 text-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            />
            {errors.service_type && (
              <p className="mt-2 text-xs text-destructive">{errors.service_type.message}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  Location
                </CardTitle>
                <CardDescription>Branch and where the vehicle is stranded</CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={getCurrentLocation}
                disabled={isLocating}
                className="h-8 gap-1.5 text-xs shrink-0"
              >
                <Navigation className={cn("h-3.5 w-3.5", isLocating && "animate-pulse")} />
                {isLocating ? "Locating…" : "Use my location"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Controller
              control={control}
              name="branch"
              render={({ field }) => (
                <RoadsideBranchSelect
                  variant="inline"
                  id="portal-roadside-branch"
                  value={field.value}
                  onChange={(id) => field.onChange(id)}
                  error={errors.branch?.message}
                />
              )}
            />
            <div className="space-y-1.5">
              <Label htmlFor="breakdown_location" className="text-sm font-medium">
                Breakdown location *
              </Label>
              <Input
                id="breakdown_location"
                {...register("breakdown_location")}
                placeholder="Street, landmark, or motorway marker"
                className={errors.breakdown_location ? "border-destructive" : ""}
              />
              {errors.breakdown_location && (
                <p className="text-xs text-destructive">{errors.breakdown_location.message}</p>
              )}
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="description" className="text-sm font-medium">
                Problem description
              </Label>
              <Textarea
                id="description"
                {...register("description")}
                placeholder="Briefly describe what happened…"
                rows={3}
                className="resize-none"
              />
            </div>
          </CardContent>
        </Card>

        {serviceType === "towing" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Towing details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tow_distance_km">Distance (km) *</Label>
                <Input
                  id="tow_distance_km"
                  type="number"
                  step="0.1"
                  min="0"
                  {...register("tow_distance_km", { valueAsNumber: true })}
                  placeholder="25"
                />
                {errors.tow_distance_km && (
                  <p className="text-xs text-destructive">{errors.tow_distance_km.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="destination">Destination</Label>
                <Input
                  id="destination"
                  {...register("destination")}
                  placeholder="Where the vehicle should be towed"
                />
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-6">
            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-sm font-medium">
                Additional notes
              </Label>
              <Textarea
                id="notes"
                {...register("notes")}
                placeholder="Optional details for the dispatcher"
                rows={2}
                className="resize-none"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-2">
          <Link href="/portal/roadside">
            <Button type="button" variant="outline" className="w-full sm:w-auto">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            className="w-full sm:w-auto"
            disabled={isSubmitting || createMutation.isPending}
          >
            {isSubmitting || createMutation.isPending ? "Submitting…" : "Submit request"}
          </Button>
        </div>
      </form>
    </div>
  );
}
