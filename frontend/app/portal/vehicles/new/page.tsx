"use client";

import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { vehiclesApi } from "@/lib/api/vehicles";
import { authApi } from "@/lib/api/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AxiosError } from "axios";
import { useToast } from "@/lib/hooks/useToast";
import { VINDecoderButton } from "@/components/ui/vin-decoder-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils/cn";

const vehicleSchema = z.object({
  vin: z.string().min(17, "VIN must be 17 characters").max(17, "VIN must be 17 characters"),
  make: z.string().min(1, "Make is required"),
  model: z.string().min(1, "Model is required"),
  year: z.number().min(1900).max(new Date().getFullYear() + 1),
  license_plate: z.string().optional(),
  exterior_color: z.string().optional(),
  current_mileage: z.number().min(0).optional(),
  engine_type: z.enum(["gasoline", "diesel", "electric", "hybrid", "plug_in_hybrid"]).optional(),
  status: z.enum(["active", "in_service", "sold", "totaled", "inactive"]),
});

type VehicleFormData = z.infer<typeof vehicleSchema>;

export default function AddVehiclePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const [vinOtherInfo, setVinOtherInfo] = useState<any | null>(null);

  const { data: user } = useQuery({
    queryKey: ["user"],
    queryFn: () => authApi.getCurrentUser(),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    setError,
    watch,
    control,
  } = useForm<VehicleFormData>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      status: "active",
      engine_type: "gasoline",
      current_mileage: 0,
      year: new Date().getFullYear(),
    },
  });

  const vinValue = watch("vin");

  const handleVinDecode = (decodedData: {
    year?: number;
    make?: string;
    model?: string;
    trim?: string;
    engine_type?: string;
    engine_size?: string;
    transmission_type?: string;
    vin_other_information?: any;
  }) => {
    if (decodedData.year) setValue("year", decodedData.year);
    if (decodedData.make) setValue("make", decodedData.make);
    if (decodedData.model) setValue("model", decodedData.model);
    if (decodedData.engine_type) setValue("engine_type", decodedData.engine_type as any);
    if (decodedData.vin_other_information) setVinOtherInfo(decodedData.vin_other_information);
  };

  const createMutation = useMutation({
    mutationFn: (data: VehicleFormData) => {
      const customerId = (user as any)?.customer_profile?.id || (user as any)?.customer?.id;
      if (!customerId) {
        throw new Error("Customer profile not found");
      }
      return vehiclesApi.create({
        ...data,
        owner: customerId,
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["portal", "dashboard"] });
      toast({
        title: "Vehicle Added!",
        description: "Your vehicle has been registered successfully.",
      });
      router.push("/portal/vehicles");
    },
    onError: (error: any) => {
      console.error("Error creating vehicle:", error);

      if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data;

        // Handle field-level errors
        Object.keys(errorData).forEach((field) => {
          if (field !== 'non_field_errors' && field !== 'detail') {
            const fieldError = Array.isArray(errorData[field])
              ? errorData[field][0]
              : errorData[field];
            setError(field as keyof VehicleFormData, {
              type: "server",
              message: fieldError
            });
          }
        });

        // Handle non-field errors
        if (errorData.non_field_errors) {
          const nonFieldError = Array.isArray(errorData.non_field_errors)
            ? errorData.non_field_errors[0]
            : errorData.non_field_errors;
          setServerError(nonFieldError);
        } else if (typeof errorData === 'string') {
          setServerError(errorData);
        } else if (errorData.detail) {
          setServerError(errorData.detail);
        } else {
          setServerError("An error occurred while registering the vehicle. Please check the form and try again.");
        }
      } else {
        setServerError("An unexpected error occurred. Please try again.");
      }
    },
  });

  const onSubmit = async (data: VehicleFormData) => {
    setServerError(null);
    try {
      await createMutation.mutateAsync(data);
    } catch (error) {
      // Error handling is done in the mutation
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/portal/vehicles">
          <Button variant="secondary">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Add Vehicle</h1>
          <p className="text-sm text-muted-foreground mt-1">Register a new vehicle</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vehicle Info</CardTitle>
          <CardDescription>
            Enter your vehicle details. You can use the VIN decoder to automatically fill in some information.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {serverError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800 dark:text-red-300">{serverError}</p>
                </div>
              </div>
            )}

            {/* VIN */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="vin">
                  VIN (Vehicle Identification Number) <span className="text-red-500">*</span>
                </Label>
                {vinValue && vinValue.length === 17 && (
                  <VINDecoderButton
                    vin={vinValue}
                    onDecode={handleVinDecode}
                  />
                )}
              </div>
              <Input
                id="vin"
                {...register("vin", {
                  setValueAs: (value) => value?.toUpperCase().trim(),
                })}
                placeholder="Enter 17-character VIN"
                maxLength={17}
                className={errors.vin ? "border-red-500" : ""}
              />
              {errors.vin && (
                <p className="text-sm text-red-600 dark:text-red-400">{errors.vin.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                The VIN is usually found on the driver's side dashboard or door frame
              </p>
            </div>

            {/* Other Information (from VIN) */}
            {vinOtherInfo && (
              <Card className="bg-muted/20">
                <CardHeader>
                  <CardTitle className="text-base">Other Information (from VIN)</CardTitle>
                  <CardDescription>
                    Manufacturer-submitted details from NHTSA (Part 565). This is informational.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div><span className="text-muted-foreground">Series:</span> {vinOtherInfo.series || "-"}</div>
                    <div><span className="text-muted-foreground">Trim:</span> {vinOtherInfo.trim || "-"}</div>
                    <div><span className="text-muted-foreground">GVWR:</span> {vinOtherInfo.gvwr || "-"}</div>
                    <div><span className="text-muted-foreground">Drive Type:</span> {vinOtherInfo.drive_type || "-"}</div>
                    <div><span className="text-muted-foreground">Cylinders:</span> {vinOtherInfo.cylinders ?? "-"}</div>
                    <div><span className="text-muted-foreground">Engine Displacement (L):</span> {vinOtherInfo.engine_displacement_l || "-"}</div>
                    <div><span className="text-muted-foreground">Engine Model:</span> {vinOtherInfo.engine_model || "-"}</div>
                    <div><span className="text-muted-foreground">Engine HP:</span> {vinOtherInfo.engine_hp ?? "-"}</div>
                    <div><span className="text-muted-foreground">Engine Manufacturer:</span> {vinOtherInfo.engine_manufacturer || "-"}</div>
                    <div><span className="text-muted-foreground">Primary Fuel Type:</span> {vinOtherInfo.primary_fuel_type || "-"}</div>
                    <div><span className="text-muted-foreground">Secondary Fuel Type:</span> {vinOtherInfo.secondary_fuel_type || "-"}</div>
                    <div><span className="text-muted-foreground">Electrification Level:</span> {vinOtherInfo.electrification_level || "-"}</div>
                    <div><span className="text-muted-foreground">Transmission Speed:</span> {vinOtherInfo.transmission_speed || "-"}</div>
                    <div><span className="text-muted-foreground">Transmission Style:</span> {vinOtherInfo.transmission_style || "-"}</div>
                  </div>

                  <div className="mt-4">
                    <p className="text-sm font-medium text-card-foreground mb-2">Airbags</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      <div><span className="text-muted-foreground">Front:</span> {vinOtherInfo.airbags?.front || "-"}</div>
                      <div><span className="text-muted-foreground">Knee:</span> {vinOtherInfo.airbags?.knee || "-"}</div>
                      <div><span className="text-muted-foreground">Side:</span> {vinOtherInfo.airbags?.side || "-"}</div>
                      <div><span className="text-muted-foreground">Curtain:</span> {vinOtherInfo.airbags?.curtain || "-"}</div>
                      <div><span className="text-muted-foreground">Seat Cushion:</span> {vinOtherInfo.airbags?.seat_cushion || "-"}</div>
                    </div>
                    {vinOtherInfo.airbags?.other_restraint_info && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Other Restraint Info: {vinOtherInfo.airbags.other_restraint_info}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Year, Make, Model */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="year">
                  Year <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="year"
                  type="number"
                  {...register("year", { valueAsNumber: true })}
                  min={1900}
                  max={new Date().getFullYear() + 1}
                  className={errors.year ? "border-red-500" : ""}
                />
                {errors.year && (
                  <p className="text-sm text-red-600 dark:text-red-400">{errors.year.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="make">
                  Make <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="make"
                  {...register("make")}
                  placeholder="e.g., Toyota, Ford"
                  className={errors.make ? "border-red-500" : ""}
                />
                {errors.make && (
                  <p className="text-sm text-red-600 dark:text-red-400">{errors.make.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="model">
                  Model <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="model"
                  {...register("model")}
                  placeholder="e.g., Camry, F-150"
                  className={errors.model ? "border-red-500" : ""}
                />
                {errors.model && (
                  <p className="text-sm text-red-600 dark:text-red-400">{errors.model.message}</p>
                )}
              </div>
            </div>

            {/* License Plate, Color, Mileage */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="license_plate">License Plate</Label>
                <Input
                  id="license_plate"
                  {...register("license_plate")}
                  placeholder="e.g., ABC-1234"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="exterior_color">Exterior Color</Label>
                <Input
                  id="exterior_color"
                  {...register("exterior_color")}
                  placeholder="e.g., Blue, White"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="current_mileage">Current Mileage</Label>
                <Input
                  id="current_mileage"
                  type="number"
                  {...register("current_mileage", { valueAsNumber: true })}
                  min={0}
                  placeholder="0"
                />
              </div>
            </div>

            {/* Engine Type */}
            <div className="space-y-2">
              <Label htmlFor="engine_type">Engine Type</Label>
              <Controller
                control={control}
                name="engine_type"
                render={({ field }) => (
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Engine Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gasoline">Gasoline</SelectItem>
                      <SelectItem value="diesel">Diesel</SelectItem>
                      <SelectItem value="electric">Electric</SelectItem>
                      <SelectItem value="hybrid">Hybrid</SelectItem>
                      <SelectItem value="plug_in_hybrid">Plug-in Hybrid</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* Submit Buttons */}
            <div className="flex items-center justify-end space-x-4 pt-4 border-t border-border">
              <Link href="/portal/vehicles">
                <Button type="button" variant="secondary" disabled={isSubmitting}>
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={isSubmitting || createMutation.isPending}>
                {isSubmitting || createMutation.isPending ? "Registering..." : "Register Vehicle"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

