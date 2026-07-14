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
import {
  JOB_TYPE_FIELD_LABEL,
  SERVICE_PACKAGE_LABEL,
} from "@/lib/workorders/job-type-labels";
import {
  isFastTrackJobType,
  jobTypeRequiresBundle,
  type JobType,
} from "@/lib/api/job-types";
import { ServiceIntakeFields } from "@/components/workorders/ServiceIntakeFields";
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
import { mergeConcernSelections } from "@/lib/constants/common-concerns";
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
  const [selectedJobTypeCode, setSelectedJobTypeCode] = useState("general_repairs");
  const [selectedJobTypeCodes, setSelectedJobTypeCodes] = useState<string[]>(["general_repairs"]);
  const [selectedJobType, setSelectedJobType] = useState<JobType | null>(null);
  const [selectedJobTypes, setSelectedJobTypes] = useState<JobType[]>([]);
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

  const isFastTrack = isFastTrackJobType(selectedJobType);
  const bundleRequired = jobTypeRequiresBundle(selectedJobType);

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
    enabled: bundleRequired && !!serviceBundleId,
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
        if (!data?.suggested_service_id) {
          setSuggestedService(null);
          return;
        }
        setSuggestedService(data as SuggestedService);
        if (isFastTrackJobType(selectedJobType) && !serviceBundleId && data.suggested_bundle_id) {
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

  const handleJobTypeChange = (code: string, jobType: JobType | null) => {
    setSelectedJobTypeCode(code);
    setSelectedJobType(jobType);
    setProgressionWarning(null);
    if (!jobTypeRequiresBundle(jobType)) {
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

  const handleJobTypesChange = (codes: string[], types: JobType[]) => {
    setSelectedJobTypeCodes(codes);
    setSelectedJobTypes(types);
    handleJobTypeChange(codes[0] || "general_repairs", types[0] ?? null);
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
        (isFastTrack && bundle ? `Perform ${bundle.name}` : "");

      const wo = await workordersApi.create({
        customer: customerId!,
        vehicle: vehicleId!,
        customer_concerns: concernText,
        odometer_in: parseInt(odometer, 10) || 0,
        priority,
        status: "draft",
        job_type_code: selectedJobTypeCode,
        job_type_codes: selectedJobTypeCodes.length
          ? selectedJobTypeCodes
          : [selectedJobTypeCode],
        ...(serviceTypeId ? { service_type: serviceTypeId } : {}),
        ...(serviceBundleId ? { service_bundle: serviceBundleId } : {}),
      });

      if (scheduleAppointment) {
        await appointmentsApi.create({
          customer: customerId!,
          vehicle: vehicleId!,
          appointment_date: appointmentDate,
          appointment_time: appointmentTime,
          job_type_code: selectedJobTypeCode,
          priority,
          customer_concerns: concernText || undefined,
        });
      }

      return wo;
    },
    onSuccess: (wo) => {
      queryClient.invalidateQueries({ queryKey: ["workorders"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      const isRoutineFlow = isFastTrack;
      toast({
        title: "Check-in complete",
        description: isRoutineFlow
          ? "Service work order created with bundle parts and tasks."
          : scheduleAppointment
            ? "Work order and appointment created."
            : "Work order created. Complete the intake inspection when ready.",
        variant: "success",
      });
      router.push(
        isRoutineFlow
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
      if (bundleRequired) {
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
          const canJump = s.id < step;
          return (
            <div key={s.id} className="flex items-center flex-1 min-w-0">
              <button
                type="button"
                disabled={!canJump}
                onClick={() => canJump && setStep(s.id)}
                className={cn(
                  "flex flex-col items-center gap-1 flex-1 min-w-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive && "text-primary",
                  isDone && "text-primary",
                  !isActive && !isDone && "text-muted-foreground",
                  canJump && "cursor-pointer hover:opacity-90"
                )}
              >
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors",
                    isActive && "border-primary bg-primary text-primary-foreground shadow-sm",
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
              </button>
              {index < STEPS.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 mx-1 mb-5 sm:mb-6 transition-colors",
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
            {step === 3 && "What are we doing today?"}
            {step === 4 && "Review & check in"}
          </CardTitle>
          <CardDescription>
            {step === 1 && "Search by name, phone, or customer number."}
            {step === 2 && "Choose the vehicle being dropped off today."}
            {step === 3 && "Job type, package if needed, and the customer’s request."}
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
            <ServiceIntakeFields
              idPrefix="check-in"
              jobTypeCode={selectedJobTypeCode}
              jobTypeCodes={selectedJobTypeCodes}
              onJobTypeChange={handleJobTypeChange}
              onJobTypesChange={handleJobTypesChange}
              primaryJobType={selectedJobType}
              selectedJobTypes={selectedJobTypes}
              bundles={bundles}
              serviceBundleId={serviceBundleId}
              onServiceBundleChange={(bundleId) => handleServiceBundleChange(bundleId)}
              suggestedService={suggestedService}
              progressionWarning={progressionWarning}
              selectedConcerns={selectedConcerns}
              onToggleConcern={toggleConcern}
              customConcerns={customConcerns}
              onCustomConcernsChange={setCustomConcerns}
              concernsPreview={concerns}
              odometer={odometer}
              onOdometerChange={setOdometer}
              priority={priority}
              onPriorityChange={setPriority}
            />
          )}

          {step === 4 && (
            <div className="space-y-4 text-sm">
              <div className="overflow-hidden rounded-xl border border-border divide-y divide-border">
                {[
                  {
                    label: "Customer",
                    value: selectedCustomer?.full_name || selectedCustomer?.company_name || "—",
                  },
                  {
                    label: "Vehicle",
                    value: selectedVehicle
                      ? `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}${selectedVehicle.license_plate ? ` · ${selectedVehicle.license_plate}` : ""}`
                      : "—",
                  },
                  {
                    label: JOB_TYPE_FIELD_LABEL,
                    value: selectedJobTypes.length > 1
                      ? selectedJobTypes.map((jt) => jt.name).join(", ")
                      : selectedJobType?.name ?? "General repair",
                  },
                  ...(bundleRequired && selectedBundle
                    ? [{
                        label: SERVICE_PACKAGE_LABEL,
                        value: `${selectedBundle.name}${selectedBundle.service_type_name ? ` (${selectedBundle.service_type_name})` : ""}`,
                      }]
                    : []),
                  {
                    label: isFastTrack ? "Service notes" : "Concerns",
                    value: concerns.trim() || "—",
                    multiline: true,
                  },
                  { label: "Odometer", value: odometer || "—" },
                  { label: "Priority", value: priority },
                ].map((row) => (
                  <div key={row.label} className="grid grid-cols-[7.5rem_1fr] gap-3 px-4 py-3">
                    <span className="text-muted-foreground">{row.label}</span>
                    {"multiline" in row && row.multiline && row.value !== "—" ? (
                      <ul className="space-y-0.5 font-medium">
                        {String(row.value)
                          .split("\n")
                          .filter(Boolean)
                          .map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                      </ul>
                    ) : (
                      <span className="font-medium capitalize">{row.value}</span>
                    )}
                  </div>
                ))}
                {bundleRequired && bundleItems.length > 0 && (
                  <div className="px-4 py-3">
                    <p className="mb-2 text-muted-foreground">Package includes</p>
                    <ul className="grid gap-1 sm:grid-cols-2">
                      {bundleItems.map((item) => (
                        <li key={item.id} className="font-medium">
                          {item.part_name} ×{item.quantity}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border p-4">
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

      <div className="sticky bottom-0 z-10 -mx-1 flex justify-between gap-3 border-t border-border/60 bg-background/95 px-1 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
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
            {step === 3 ? "Review" : "Next"}
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
