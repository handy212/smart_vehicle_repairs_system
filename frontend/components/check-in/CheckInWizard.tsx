"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { workordersApi } from "@/lib/api/workorders";
import { customersApi } from "@/lib/api/customers";
import { vehiclesApi } from "@/lib/api/vehicles";
import { appointmentsApi } from "@/lib/api/appointments";
import { inventoryApi, type ServiceBundle } from "@/lib/api/inventory";
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
import { Badge } from "@/components/ui/badge";
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
  AlertTriangle,
  HeartPulse,
  PlusCircle,
} from "lucide-react";
import { findDuplicateCustomerByEmail } from "@/lib/utils/duplicate-customer";
import type { DuplicateCustomerMatch } from "@/lib/utils/duplicate-customer";
import { DuplicateCustomerBanner } from "@/components/customers/DuplicateCustomerBanner";
import {
  COMMON_CUSTOMER_CONCERNS,
  mergeConcernSelections,
} from "@/lib/constants/common-concerns";
import { AxiosError } from "axios";

const STEPS = [
  { id: 1, label: "Customer", icon: User },
  { id: 2, label: "Vehicle", icon: Car },
  { id: 3, label: "Service", icon: ClipboardList },
  { id: 4, label: "Review", icon: CheckCircle2 },
] as const;

type SuggestedService = {
  suggested_service_id: number;
  suggested_service_name: string;
  suggested_bundle_id?: number | null;
  reason: string;
  last_service_id?: number;
  last_service_name?: string;
  last_service_date?: string;
  smart_suggestions?: Array<{
    id: number;
    service_type_id: number;
    service_type_name: string;
    is_due: boolean;
    is_due_soon: boolean;
    estimated_due_date: string | null;
    days_until_due: number | null;
  }>;
};

