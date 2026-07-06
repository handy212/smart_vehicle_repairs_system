"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { servicesApi, ServiceType, VehicleServiceSchedule } from "@/lib/api/services";
import { inventoryApi } from "@/lib/api/inventory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, CheckCircle2, Info, Package } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils/cn";

const scheduleSchema = z.object({
  service_type: z.number().min(1, "Service type is required"),
  last_service_date: z.string().optional().nullable(),
  last_service_mileage: z.number().optional().nullable(),
  interval_months: z.number().min(0, "Interval must be 0 or more").optional().nullable(),
  interval_miles: z.number().min(0, "Interval must be 0 or more").optional().nullable(),
  is_active: z.boolean(),
  notes: z.string().optional(),
});

type ScheduleFormData = z.infer<typeof scheduleSchema>;

interface ServiceScheduleFormProps {
  vehicleId: number;
  initialData?: VehicleServiceSchedule | null;
  onSubmit: (data: any) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function ServiceScheduleForm({
  vehicleId,
  initialData,
  onSubmit,
  onCancel,
  isSubmitting
}: ServiceScheduleFormProps) {
  const [selectedType, setSelectedType] = useState<ServiceType | null>(null);

  const { data: serviceTypesData } = useQuery({
    queryKey: ["service-types", "active"],
    queryFn: () => servicesApi.listServiceTypes({ is_active: true }),
  });

  const serviceTypes = serviceTypesData?.results || [];

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors }
  } = useForm<ScheduleFormData>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      service_type: typeof initialData?.service_type === 'number' 
        ? initialData.service_type 
        : (initialData?.service_type as any)?.id,
      last_service_date: initialData?.last_service_date || "",
      last_service_mileage: initialData?.last_service_mileage || null,
      interval_months: initialData?.interval_months || null,
      interval_miles: initialData?.interval_miles || null,
      is_active: initialData?.is_active ?? true,
      notes: initialData?.notes || "",
    }
  });

  const watchServiceType = watch("service_type");

  // Fetch bundle details if selected service type has a bundle
  const { data: bundleData } = useQuery({
    queryKey: ["service-bundle", watchServiceType],
    queryFn: () => inventoryApi.listBundles({ service_type: watchServiceType }),
    enabled: !!watchServiceType,
  });

  const bundle = Array.isArray(bundleData) ? bundleData[0] : (bundleData as any)?.results?.[0];

  // Update selected type object and auto-fill when service type changes
  useEffect(() => {
    if (watchServiceType) {
      const type = serviceTypes.find(t => t.id === watchServiceType);
      if (type) {
        setSelectedType(type);
        
        // Auto-fill intervals if they are currently null/empty and it's a NEW schedule
        if (!initialData) {
          if (type.default_interval_months !== null) {
            setValue("interval_months", type.default_interval_months);
          }
          if (type.default_interval_miles !== null) {
            setValue("interval_miles", type.default_interval_miles);
          }
        }
      }
    } else {
      setSelectedType(null);
    }
  }, [watchServiceType, serviceTypes, setValue, initialData]);

  // Determine field visibility
  const showMiles = selectedType ? selectedType.default_interval_miles !== null : true;
  const showMonths = selectedType ? selectedType.default_interval_months !== null : true;

  return (
    <div className="space-y-6 py-2">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="service_type">Service Type <span className="text-destructive">*</span></Label>
            <select
              id="service_type"
              {...register("service_type", { valueAsNumber: true })}
              className={cn(
                "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                errors.service_type ? "border-destructive" : ""
              )}
            >
              <option value="">Select a service type</option>
              {serviceTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
            {errors.service_type && <p className="text-xs text-destructive">{errors.service_type.message}</p>}
          </div>

          {selectedType && (
             <div className="bg-muted/50 p-3 rounded-md text-xs text-muted-foreground flex gap-2 items-start">
               <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
               <div>
                 <p className="font-medium text-foreground">{selectedType.name}</p>
                 <p>{selectedType.description}</p>
               </div>
             </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {showMonths && (
              <div className="space-y-2">
                <Label htmlFor="last_service_date">Last Service Date</Label>
                <Input
                  type="date"
                  id="last_service_date"
                  {...register("last_service_date")}
                />
              </div>
            )}
            {showMiles && (
              <div className="space-y-2">
                <Label htmlFor="last_service_mileage">Last Service Mileage</Label>
                <Input
                  type="number"
                  id="last_service_mileage"
                  {...register("last_service_mileage", { valueAsNumber: true })}
                  placeholder="0"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {showMonths && (
              <div className="space-y-2">
                <Label htmlFor="interval_months">Interval (Months)</Label>
                <Input
                  type="number"
                  id="interval_months"
                  {...register("interval_months", { valueAsNumber: true })}
                  placeholder="e.g. 6"
                />
                <p className="text-[10px] text-muted-foreground">0 for one-time service</p>
              </div>
            )}
            {showMiles && (
              <div className="space-y-2">
                <Label htmlFor="interval_miles">Interval (Miles)</Label>
                <Input
                  type="number"
                  id="interval_miles"
                  {...register("interval_miles", { valueAsNumber: true })}
                  placeholder="e.g. 5000"
                />
                <p className="text-[10px] text-muted-foreground">0 for one-time service</p>
              </div>
            )}
          </div>

          {bundle && (
             <div className="border border-primary/20 bg-primary/5 rounded-md p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <Package className="w-4 h-4" />
                  <span>Associated Bundle: {bundle.name}</span>
                </div>
                <div className="space-y-1">
                  {bundle.items?.map((item: any, i: number) => (
                    <div key={i} className="text-xs flex justify-between border-b border-primary/10 pb-1 last:border-0">
                      <span className="text-muted-foreground">{item.part_name}</span>
                      <span className="font-medium">x{item.quantity} {item.unit}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground italic">
                  Parts will be automatically suggested when creating work orders for this service.
                </p>
             </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              {...register("notes")}
              placeholder="Any special instructions..."
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
               <div className="flex items-center gap-2">
                 <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                 Saving...
               </div>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                {initialData ? "Update Schedule" : "Add Service"}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
