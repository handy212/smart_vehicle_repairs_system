"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { workordersApi } from "@/lib/api/workorders";
import { customersApi } from "@/lib/api/customers";
import { vehiclesApi } from "@/lib/api/vehicles";
import { appointmentsApi } from "@/lib/api/appointments";
import { CustomerSelector } from "@/components/customers/CustomerSelector";
import { CustomerForm, CustomerFormData } from "@/components/customers/CustomerForm";
import { VehicleForm, VehicleFormData } from "@/components/vehicles/VehicleForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  Car,
  CheckCircle2,
  ClipboardList,
  Plus,
  User,
} from "lucide-react";
import { findDuplicateCustomerByEmail } from "@/lib/utils/duplicate-customer";
import type { DuplicateCustomerMatch } from "@/lib/utils/duplicate-customer";
import { DuplicateCustomerBanner } from "@/components/customers/DuplicateCustomerBanner";
import { AxiosError } from "axios";

const STEPS = [
  { id: 1, label: "Customer", icon: User },
  { id: 2, label: "Vehicle", icon: Car },
  { id: 3, label: "Service", icon: ClipboardList },
  { id: 4, label: "Review", icon: CheckCircle2 },
] as const;

const QUICK_CONCERNS = [
  "Regular maintenance/service",
  "Check engine light is on",
  "Brakes are making noise",
  "Oil change needed",
  "State inspection due",
  "AC not working",
  "Engine won't start",
];

