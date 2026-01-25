"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { appointmentsApi } from "@/lib/api/appointments";
import { vehiclesApi } from "@/lib/api/vehicles";
import { authApi } from "@/lib/api/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Car, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/lib/hooks/useToast";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const appointmentSchema = z.object({
  vehicle: z.string().min(1, "Vehicle is required"),
  service_type: z.string().min(1, "Service type is required"),
  appointment_date: z.string().min(1, "Date is required"),
  appointment_time: z.string().min(1, "Time is required"),
  notes: z.string().optional(),
});

type AppointmentFormData = z.infer<typeof appointmentSchema>;

export default function BookAppointmentPage() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useQuery({
    queryKey: ["user"],
    queryFn: () => authApi.getCurrentUser(),
  });

  const { data: vehiclesData } = useQuery({
    queryKey: ["portal", "vehicles"],
    queryFn: () => {
      const customerId = user?.customer_profile?.id || (user as any)?.customer?.id;
      if (!customerId) return Promise.resolve({ count: 0, next: null, previous: null, results: [] });
      return vehiclesApi.list({ owner: customerId });
    },
    enabled: !!user && !!(user?.customer_profile?.id || (user as any)?.customer?.id),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<AppointmentFormData>({
    resolver: zodResolver(appointmentSchema),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<AppointmentFormData>) => {
      const customerId = (user as any)?.customer_profile?.id || (user as any)?.customer?.id;
      if (!customerId) {
        throw new Error("Customer profile not found");
      }
      // Branch will be automatically assigned by the backend if not provided
      return appointmentsApi.create({
        customer: customerId,
        vehicle: parseInt(data.vehicle!),
        service_type: data.service_type!,
        appointment_date: data.appointment_date!,
        appointment_time: data.appointment_time!,
        customer_concerns: data.notes || "No specific concerns mentioned",
        priority: "normal",
        estimated_duration: 60,
      } as any);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["portal", "appointments"] });
      queryClient.invalidateQueries({ queryKey: ["portal", "dashboard"] });
      toast({
        title: "Appointment Booked!",
        description: `Appointment #${data.appointment_number} has been booked successfully. We will confirm your appointment shortly.`,
      });
      reset();
      router.push("/portal/appointments");
    },
    onError: (error: any) => {
      console.error("Appointment creation error:", error.response?.data);
      let errorMessage = "Failed to book appointment. Please try again.";
      
      if (error.response?.data) {
        const data = error.response.data;
        if (data.detail) {
          errorMessage = data.detail;
        } else if (data.non_field_errors && Array.isArray(data.non_field_errors)) {
          errorMessage = data.non_field_errors[0];
        } else {
          // Get first field error
          const fieldErrors = Object.values(data).flat();
          if (Array.isArray(fieldErrors) && fieldErrors.length > 0) {
            errorMessage = String(fieldErrors[0]);
          }
        }
      }
      
      toast({
        title: "Booking Failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const vehicles = (vehiclesData?.results || vehiclesData || []) as any[];
  const today = new Date().toISOString().split("T")[0];
  const minTime = new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });

  const serviceTypes = [
    { value: "inspection", label: "Inspection" },
    { value: "repair", label: "Repair" },
    { value: "maintenance", label: "Maintenance" },
    { value: "diagnostic", label: "Diagnostic" },
    { value: "tire_service", label: "Tire Service" },
    { value: "oil_change", label: "Oil Change" },
    { value: "brake_service", label: "Brake Service" },
    { value: "other", label: "Other" },
  ];

  const onSubmit = (data: AppointmentFormData) => {
    createMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Book Appointment</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Schedule a service appointment for your vehicle
        </p>
      </div>

      {vehicles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Car className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              You need to register a vehicle before booking an appointment
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              Please contact us to register your vehicle first
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Appointment Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Vehicle Selection */}
              <div className="space-y-2">
                <Label htmlFor="vehicle">
                  Vehicle <span className="text-red-500">*</span>
                </Label>
                <Select
                  id="vehicle"
                  {...register("vehicle")}
                  className={errors.vehicle ? "border-red-500" : ""}
                >
                  <option value="">Select a vehicle</option>
                  {vehicles.map((vehicle: any) => (
                    <option key={vehicle.id} value={String(vehicle.id)}>
                      {vehicle.year} {vehicle.make} {vehicle.model} ({vehicle.license_plate || "N/A"})
                    </option>
                  ))}
                </Select>
                {errors.vehicle && (
                  <p className="text-sm text-red-600 dark:text-red-400">{errors.vehicle.message}</p>
                )}
              </div>

              {/* Service Type */}
              <div className="space-y-2">
                <Label htmlFor="service_type">
                  Service Type <span className="text-red-500">*</span>
                </Label>
                <Select
                  id="service_type"
                  {...register("service_type")}
                  className={errors.service_type ? "border-red-500" : ""}
                >
                  <option value="">Select service type</option>
                  {serviceTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </Select>
                {errors.service_type && (
                  <p className="text-sm text-red-600 dark:text-red-400">{errors.service_type.message}</p>
                )}
              </div>

              {/* Date and Time */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="appointment_date">
                    Date <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="appointment_date"
                    type="date"
                    min={today}
                    {...register("appointment_date")}
                    className={errors.appointment_date ? "border-red-500" : ""}
                  />
                  {errors.appointment_date && (
                    <p className="text-sm text-red-600 dark:text-red-400">{errors.appointment_date.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="appointment_time">
                    Time <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="appointment_time"
                    type="time"
                    {...register("appointment_time")}
                    className={errors.appointment_time ? "border-red-500" : ""}
                  />
                  {errors.appointment_time && (
                    <p className="text-sm text-red-600 dark:text-red-400">{errors.appointment_time.message}</p>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Additional Notes or Concerns</Label>
                <Textarea
                  id="notes"
                  {...register("notes")}
                  placeholder="Describe any issues or concerns with your vehicle..."
                  rows={4}
                />
              </div>

              {/* Info Box */}
              <div className="bg-primary/10 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="w-5 h-5 text-primary dark:text-primary flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-orange-800 dark:text-orange-300">
                    <p className="font-medium mb-1">What happens next?</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Your appointment request will be reviewed by our team</li>
                      <li>You will receive a confirmation email or phone call</li>
                      <li>We may contact you to confirm details or suggest alternative times</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex items-center justify-end space-x-4">
                <Button
                  type="button"
                 variant="secondary"
                  onClick={() => router.back()}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting || createMutation.isPending}>
                  {isSubmitting || createMutation.isPending ? "Booking..." : "Book Appointment"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

