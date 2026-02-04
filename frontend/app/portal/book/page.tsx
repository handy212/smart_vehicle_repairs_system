"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { portalApi, PortalServiceBundle } from "@/lib/api/portal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Car, Clock, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils/cn";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/lib/hooks/useToast";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCurrency } from "@/lib/hooks/useCurrency";

const appointmentSchema = z.object({
  vehicle_id: z.string().min(1, "Vehicle is required"),
  service_type: z.string().min(1, "Service type is required"),
  service_bundle_id: z.string().optional(),
  appointment_date: z.string().min(1, "Date is required"),
  appointment_time: z.string().min(1, "Time is required"),
  customer_concerns: z.string().optional(),
});

type AppointmentFormData = z.infer<typeof appointmentSchema>;

const SERVICE_TYPES = [
  { value: "inspection", label: "Inspection" },
  { value: "repair", label: "Repair" },
  { value: "maintenance", label: "Maintenance" },
  { value: "diagnostic", label: "Diagnostic" },
  { value: "tire_service", label: "Tire Service" },
  { value: "oil_change", label: "Oil Change" },
];

export default function BookAppointmentPage() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { formatCurrency } = useCurrency();
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [checkingAvailability, setCheckingAvailability] = useState(false);

  // Fetch User Vehicles
  const { data: vehicles = [], isLoading: vehiclesLoading } = useQuery({
    queryKey: ["portal", "vehicles"],
    queryFn: portalApi.getVehicles,
  });

  // Fetch Service Bundles
  const { data: bundles = [] } = useQuery({
    queryKey: ["portal", "services"],
    queryFn: portalApi.getServices,
  });

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<AppointmentFormData>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      service_type: "",
    },
  });

  // Watch date to fetch availability
  const selectedDate = useWatch({ control, name: "appointment_date" });
  const selectedBundleId = useWatch({ control, name: "service_bundle_id" });

  useEffect(() => {
    if (selectedDate) {
      setCheckingAvailability(true);
      portalApi.checkAvailability(selectedDate)
        .then((data) => {
          setAvailableSlots(data.slots);
        })
        .catch(() => {
          setAvailableSlots([]);
          toast({
            title: "Availability Check Failed",
            description: "Could not fetch available slots for this date.",
            variant: "destructive",
          });
        })
        .finally(() => {
          setCheckingAvailability(false);
        });
    }
  }, [selectedDate, toast]);

  // Handle Bundle Selection
  useEffect(() => {
    if (selectedBundleId && selectedBundleId !== "none") {
      setValue("service_type", "maintenance"); // Auto-set type for bundles
    }
  }, [selectedBundleId, setValue]);

  const createMutation = useMutation({
    mutationFn: (data: AppointmentFormData) => {
      return portalApi.createBooking({
        vehicle_id: parseInt(data.vehicle_id),
        service_type: data.service_type,
        service_bundle_id: data.service_bundle_id && data.service_bundle_id !== "none"
          ? parseInt(data.service_bundle_id)
          : undefined,
        appointment_date: data.appointment_date,
        appointment_time: data.appointment_time,
        customer_concerns: data.customer_concerns || "No notes provided",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "history"] });
      toast({
        title: "Appointment Booked!",
        description: "Your service request has been submitted successfully.",
      });
      router.push("/portal/history");
    },
    onError: (error: any) => {
      console.error("Booking failed:", error);
      toast({
        title: "Booking Failed",
        description: error.response?.data?.detail || "Please check your inputs and try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: AppointmentFormData) => {
    createMutation.mutate(data);
  };

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Schedule Service</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Book an appointment for your vehicle
        </p>
      </div>

      {vehiclesLoading ? (
        <div className="p-8 text-center">Loading vehicles...</div>
      ) : vehicles.length === 0 ? (
        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="py-8 text-center flex flex-col items-center">
            <Car className="w-12 h-12 text-yellow-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Vehicles Found</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md">
              You need to have a registered vehicle to book a service. Please contact us to add your vehicle.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Service Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

              {/* 1. Vehicle Selection */}
              <div className="space-y-2">
                <Label htmlFor="vehicle_id">Select Vehicle <span className="text-red-500">*</span></Label>
                <select
                  id="vehicle_id"
                  {...register("vehicle_id")}
                  className={cn(
                    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                    errors.vehicle_id ? "border-red-500" : ""
                  )}
                >
                  <option value="">-- Choose a Vehicle --</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.year} {v.make} {v.model} ({v.license_plate})
                    </option>
                  ))}
                </select>
                {errors.vehicle_id && <p className="text-sm text-red-500">{errors.vehicle_id.message}</p>}
              </div>

              {/* 2. Service Selection (Bundle or Custom) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="service_bundle_id">Service Bundle (Recommended)</Label>
                  <select
                    id="service_bundle_id"
                    {...register("service_bundle_id")}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="none">-- No Bundle --</option>
                    {bundles.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} - {formatCurrency(b.price)}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">Select a package for best value.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="service_type">Service Type <span className="text-red-500">*</span></Label>
                  <select
                    id="service_type"
                    {...register("service_type")}
                    className={cn(
                      "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      errors.service_type ? "border-red-500" : ""
                    )}
                  >
                    <option value="">-- Select Type --</option>
                    {SERVICE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                    <option value="other">Other / Custom Request</option>
                  </select>
                  {errors.service_type && <p className="text-sm text-red-500">{errors.service_type.message}</p>}
                </div>
              </div>

              {/* 3. Date & Time Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
                <div className="space-y-2">
                  <Label htmlFor="appointment_date">Preferred Date <span className="text-red-500">*</span></Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="appointment_date"
                      type="date"
                      min={today}
                      {...register("appointment_date")}
                      className={cn("pl-10", errors.appointment_date && "border-red-500")}
                    />
                  </div>
                  {errors.appointment_date && <p className="text-sm text-red-500">{errors.appointment_date.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="appointment_time">Available Time Slot <span className="text-red-500">*</span></Label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <select
                      id="appointment_time"
                      {...register("appointment_time")}
                      disabled={!selectedDate || checkingAvailability || availableSlots.length === 0}
                      className={cn(
                        "flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                        errors.appointment_time ? "border-red-500" : ""
                      )}
                    >
                      <option value="">
                        {!selectedDate ? "-- Select Date First --" :
                          checkingAvailability ? "Checking..." :
                            availableSlots.length === 0 ? "No slots available" : "-- Select Time --"}
                      </option>
                      {availableSlots.map((slot) => (
                        <option key={slot} value={slot}>{slot}</option>
                      ))}
                    </select>
                  </div>
                  {errors.appointment_time && <p className="text-sm text-red-500">{errors.appointment_time.message}</p>}
                </div>
              </div>

              {/* 4. Concerns */}
              <div className="space-y-2">
                <Label htmlFor="customer_concerns">Notes / Concerns</Label>
                <Textarea
                  id="customer_concerns"
                  {...register("customer_concerns")}
                  placeholder="Please describe any specific issues..."
                  className="min-h-[100px]"
                />
              </div>

              {/* Submit */}
              <div className="flex justify-end pt-4">
                <Button
                  type="submit"
                  size="lg"
                  className="w-full md:w-auto"
                  disabled={isSubmitting || createMutation.isPending}
                >
                  {isSubmitting || createMutation.isPending ? "Confirming Booking..." :
                    <><CheckCircle2 className="w-4 h-4 mr-2" /> Confirm Booking</>}
                </Button>
              </div>

            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