export function CheckInWizard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [concerns, setConcerns] = useState("");
  const [odometer, setOdometer] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [scheduleAppointment, setScheduleAppointment] = useState(false);
  const [appointmentDate, setAppointmentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [appointmentTime, setAppointmentTime] = useState("09:00");

  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [vehicleFieldErrors, setVehicleFieldErrors] = useState<Record<string, string>>({});
  const [duplicateMatch, setDuplicateMatch] = useState<DuplicateCustomerMatch | null>(null);

  const { data: selectedCustomer } = useQuery({
    queryKey: ["customer", customerId],
    queryFn: () => customersApi.get(customerId!),
    enabled: !!customerId,
  });

  const { data: vehiclesData, refetch: refetchVehicles } = useQuery({
    queryKey: ["vehicles", "customer", customerId],
    queryFn: () => vehiclesApi.list({ owner: customerId || undefined }),
    enabled: !!customerId,
  });

  const { data: selectedVehicle } = useQuery({
    queryKey: ["vehicle", vehicleId],
    queryFn: () => vehiclesApi.get(vehicleId!),
    enabled: !!vehicleId,
  });

  const createCustomerMutation = useMutation({
    mutationFn: (data: CustomerFormData) => customersApi.create(data),
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: ["customers-search"] });
      setCustomerId(customer.id);
      setShowAddCustomer(false);
      toast({ title: "Customer created", variant: "success" });
    },
    onError: (error: unknown) => {
      toast({
        title: "Could not create customer",
        description: getUserFacingError(error, "Please check the form and try again."),
        variant: "destructive",
      });
    },
  });

  const createVehicleMutation = useMutation({
    mutationFn: (data: VehicleFormData | FormData) => vehiclesApi.create(data as VehicleFormData),
    onSuccess: (vehicle) => {
      queryClient.invalidateQueries({ queryKey: ["vehicles", "customer", customerId] });
      setVehicleId(vehicle.id);
      setShowAddVehicle(false);
      setVehicleFieldErrors({});
      if (vehicle.current_mileage) {
        setOdometer(String(vehicle.current_mileage));
      }
      toast({ title: "Vehicle registered", variant: "success" });
    },
    onError: (error: unknown) => {
      if (error instanceof AxiosError && error.response?.data) {
        const data = error.response.data as Record<string, string | string[]>;
        const mapped: Record<string, string> = {};
        Object.entries(data).forEach(([key, val]) => {
          mapped[key] = Array.isArray(val) ? val[0] : val;
        });
        setVehicleFieldErrors(mapped);
      }
      toast({
        title: "Could not register vehicle",
        description: getUserFacingError(error, "Please check the form and try again."),
        variant: "destructive",
      });
    },
  });

  const handleCreateVehicle = async (data: VehicleFormData, imageFile: File | null) => {
    const vehicleData = { ...data, owner: customerId || data.owner };
    let payload: VehicleFormData | FormData;

    if (imageFile) {
      const formData = new FormData();
      Object.keys(vehicleData).forEach((key) => {
        const value = vehicleData[key as keyof VehicleFormData];
        if (value !== undefined && value !== null) {
          formData.append(key, value.toString());
        }
      });
      formData.append("image", imageFile);
      payload = formData;
    } else {
      payload = vehicleData;
    }

    await createVehicleMutation.mutateAsync(payload);
  };

  const handleCreateCustomer = async (data: CustomerFormData) => {
    setDuplicateMatch(null);
    if (data.email?.trim()) {
      const duplicate = await findDuplicateCustomerByEmail(data.email);
      if (duplicate) {
        setDuplicateMatch(duplicate);
        toast({
          title: "Customer already exists",
          description: `Use ${duplicate.displayName} instead of creating a duplicate.`,
          variant: "warning",
        });
        return;
      }
    }
    await createCustomerMutation.mutateAsync(data);
  };

  const applyExistingCustomer = (match: DuplicateCustomerMatch) => {
    setCustomerId(match.customerId);
    setVehicleId(null);
    setDuplicateMatch(null);
    setShowAddCustomer(false);
    queryClient.invalidateQueries({ queryKey: ["customers-search"] });
    toast({ title: "Customer selected", variant: "success" });
  };

  const checkInMutation = useMutation({
    mutationFn: async () => {
      const wo = await workordersApi.create({
        customer: customerId!,
        vehicle: vehicleId!,
        customer_concerns: concerns.trim(),
        odometer_in: parseInt(odometer, 10) || 0,
        priority,
        status: "draft",
        maintenance_type: "general",
      });

      if (scheduleAppointment) {
        await appointmentsApi.create({
          customer: customerId!,
          vehicle: vehicleId!,
          appointment_date: appointmentDate,
          appointment_time: appointmentTime,
          service_type: "maintenance",
          priority,
          customer_concerns: concerns.trim() || undefined,
        });
      }

      return wo;
    },
    onSuccess: (wo) => {
      queryClient.invalidateQueries({ queryKey: ["workorders"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast({
        title: "Check-in complete",
        description: scheduleAppointment
          ? "Work order and appointment created."
          : "Work order created. Start the inspection when ready.",
        variant: "success",
      });
      router.push(`/workorders/${wo.id}?from=check-in`);
    },
    onError: (error: unknown) => {
      toast({
        title: "Check-in failed",
        description: getUserFacingError(error, "Could not complete check-in."),
        variant: "destructive",
      });
    },
  });

  const vehicles = vehiclesData?.results ?? [];

  const canProceed = () => {
    if (step === 1) return !!customerId;
    if (step === 2) return !!vehicleId;
    if (step === 3) return concerns.trim().length > 0 && odometer.trim().length > 0;
    return true;
  };

  const handleVehicleSelect = (id: string) => {
    const vid = parseInt(id, 10);
    setVehicleId(vid);
    const vehicle = vehicles.find((v) => v.id === vid);
    if (vehicle?.current_mileage && !odometer) {
      setOdometer(String(vehicle.current_mileage));
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Step indicator */}
      <nav aria-label="Check-in progress" className="flex items-center justify-between gap-2">
        {STEPS.map((s, index) => {
          const Icon = s.icon;
          const isActive = step === s.id;
          const isDone = step > s.id;
          return (
            <div key={s.id} className="flex items-center flex-1 min-w-0">
              <div
                className={cn(
                  "flex flex-col items-center gap-1 flex-1 min-w-0",
                  isActive && "text-primary",
                  isDone && "text-primary",
                  !isActive && !isDone && "text-muted-foreground"
                )}
              >
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-semibold",
                    isActive && "border-primary bg-primary text-primary-foreground",
                    isDone && "border-primary bg-primary/10 text-primary",
                    !isActive && !isDone && "border-border bg-card"
                  )}
                  aria-current={isActive ? "step" : undefined}
                >
                  {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <span className="text-xs font-medium truncate w-full text-center hidden sm:block">
                  {s.label}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 mx-1 mb-5 sm:mb-6",
                    step > s.id ? "bg-primary" : "bg-border"
                  )}
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </nav>

      <Card>
        <CardHeader>
          <CardTitle>
            {step === 1 && "Find or add customer"}
            {step === 2 && "Select vehicle"}
            {step === 3 && "Service details"}
            {step === 4 && "Review & check in"}
          </CardTitle>
          <CardDescription>
            {step === 1 && "Search by name, phone, or customer number."}
            {step === 2 && "Choose the vehicle being dropped off today."}
            {step === 3 && "What brings the customer in? Record mileage at intake."}
            {step === 4 && "Confirm details and open the work order."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 1 && (
            <div className="space-y-3">
              <Label htmlFor="check-in-customer">Customer</Label>
              <div className="flex gap-2">
                <div className="flex-1 min-w-0">
                  <CustomerSelector
                    selectedCustomerId={customerId ?? undefined}
                    placeholder="Search customer..."
                    onSelect={(cust) => {
                      setCustomerId(cust.id);
                      setVehicleId(null);
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0 h-11 w-11"
                  aria-label="Add new customer"
                  onClick={() => setShowAddCustomer(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {selectedCustomer && (
                <p className="text-sm text-muted-foreground">
                  {selectedCustomer.phone}
                  {selectedCustomer.email ? ` · ${selectedCustomer.email}` : ""}
                </p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <Label htmlFor="check-in-vehicle">Vehicle</Label>
              <div className="flex gap-2">
                <Select
                  value={vehicleId?.toString() ?? ""}
                  onValueChange={handleVehicleSelect}
                  disabled={!customerId}
                >
                  <SelectTrigger id="check-in-vehicle" className="flex-1">
                    <SelectValue
                      placeholder={
                        !customerId
                          ? "Select a customer first"
                          : vehicles.length === 0
                            ? "No vehicles — add one"
                            : "Select vehicle"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id.toString()}>
                        {v.year} {v.make} {v.model}
                        {v.license_plate ? ` · ${v.license_plate}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0 h-10 w-10"
                  aria-label="Add new vehicle"
                  disabled={!customerId}
                  onClick={() => setShowAddVehicle(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <Label>Common concerns</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {QUICK_CONCERNS.map((item) => (
                    <Button
                      key={item}
                      type="button"
                      size="sm"
                      variant={concerns === item ? "default" : "outline"}
                      className="text-xs h-8"
                      onClick={() => setConcerns(item)}
                    >
                      {item}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="check-in-concerns">Customer concerns *</Label>
                <Textarea
                  id="check-in-concerns"
                  value={concerns}
                  onChange={(e) => setConcerns(e.target.value)}
                  placeholder="Describe the issue or service requested..."
                  rows={3}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="check-in-odometer">Odometer in *</Label>
                  <Input
                    id="check-in-odometer"
                    type="number"
                    min={0}
                    value={odometer}
                    onChange={(e) => setOdometer(e.target.value)}
                    placeholder="Miles / km"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="check-in-priority">Priority</Label>
                  <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                    <SelectTrigger id="check-in-priority" className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4 text-sm">
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
                <p>
                  <span className="text-muted-foreground">Customer: </span>
                  <span className="font-medium">
                    {selectedCustomer?.full_name || selectedCustomer?.company_name}
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground">Vehicle: </span>
                  <span className="font-medium">
                    {selectedVehicle
                      ? `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}`
                      : "—"}
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground">Concerns: </span>
                  <span className="font-medium">{concerns}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Odometer: </span>
                  <span className="font-medium">{odometer}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Priority: </span>
                  <span className="font-medium capitalize">{priority}</span>
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div>
                  <p className="font-medium">Schedule appointment too</p>
                  <p className="text-xs text-muted-foreground">
                    Optional — creates a calendar entry for this visit
                  </p>
                </div>
                <Switch
                  checked={scheduleAppointment}
                  onCheckedChange={setScheduleAppointment}
                  aria-label="Schedule appointment"
                />
              </div>

              {scheduleAppointment && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="check-in-appt-date">Date</Label>
                    <Input
                      id="check-in-appt-date"
                      type="date"
                      value={appointmentDate}
                      onChange={(e) => setAppointmentDate(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="check-in-appt-time">Time</Label>
                    <Input
                      id="check-in-appt-time"
                      type="time"
                      value={appointmentTime}
                      onChange={(e) => setAppointmentTime(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={step === 1 || checkInMutation.isPending}
          onClick={() => setStep((s) => Math.max(1, s - 1))}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        {step < 4 ? (
          <Button
            type="button"
            disabled={!canProceed()}
            onClick={() => setStep((s) => s + 1)}
          >
            Next
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button
            type="button"
            disabled={checkInMutation.isPending}
            onClick={() => checkInMutation.mutate()}
          >
            {checkInMutation.isPending ? "Checking in..." : "Complete check-in"}
          </Button>
        )}
      </div>

      <Dialog
        open={showAddCustomer}
        onOpenChange={(open) => {
          setShowAddCustomer(open);
          if (!open) setDuplicateMatch(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New customer</DialogTitle>
            <DialogDescription>Add a customer without leaving check-in.</DialogDescription>
          </DialogHeader>
          {duplicateMatch && (
            <DuplicateCustomerBanner
              match={duplicateMatch}
              compact
              onUseExisting={() => applyExistingCustomer(duplicateMatch)}
              onDismiss={() => setDuplicateMatch(null)}
            />
          )}
          <CustomerForm
            mode="create"
            hidePortalAccess
            onSubmit={handleCreateCustomer}
            isSubmitting={createCustomerMutation.isPending}
            onCancel={() => {
              setShowAddCustomer(false);
              setDuplicateMatch(null);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={showAddVehicle} onOpenChange={setShowAddVehicle}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Register vehicle</DialogTitle>
            <DialogDescription>Add a vehicle for the selected customer.</DialogDescription>
          </DialogHeader>
          <VehicleForm
            mode="create"
            customerId={customerId?.toString() ?? null}
            serverFieldErrors={vehicleFieldErrors}
            onSubmit={handleCreateVehicle}
            isSubmitting={createVehicleMutation.isPending}
            onCancel={() => setShowAddVehicle(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