export function CheckInWizard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [selectedConcerns, setSelectedConcerns] = useState<string[]>([]);
  const [customConcerns, setCustomConcerns] = useState("");
  const [odometer, setOdometer] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [maintenanceType, setMaintenanceType] = useState<"general" | "routine">("general");
  const [serviceBundleId, setServiceBundleId] = useState<number | null>(null);
  const [serviceTypeId, setServiceTypeId] = useState<number | null>(null);
  const [progressionWarning, setProgressionWarning] = useState<string | null>(null);
  const [suggestedService, setSuggestedService] = useState<SuggestedService | null>(null);
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

  const { data: bundlesData } = useQuery({
    queryKey: ["inventory", "bundles", "active"],
    queryFn: () => inventoryApi.listBundles({ is_active: true }),
  });

  const bundles = useMemo(() => {
    if (!bundlesData) return [] as ServiceBundle[];
    return Array.isArray(bundlesData) ? bundlesData : (bundlesData as { results?: ServiceBundle[] }).results ?? [];
  }, [bundlesData]);

  const selectedBundle = useMemo(
    () => bundles.find((bundle) => bundle.id === serviceBundleId) ?? null,
    [bundles, serviceBundleId]
  );

  const { data: bundleDetail } = useQuery({
    queryKey: ["inventory", "bundle", serviceBundleId],
    queryFn: () => inventoryApi.getBundle(serviceBundleId!),
    enabled: maintenanceType === "routine" && !!serviceBundleId,
  });

  const bundleItems = bundleDetail?.items ?? selectedBundle?.items ?? [];

  const concerns = useMemo(
    () => mergeConcernSelections(selectedConcerns, customConcerns),
    [selectedConcerns, customConcerns]
  );

  const toggleConcern = (concern: string) => {
    setSelectedConcerns((prev) =>
      prev.includes(concern) ? prev.filter((c) => c !== concern) : [...prev, concern]
    );
  };

  const setRoutineConcerns = (text: string) => {
    setSelectedConcerns([]);
    setCustomConcerns(text);
  };

  useEffect(() => {
    if (!vehicleId) {
      setSuggestedService(null);
      setProgressionWarning(null);
      return;
    }

    vehiclesApi
      .getSuggestedService(vehicleId)
      .then((data) => {
        setSuggestedService(data as SuggestedService);
        if (maintenanceType === "routine" && !serviceBundleId && data.suggested_bundle_id) {
          setServiceBundleId(data.suggested_bundle_id);
          setServiceTypeId(data.suggested_service_id);
          const bundle = bundles.find((b) => b.id === data.suggested_bundle_id);
          if (bundle) {
            setRoutineConcerns(`Perform ${bundle.name}`);
          }
        }
      })
      .catch(() => setSuggestedService(null));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-fetch when vehicle changes
  }, [vehicleId]);

  const handleMaintenanceTypeChange = (type: "general" | "routine") => {
    setMaintenanceType(type);
    setProgressionWarning(null);
    if (type === "general") {
      setServiceBundleId(null);
      setServiceTypeId(null);
      return;
    }
    if (suggestedService?.suggested_bundle_id) {
      setServiceBundleId(suggestedService.suggested_bundle_id);
      setServiceTypeId(suggestedService.suggested_service_id);
      const bundle = bundles.find((b) => b.id === suggestedService.suggested_bundle_id);
      if (bundle) {
        setRoutineConcerns(`Perform ${bundle.name}`);
      }
    }
  };

  const handleServiceBundleChange = (bundleId: number) => {
    setServiceBundleId(bundleId);
    const bundle = bundles.find((b) => b.id === bundleId);
    if (!bundle) return;

    setServiceTypeId(bundle.service_type);

    if (suggestedService) {
      if (suggestedService.last_service_id === bundle.service_type) {
        setProgressionWarning(
          `Warning: ${suggestedService.last_service_name} was already performed on ${suggestedService.last_service_date}. It is recommended to perform ${suggestedService.suggested_service_name} now.`
        );
      } else if (suggestedService.suggested_service_id !== bundle.service_type) {
        setProgressionWarning(
          `Note: ${suggestedService.suggested_service_name} is the expected next service based on history.`
        );
      } else {
        setProgressionWarning(null);
      }
    }

    setRoutineConcerns(`Perform ${bundle.name}`);
  };

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
      const bundle = bundles.find((b) => b.id === serviceBundleId);
      const concernText =
        concerns.trim() ||
        (maintenanceType === "routine" && bundle ? `Perform ${bundle.name}` : "");

      const wo = await workordersApi.create({
        customer: customerId!,
        vehicle: vehicleId!,
        customer_concerns: concernText,
        odometer_in: parseInt(odometer, 10) || 0,
        priority,
        status: "draft",
        maintenance_type: maintenanceType,
        ...(maintenanceType === "routine" && serviceTypeId ? { service_type: serviceTypeId } : {}),
        ...(maintenanceType === "routine" && serviceBundleId ? { service_bundle: serviceBundleId } : {}),
      });

      if (scheduleAppointment) {
        await appointmentsApi.create({
          customer: customerId!,
          vehicle: vehicleId!,
          appointment_date: appointmentDate,
          appointment_time: appointmentTime,
          service_type: maintenanceType === "routine" ? "maintenance" : "repair",
          priority,
          customer_concerns: concernText || undefined,
        });
      }

      return wo;
    },
    onSuccess: (wo) => {
      queryClient.invalidateQueries({ queryKey: ["workorders"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      const isRoutine = maintenanceType === "routine";
      toast({
        title: "Check-in complete",
        description: isRoutine
          ? "Routine service work order created with bundle parts and tasks."
          : scheduleAppointment
            ? "Work order and appointment created."
            : "Work order created. Complete the intake inspection when ready.",
        variant: "success",
      });
      router.push(
        isRoutine
          ? `/workorders/${wo.id}?from=check-in&flow=routine&tab=parts`
          : `/workorders/${wo.id}?from=check-in`
      );
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
    if (step === 3) {
      const hasOdometer = odometer.trim().length > 0;
      if (maintenanceType === "routine") {
        return hasOdometer && !!serviceBundleId;
      }
      const hasConcerns = selectedConcerns.length > 0 || customConcerns.trim().length > 0;
      return hasOdometer && hasConcerns;
    }
    return true;
  };

  const handleVehicleSelect = (id: string) => {
    const vid = parseInt(id, 10);
    setVehicleId(vid);
    setServiceBundleId(null);
    setServiceTypeId(null);
    setProgressionWarning(null);
    setSuggestedService(null);
    setSelectedConcerns([]);
    setCustomConcerns("");
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
            {step === 3 && "Choose maintenance type, service bundle if routine, and record intake details."}
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
              {suggestedService?.smart_suggestions && suggestedService.smart_suggestions.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/30 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
                    <HeartPulse className="h-4 w-4" />
                    Smart preventive suggestions
                  </div>
                  <ul className="space-y-2">
                    {suggestedService.smart_suggestions.map((service) => (
                      <li
                        key={service.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-md border bg-background/70 p-3 text-sm"
                      >
                        <div>
                          <span className="font-medium flex items-center gap-2">
                            {service.service_type_name}
                            {service.is_due ? (
                              <Badge variant="destructive" className="text-[10px] h-4 px-1">OVERDUE</Badge>
                            ) : service.is_due_soon ? (
                              <Badge variant="secondary" className="text-[10px] h-4 px-1">DUE SOON</Badge>
                            ) : null}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          type="button"
                          onClick={() => toggleConcern(`Perform ${service.service_type_name}`)}
                        >
                          <PlusCircle className="h-4 w-4 mr-1" />
                          Add to request
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <Label>Maintenance type</Label>
                <div className="mt-2 flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="maintenance_type"
                      checked={maintenanceType === "general"}
                      onChange={() => handleMaintenanceTypeChange("general")}
                      className="h-4 w-4 text-primary border-border focus:ring-primary"
                    />
                    <span className="text-sm font-medium">General repair</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="maintenance_type"
                      checked={maintenanceType === "routine"}
                      onChange={() => handleMaintenanceTypeChange("routine")}
                      className="h-4 w-4 text-primary border-border focus:ring-primary"
                    />
                    <span className="text-sm font-medium">Routine service</span>
                  </label>
                </div>
              </div>

              {maintenanceType === "routine" && (
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <Label htmlFor="check-in-service-type">Service type *</Label>
                    {suggestedService && (
                      <Badge variant="outline" className="text-[10px]">
                        Suggested: {suggestedService.suggested_service_name}
                      </Badge>
                    )}
                  </div>
                  <Select
                    value={serviceBundleId?.toString() ?? ""}
                    onValueChange={(val) => handleServiceBundleChange(parseInt(val, 10))}
                  >
                    <SelectTrigger id="check-in-service-type">
                      <SelectValue placeholder="Select service bundle" />
                    </SelectTrigger>
                    <SelectContent>
                      {bundles.map((bundle) => (
                        <SelectItem key={bundle.id} value={bundle.id.toString()}>
                          {bundle.name}
                          {bundle.service_type_name ? ` · ${bundle.service_type_name}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {progressionWarning && (
                    <p className="mt-2 text-xs font-medium text-primary flex items-start gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      {progressionWarning}
                    </p>
                  )}

                  {bundleItems.length > 0 && (
                    <div className="mt-4 rounded-lg border border-border bg-muted/30 overflow-hidden">
                      <div className="px-3 py-2 border-b border-border bg-muted/50">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Included in this service ({bundleItems.length} items)
                        </p>
                      </div>
                      <ul className="divide-y divide-border max-h-48 overflow-y-auto">
                        {bundleItems.map((item) => (
                          <li
                            key={item.id}
                            className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                          >
                            <span className="font-medium truncate">{item.part_name}</span>
                            <span className="text-muted-foreground shrink-0 tabular-nums">
                              ×{item.quantity}
                              {item.unit ? ` ${item.unit}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border">
                        These parts and service tasks will be added to the work order automatically.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {maintenanceType === "general" && (
                <div className="space-y-3">
                  <div>
                    <Label>Common concerns</Label>
                    <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                      Select one or more — they appear in the summary below.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto rounded-lg border border-border p-3 bg-muted/20">
                      {COMMON_CUSTOMER_CONCERNS.map((item) => {
                        const checked = selectedConcerns.includes(item);
                        return (
                          <label
                            key={item}
                            className={cn(
                              "flex items-start gap-2 rounded-md border px-2.5 py-2 cursor-pointer text-xs leading-snug transition-colors",
                              checked
                                ? "border-primary bg-primary/5 text-foreground"
                                : "border-transparent hover:border-border hover:bg-background"
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleConcern(item)}
                              className="mt-0.5 rounded border-border text-primary focus:ring-primary"
                            />
                            <span>{item}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {selectedConcerns.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedConcerns.map((item) => (
                        <Badge key={item} variant="secondary" className="text-[11px] font-normal">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <Label htmlFor="check-in-concerns">
                  {maintenanceType === "routine" ? "Service notes" : "Additional details"}
                  {maintenanceType === "general" ? " *" : ""}
                </Label>
                <Textarea
                  id="check-in-concerns"
                  value={customConcerns}
                  onChange={(e) => setCustomConcerns(e.target.value)}
                  placeholder={
                    maintenanceType === "routine"
                      ? "Optional notes for this routine service..."
                      : selectedConcerns.length > 0
                        ? "Add any extra details not covered above..."
                        : "Describe the issue or service requested..."
                  }
                  rows={3}
                  className="mt-1"
                />
                {maintenanceType === "general" && concerns.trim().length > 0 && (
                  <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Request summary
                    </p>
                    <ul className="space-y-1 text-sm">
                      {concerns.split("\n").filter(Boolean).map((line) => (
                        <li key={line} className="flex gap-2">
                          <span className="text-primary">•</span>
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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
                  <span className="text-muted-foreground">Maintenance: </span>
                  <span className="font-medium capitalize">
                    {maintenanceType === "routine" ? "Routine service" : "General repair"}
                  </span>
                </p>
                {maintenanceType === "routine" && selectedBundle && (
                  <p>
                    <span className="text-muted-foreground">Service type: </span>
                    <span className="font-medium">
                      {selectedBundle.name}
                      {selectedBundle.service_type_name ? ` (${selectedBundle.service_type_name})` : ""}
                    </span>
                  </p>
                )}
                {maintenanceType === "routine" && bundleItems.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Bundle items: </span>
                    <ul className="mt-1 space-y-0.5 font-medium">
                      {bundleItems.map((item) => (
                        <li key={item.id}>
                          {item.part_name} ×{item.quantity}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">
                    {maintenanceType === "routine" ? "Service notes: " : "Concerns: "}
                  </span>
                  {concerns.trim() ? (
                    <ul className="mt-1 space-y-0.5 font-medium">
                      {concerns.split("\n").filter(Boolean).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="font-medium">—</span>
                  )}
                </div>
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
