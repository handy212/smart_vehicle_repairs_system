"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { vehiclesApi } from "@/lib/api/vehicles";
import { customersApi } from "@/lib/api/customers";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ArrowLeft, AlertCircle, X, Image as ImageIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AxiosError } from "axios";
import { VINDecoderButton } from "@/components/ui/vin-decoder-button";
import { useToast } from "@/lib/hooks/useToast";
import Image from "next/image";

const vehicleSchema = z.object({
  vin: z.string().min(1, "VIN is required"),
  make: z.string().min(1, "Make is required"),
  model: z.string().min(1, "Model is required"),
  year: z.number().min(1900).max(new Date().getFullYear() + 1),
  license_plate: z.string().optional(),
  exterior_color: z.string().optional(),
  current_mileage: z.number().min(0).optional(),
  engine_type: z.enum(["gasoline", "diesel", "electric", "hybrid", "plug_in_hybrid"]).optional(),
  owner: z.number().min(1, "Owner is required"),
  status: z.enum(["active", "in_service", "sold", "totaled", "inactive"]),
  vehicle_type: z.enum(["saloon", "suv", "pickup", "minivan", "motorcycle", "truck", "other"]),
});

type VehicleFormData = z.infer<typeof vehicleSchema>;

export default function NewVehiclePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = searchParams.get("customer");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [vinOtherInfo, setVinOtherInfo] = useState<any | null>(null);

  const { data: customersData } = useQuery({
    queryKey: ["customers", "list"],
    queryFn: () => customersApi.list({ page: 1 }),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    setError,
    watch,
  } = useForm<VehicleFormData>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      status: "active",
      engine_type: "gasoline",
      owner: customerId ? parseInt(customerId) : undefined,
      current_mileage: 0,
      year: new Date().getFullYear(),
      vehicle_type: "saloon",
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
    if (decodedData.vin_other_information) {
      setVinOtherInfo(decodedData.vin_other_information);

      // Attempt to map VIN body type to vehicle_type
      const bodyClass = decodedData.vin_other_information.body_class?.toLowerCase() || "";
      if (bodyClass.includes("sedan") || bodyClass.includes("saloon") || bodyClass.includes("coupe")) setValue("vehicle_type", "saloon");
      else if (bodyClass.includes("sport utility") || bodyClass.includes("suv")) setValue("vehicle_type", "suv");
      else if (bodyClass.includes("pickup")) setValue("vehicle_type", "pickup");
      else if (bodyClass.includes("van") || bodyClass.includes("minivan")) setValue("vehicle_type", "minivan");
    }
  };

  const createMutation = useMutation({
    mutationFn: (data: VehicleFormData) => vehiclesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      if (customerId) {
        router.push(`/customers/${customerId}`);
      } else {
        router.push("/vehicles");
      }
    },
  });

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const onSubmit = async (data: VehicleFormData) => {
    setServerError(null);
    try {
      // Check if vehicle with this VIN already exists
      if (data.vin && data.vin.length === 17) {
        try {
          const vinCheck = await vehiclesApi.decodeVin(data.vin.toUpperCase());
          if (vinCheck.success && vinCheck.exists && vinCheck.vehicle) {
            const vehicle = vinCheck.vehicle as any;
            const vehicleDisplayName = vehicle.display_name ||
              `${vehicle.year} ${vehicle.make} ${vehicle.model}` ||
              `Vehicle #${vehicle.id}`;

            toast({
              title: "Vehicle Already Exists",
              description: `${vehicleDisplayName} with this VIN already exists in the system.`,
              variant: "warning",
            });

            if (vinCheck.vehicle_id && typeof window !== 'undefined' && confirm(`A vehicle with this VIN already exists.\n\n${vehicleDisplayName}\n\nWould you like to view the existing vehicle instead?`)) {
              router.push(`/vehicles/${vinCheck.vehicle_id}`);
              return;
            }

            // Set error on VIN field
            setError("vin", {
              type: "manual",
              message: "A vehicle with this VIN already exists in the system",
            });
            return;
          }
        } catch (vinError) {
          // If VIN check fails, continue with form submission
          console.warn("VIN existence check failed:", vinError);
        }
      }

      // Check if vehicle with this license plate already exists
      if (data.license_plate && data.license_plate.trim()) {
        try {
          const licensePlateCheck = await vehiclesApi.checkLicensePlate(data.license_plate.trim().toUpperCase());
          if (licensePlateCheck.success && licensePlateCheck.exists && licensePlateCheck.vehicle) {
            const vehicle = licensePlateCheck.vehicle as any;
            const vehicleDisplayName = vehicle.display_name ||
              `${vehicle.year} ${vehicle.make} ${vehicle.model}` ||
              `Vehicle #${vehicle.id}`;

            toast({
              title: "License Plate Already Exists",
              description: `${vehicleDisplayName} with license plate "${data.license_plate.toUpperCase()}" already exists in the system.`,
              variant: "warning",
            });

            if (licensePlateCheck.vehicle_id && typeof window !== 'undefined' && confirm(`A vehicle with license plate "${data.license_plate.toUpperCase()}" already exists.\n\n${vehicleDisplayName}\n\nWould you like to view the existing vehicle instead?`)) {
              router.push(`/vehicles/${licensePlateCheck.vehicle_id}`);
              return;
            }

            // Set error on license_plate field
            setError("license_plate", {
              type: "manual",
              message: "A vehicle with this license plate already exists in the system",
            });
            return;
          }
        } catch (licensePlateError) {
          // If license plate check fails, continue with form submission
          console.warn("License plate existence check failed:", licensePlateError);
        }
      }

      let payload: VehicleFormData | FormData;

      if (imageFile) {
        const formData = new FormData();
        Object.keys(data).forEach((key) => {
          const value = data[key as keyof VehicleFormData];
          if (value !== undefined && value !== null) {
            formData.append(key, value.toString());
          }
        });
        formData.append('image', imageFile);
        payload = formData;
      } else {
        payload = data;
      }

      await createMutation.mutateAsync(payload as any);
    } catch (error) {
      console.error("Error creating vehicle:", error);

      if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data;

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
          setServerError("An error occurred while creating the vehicle. Please check the form and try again.");
        }
      } else {
        setServerError("An unexpected error occurred. Please try again.");
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={customerId ? `/customers/${customerId}` : "/vehicles"}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">New Vehicle</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Register a new vehicle</p>
          </div>
        </div>
      </div>

      {serverError && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800 dark:text-red-300">{serverError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

        {/* VIN & Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Vehicle Identification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <label htmlFor="vin" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                VIN <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <Input
                  id="vin"
                  {...register("vin")}
                  className={errors.vin ? "border-red-500" : ""}
                  placeholder="1HGBH41JXMN109186"
                  maxLength={17}
                  onChange={(e) => {
                    setValue("vin", e.target.value.toUpperCase());
                  }}
                />
                <VINDecoderButton
                  vin={vinValue || ""}
                  onDecode={handleVinDecode}
                  disabled={isSubmitting}
                />
              </div>
              {errors.vin && (
                <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{errors.vin.message}</p>
              )}
              <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                Enter 17-character VIN and click "Decode VIN" to auto-fill details
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="make" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Make <span className="text-red-500">*</span>
                </label>
                <Input
                  id="make"
                  {...register("make")}
                  className={errors.make ? "border-red-500" : ""}
                  placeholder="Toyota"
                />
                {errors.make && (
                  <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{errors.make.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="model" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Model <span className="text-red-500">*</span>
                </label>
                <Input
                  id="model"
                  {...register("model")}
                  className={errors.model ? "border-red-500" : ""}
                  placeholder="Camry"
                />
                {errors.model && (
                  <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{errors.model.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="year" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Year <span className="text-red-500">*</span>
                </label>
                <Input
                  id="year"
                  type="number"
                  {...register("year", { valueAsNumber: true })}
                  className={errors.year ? "border-red-500" : ""}
                  placeholder="2024"
                />
                {errors.year && (
                  <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{errors.year.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="license_plate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  License Plate
                </label>
                <Input
                  id="license_plate"
                  {...register("license_plate")}
                  placeholder="ABC 1234"
                />
              </div>
              <div>
                <label htmlFor="exterior_color" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Color
                </label>
                <Input
                  id="exterior_color"
                  {...register("exterior_color")}
                  placeholder="Silver"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* VIN Decoded Information */}
        {vinOtherInfo && (
          <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-900/10">
            <CardHeader>
              <CardTitle className="text-base text-blue-900 dark:text-blue-100">VIN Decoded Information</CardTitle>
              <CardDescription className="text-blue-700 dark:text-blue-300">
                Details from NHTSA database (Part 565) - for reference only
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {vinOtherInfo.series && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Series</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{vinOtherInfo.series}</span>
                  </div>
                )}
                {vinOtherInfo.trim && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Trim</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{vinOtherInfo.trim}</span>
                  </div>
                )}
                {vinOtherInfo.gvwr && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">GVWR</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{vinOtherInfo.gvwr}</span>
                  </div>
                )}
                {vinOtherInfo.drive_type && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Drive Type</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{vinOtherInfo.drive_type}</span>
                  </div>
                )}
                {vinOtherInfo.cylinders && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Cylinders</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{vinOtherInfo.cylinders}</span>
                  </div>
                )}
                {vinOtherInfo.engine_displacement_l && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Displacement</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{vinOtherInfo.engine_displacement_l}L</span>
                  </div>
                )}
                {vinOtherInfo.engine_model && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Engine Model</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{vinOtherInfo.engine_model}</span>
                  </div>
                )}
                {vinOtherInfo.engine_hp && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Horsepower</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{vinOtherInfo.engine_hp} HP</span>
                  </div>
                )}
                {vinOtherInfo.transmission_style && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Transmission</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{vinOtherInfo.transmission_style}</span>
                  </div>
                )}
                {vinOtherInfo.transmission_speed && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Speeds</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{vinOtherInfo.transmission_speed}</span>
                  </div>
                )}
                {vinOtherInfo.primary_fuel_type && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Fuel Type</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{vinOtherInfo.primary_fuel_type}</span>
                  </div>
                )}
              </div>

              {vinOtherInfo.airbags && (
                <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-800">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Airbag Locations</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    {vinOtherInfo.airbags.front && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Front</span>
                        <span className="text-gray-900 dark:text-gray-100">{vinOtherInfo.airbags.front}</span>
                      </div>
                    )}
                    {vinOtherInfo.airbags.side && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Side</span>
                        <span className="text-gray-900 dark:text-gray-100">{vinOtherInfo.airbags.side}</span>
                      </div>
                    )}
                    {vinOtherInfo.airbags.curtain && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Curtain</span>
                        <span className="text-gray-900 dark:text-gray-100">{vinOtherInfo.airbags.curtain}</span>
                      </div>
                    )}
                    {vinOtherInfo.airbags.knee && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Knee</span>
                        <span className="text-gray-900 dark:text-gray-100">{vinOtherInfo.airbags.knee}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Specifications & Vehicle Photo */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Specifications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-6">
              {/* Left Column - Vehicle Image */}
              <div className="flex-shrink-0">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Vehicle Photo
                </label>
                {imagePreview ? (
                  <div className="relative w-40">
                    <div className="relative aspect-[4/3] rounded-lg overflow-hidden border border-gray-300 dark:border-gray-700">
                      <Image
                        src={imagePreview}
                        alt="Vehicle preview"
                        fill
                        className="object-cover"
                        sizes="160px"
                        unoptimized={imagePreview?.startsWith('http://localhost') || imagePreview?.startsWith('https://localhost') || imagePreview?.startsWith('data:')}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={removeImage}
                      className="absolute -top-1 -right-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full p-1 shadow-md border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <label className="block w-40 cursor-pointer group">
                    <div className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-200 dark:border-gray-700 border-dashed rounded-lg bg-gray-50 dark:bg-gray-900/20 group-hover:bg-gray-100 dark:group-hover:bg-gray-900/40 transition-colors">
                      <ImageIcon className="w-6 h-6 mb-1 text-gray-400 dark:text-gray-500" />
                      <p className="text-xs text-gray-600 dark:text-gray-400 text-center px-2">
                        <span className="font-medium">Click to upload</span>
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">PNG, JPG</p>
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={handleImageChange}
                    />
                  </label>
                )}
              </div>

              {/* Right Column - Specifications */}
              <div className="flex-1">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="current_mileage" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Current Mileage
                    </label>
                    <Input
                      id="current_mileage"
                      type="number"
                      {...register("current_mileage", { valueAsNumber: true })}
                      placeholder="50000"
                    />
                  </div>
                  <div>
                    <label htmlFor="engine_type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Engine Type
                    </label>
                    <Select id="engine_type" {...register("engine_type")}>
                      <option value="gasoline">Gasoline</option>
                      <option value="diesel">Diesel</option>
                      <option value="electric">Electric</option>
                      <option value="hybrid">Hybrid</option>
                      <option value="plug_in_hybrid">Plug-in Hybrid</option>
                    </Select>
                  </div>
                  <div>
                    <label htmlFor="vehicle_type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Vehicle Type <span className="text-red-500">*</span>
                    </label>
                    <Select id="vehicle_type" {...register("vehicle_type")}>
                      <option value="saloon">Saloon</option>
                      <option value="suv">SUV</option>
                      <option value="pickup">Pick-Up</option>
                      <option value="minivan">Mini van</option>
                      <option value="motorcycle">Motorcycle</option>
                      <option value="truck">Truck</option>
                      <option value="other">Other</option>
                    </Select>
                    <p className="mt-1 text-[10px] text-muted-foreground">AA covers: Saloon, SUV, Pick-Up, Mini van</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Owner & Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Owner & Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <label htmlFor="owner" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Owner <span className="text-red-500">*</span>
              </label>
              <Select
                id="owner"
                {...register("owner", { valueAsNumber: true })}
                className={errors.owner ? "border-red-500" : ""}
                onChange={(e) => setValue("owner", parseInt(e.target.value))}
              >
                <option value="">Select a customer</option>
                {customersData?.results?.map((customer) => {
                  const displayName = customer.full_name ||
                    customer.company_name ||
                    (customer.user?.first_name && customer.user?.last_name
                      ? `${customer.user.first_name} ${customer.user.last_name}`
                      : customer.user?.email || customer.customer_number);
                  return (
                    <option key={customer.id} value={customer.id}>
                      {displayName}
                    </option>
                  );
                })}
              </Select>
              {errors.owner && (
                <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{errors.owner.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Status
              </label>
              <Select id="status" {...register("status")}>
                <option value="active">Active</option>
                <option value="in_service">In Service</option>
                <option value="sold">Sold</option>
                <option value="totaled">Totaled</option>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <Link href={customerId ? `/customers/${customerId}` : "/vehicles"}>
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={isSubmitting} className="min-w-32">
            {isSubmitting ? "Creating..." : "Create Vehicle"}
          </Button>
        </div>
      </form>
    </div>
  );
}