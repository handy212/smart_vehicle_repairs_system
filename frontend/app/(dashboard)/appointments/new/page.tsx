"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { appointmentsApi } from "@/lib/api/appointments";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { getUserFacingError } from "@/lib/api/errors";
import { AppointmentForm, AppointmentFormData } from "@/components/appointments/AppointmentForm";

export default function NewAppointmentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = searchParams.get("customer");
  const vehicleId = searchParams.get("vehicle");
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: AppointmentFormData) => appointmentsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      router.push("/appointments");
    },
    onError: (error) => {
      console.error("Error creating appointment:", error);
      setServerError(getUserFacingError(error, "We couldn't schedule this appointment. Please check the details and try again."));
    }
  });

  const handleSubmit = async (data: AppointmentFormData) => {
    setServerError(null);
    await createMutation.mutateAsync(data);
  };

  return (
    <div className="w-full space-y-8 pb-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 sm:items-center sm:gap-4">
          <Link href="/appointments">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">Schedule Appointment</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Create a new service appointment
            </p>
          </div>
        </div>
      </div>

      {serverError && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 dark:bg-destructive/20 border border-destructive/20 dark:border-destructive/30">
          <AlertCircle className="w-5 h-5 text-destructive dark:text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-sm text-destructive dark:text-destructive">{serverError}</p>
        </div>
      )}

      <AppointmentForm
        customerId={customerId}
        vehicleId={vehicleId}
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        mode="create"
        onCancel={() => router.push("/appointments")}
      />
    </div>
  );
}
