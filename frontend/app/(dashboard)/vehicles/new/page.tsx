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
import { ArrowLeft, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AxiosError } from "axios";

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
});

type VehicleFormData = z.infer<typeof vehicleSchema>;

export default function NewVehiclePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = searchParams.get("customer");
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  // Fetch customers for owner dropdown
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
  } = useForm<VehicleFormData>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      status: "active",
      engine_type: "gasoline",
      owner: customerId ? parseInt(customerId) : undefined,
      current_mileage: 0,
      year: new Date().getFullYear(),
    },
  });

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

  const onSubmit = async (data: VehicleFormData) => {
    setServerError(null);
    try {
      await createMutation.mutateAsync(data);
    } catch (error) {
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
          setServerError("An error occurred while creating the vehicle. Please check the form and try again.");
        }
      } else {
        setServerError("An unexpected error occurred. Please try again.");
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link href={customerId ? `/customers/${customerId}` : "/vehicles"}>
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">New Vehicle</h1>
          <p className="text-sm text-gray-500 mt-1">Register a new vehicle</p>
        </div>
      </div>

      {serverError && (
        <Card className="bg-red-50 border-red-200">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2 text-red-800">
              <AlertCircle className="w-5 h-5" />
              <p className="text-sm font-medium">{serverError}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Vehicle Information */}
            <Card>
              <CardHeader>
                <CardTitle>Vehicle Information</CardTitle>
                <CardDescription>Basic vehicle details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label htmlFor="vin" className="block text-sm font-medium text-gray-700 mb-1">
                    VIN (Vehicle Identification Number) *
                  </label>
                  <Input
                    id="vin"
                    {...register("vin")}
                    className={errors.vin ? "border-red-500" : ""}
                    placeholder="1HGBH41JXMN109186"
                  />
                  {errors.vin && (
                    <p className="mt-1 text-sm text-red-600">{errors.vin.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="make" className="block text-sm font-medium text-gray-700 mb-1">
                      Make *
                    </label>
                    <Input
                      id="make"
                      {...register("make")}
                      className={errors.make ? "border-red-500" : ""}
                      placeholder="Toyota"
                    />
                    {errors.make && (
                      <p className="mt-1 text-sm text-red-600">{errors.make.message}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="model" className="block text-sm font-medium text-gray-700 mb-1">
                      Model *
                    </label>
                    <Input
                      id="model"
                      {...register("model")}
                      className={errors.model ? "border-red-500" : ""}
                      placeholder="Camry"
                    />
                    {errors.model && (
                      <p className="mt-1 text-sm text-red-600">{errors.model.message}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="year" className="block text-sm font-medium text-gray-700 mb-1">
                      Year *
                    </label>
                    <Input
                      id="year"
                      type="number"
                      {...register("year", { valueAsNumber: true })}
                      className={errors.year ? "border-red-500" : ""}
                    />
                    {errors.year && (
                      <p className="mt-1 text-sm text-red-600">{errors.year.message}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="license_plate" className="block text-sm font-medium text-gray-700 mb-1">
                      License Plate
                    </label>
                    <Input
                      id="license_plate"
                      {...register("license_plate")}
                    />
                  </div>
                  <div>
                    <label htmlFor="exterior_color" className="block text-sm font-medium text-gray-700 mb-1">
                      Color
                    </label>
                    <Input
                      id="exterior_color"
                      {...register("exterior_color")}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Specifications */}
            <Card>
              <CardHeader>
                <CardTitle>Specifications</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="current_mileage" className="block text-sm font-medium text-gray-700 mb-1">
                      Mileage
                    </label>
                    <Input
                      id="current_mileage"
                      type="number"
                      {...register("current_mileage", { valueAsNumber: true })}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label htmlFor="engine_type" className="block text-sm font-medium text-gray-700 mb-1">
                      Engine Type
                    </label>
                    <Select
                      id="engine_type"
                      {...register("engine_type")}
                    >
                      <option value="gasoline">Gasoline</option>
                      <option value="diesel">Diesel</option>
                      <option value="electric">Electric</option>
                      <option value="hybrid">Hybrid</option>
                      <option value="plug_in_hybrid">Plug-in Hybrid</option>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Owner & Status */}
            <Card>
              <CardHeader>
                <CardTitle>Owner & Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label htmlFor="owner" className="block text-sm font-medium text-gray-700 mb-1">
                    Owner (Customer) *
                  </label>
                  <Select
                    id="owner"
                    {...register("owner", { valueAsNumber: true })}
                    className={errors.owner ? "border-red-500" : ""}
                    onChange={(e) => setValue("owner", parseInt(e.target.value))}
                  >
                    <option value="">Select a customer</option>
                    {customersData?.results?.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.user?.first_name} {customer.user?.last_name} - {customer.customer_number}
                      </option>
                    ))}
                  </Select>
                  {errors.owner && (
                    <p className="mt-1 text-sm text-red-600">{errors.owner.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <Select
                    id="status"
                    {...register("status")}
                  >
                    <option value="active">Active</option>
                    <option value="in_service">In Service</option>
                    <option value="sold">Sold</option>
                    <option value="totaled">Totaled</option>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar Actions */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Creating..." : "Create Vehicle"}
                </Button>
                <Link href={customerId ? `/customers/${customerId}` : "/vehicles"}>
                  <Button type="button" variant="outline" className="w-full">
                    Cancel
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}

