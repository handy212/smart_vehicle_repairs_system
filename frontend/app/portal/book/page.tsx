"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { portalApi } from "@/lib/api/portal";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Calendar as CalendarIcon, Car, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils/cn";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/lib/hooks/useToast";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCurrency } from "@/lib/hooks/useCurrency";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PortalPageHeader } from "../components/PortalPageHeader";

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

  // Fetch User Vehicles — use a distinct cache key to avoid colliding with the
  // vehicles list page which caches a paginated {count, results} object.
  const { data: vehiclesRaw, isLoading: vehiclesLoading } = useQuery({
    queryKey: ["portal", "vehicles-book"],
    queryFn: portalApi.getVehicles,
  });
  const vehicles = Array.isArray(vehiclesRaw) ? vehiclesRaw : (vehiclesRaw as any)?.results ?? [];

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
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AppointmentFormData>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      service_type: "",
      appointment_date: "",
      appointment_time: "",
      vehicle_id: "",
      service_bundle_id: "none",
    },
  });

  // Watch date to fetch availability
  const selectedDate = watch("appointment_date");
  const selectedBundleId = watch("service_bundle_id");

  useEffect(() => {
    if (selectedDate) {
      setCheckingAvailability(true);
      setAvailableSlots([]); // Clear previous slots while loading
      portalApi.checkAvailability(selectedDate)
        .then((data) => {
          setAvailableSlots(data.slots || []);
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
      router.push("/portal");
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
      <PortalPageHeader
        title="Schedule Service"
        description="Book an appointment for your vehicle"
      />

      {vehiclesLoading ? (
        <div className="p-8 text-center bg-card rounded-lg border border-border">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-sm text-muted-foreground">Loading vehicles...</p>
        </div>
      ) : vehicles.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center flex flex-col items-center">
            <Car className="w-10 h-10 text-muted-foreground/40 mb-3" />
            <h3 className="text-sm font-semibold mb-1">No Vehicles Found</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              You need a registered vehicle to book a service.
            </p>
            <Button size="sm" onClick={() => router.push("/portal/vehicles/new")}>
              Add Vehicle
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Service Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

              <div className="space-y-2">
                <Label htmlFor="vehicle_id">Select Vehicle <span className="text-red-500">*</span></Label>
                <Controller
                  control={control}
                  name="vehicle_id"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <SelectTrigger className={cn(errors.vehicle_id && "border-red-500")}>
                        <SelectValue placeholder="-- Choose a Vehicle --" />
                      </SelectTrigger>
                      <SelectContent>

                        {vehicles.map((v: any) => (
                          <SelectItem key={v.id} value={v.id.toString()}>
                            {v.year} {v.make} {v.model} ({v.license_plate})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.vehicle_id && <p className="text-xs text-red-500 font-medium">{errors.vehicle_id.message}</p>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="service_bundle_id">Service Bundle (Recommended)</Label>
                  <Controller
                    control={control}
                    name="service_bundle_id"
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} defaultValue={field.value || "none"}>
                        <SelectTrigger>
                          <SelectValue placeholder="-- No Bundle --" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">-- No Bundle --</SelectItem>

                          {bundles.map((b: any) => (
                            <SelectItem key={b.id} value={b.id.toString()}>
                              {b.name} - {formatCurrency(b.price)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="service_type">Service Type <span className="text-red-500">*</span></Label>
                  <Controller
                    control={control}
                    name="service_type"
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <SelectTrigger className={cn(errors.service_type && "border-red-500")}>
                          <SelectValue placeholder="-- Select Type --" />
                        </SelectTrigger>
                        <SelectContent>
                          {SERVICE_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                          <SelectItem value="other">Other / Custom Request</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.service_type && <p className="text-xs text-red-500 font-medium">{errors.service_type.message}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border">
                <div className="space-y-2">
                  <Label htmlFor="appointment_date">Preferred Date <span className="text-red-500">*</span></Label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="appointment_date"
                      type="date"
                      min={today}
                      {...register("appointment_date")}
                      className={cn("pl-10", errors.appointment_date && "border-red-500")}
                    />
                  </div>
                  {errors.appointment_date && <p className="text-xs text-red-500 font-medium">{errors.appointment_date.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="appointment_time">Available Time Slot <span className="text-red-500">*</span></Label>
                  <Controller
                    control={control}
                    name="appointment_time"
                    render={({ field }) => (
                      <Select
                        onValueChange={field.onChange}
                        disabled={!selectedDate || checkingAvailability || availableSlots.length === 0}
                        value={field.value}
                      >
                        <SelectTrigger className={cn("pl-10 relative", errors.appointment_time && "border-red-500")}>
                          <Clock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                          <SelectValue placeholder={
                            !selectedDate ? "-- Select Date First --" :
                              checkingAvailability ? "Checking..." :
                                availableSlots.length === 0 ? "No slots available" : "-- Select Time --"
                          } />
                        </SelectTrigger>
                        <SelectContent>
                          {availableSlots.map((slot) => (
                            <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.appointment_time && <p className="text-xs text-red-500 font-medium">{errors.appointment_time.message}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="customer_concerns">Notes / Concerns</Label>
                <Textarea
                  id="customer_concerns"
                  {...register("customer_concerns")}
                  placeholder="Please describe any specific issues..."
                  className="min-h-[100px]"
                />
              </div>

              <div className="flex justify-end pt-4 border-t border-border">
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
