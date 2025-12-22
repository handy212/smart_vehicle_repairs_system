"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { roadsideApi, RoadsideRequestCreate } from "@/lib/api/roadside";
import { vehiclesApi } from "@/lib/api/vehicles";
import { authApi } from "@/lib/api/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, MapPin, Phone, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { Textarea } from "@/components/ui/textarea";

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
  } = useForm<RoadsideRequestFormData>({
    resolver: zodResolver(roadsideRequestSchema),
    defaultValues: {
      customer_phone: user?.phone || "",
    },
  });

  const serviceType = watch("service_type");
  const selectedVehicle = watch("vehicle");

  // Get current location
  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setValue("latitude", position.coords.latitude);
          setValue("longitude", position.coords.longitude);
          toast({
            title: "Location captured",
            description: "Your current location has been set",
          });
        },
        (error) => {
          toast({
            title: "Location error",
            description: "Could not get your location. Please enter it manually.",
            variant: "destructive",
          });
        }
      );
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
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/portal/roadside">
          <Button variant="secondary" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Request Roadside Assistance</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
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
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              <select
                id="service_type"
                {...register("service_type")}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select service type</option>
                {serviceTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
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
                  className="flex items-center gap-2"
                >
                  <MapPin className="w-4 h-4" />
                  Use Current Location
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
