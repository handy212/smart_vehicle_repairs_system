"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { getUserFacingError } from "@/lib/api/errors";
import { useToast } from "@/lib/hooks/useToast";
import { CustomerForm, CustomerFormData } from "@/components/customers/CustomerForm";
import { DuplicateCustomerBanner } from "@/components/customers/DuplicateCustomerBanner";
import { findDuplicateCustomerByEmail } from "@/lib/utils/duplicate-customer";
import type { DuplicateCustomerMatch } from "@/lib/utils/duplicate-customer";
import { INTAKE_FORM_CLASS } from "@/lib/constants/layout";

export default function NewCustomerPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const [duplicateMatch, setDuplicateMatch] = useState<DuplicateCustomerMatch | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: CustomerFormData) => customersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (error: unknown) => {
      console.error("Error creating customer:", error);
      toast({
        title: "Couldn't create customer",
        description: getUserFacingError(error, "Please check the form and try again."),
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: CustomerFormData) => {
    setServerError(null);
    setDuplicateMatch(null);

    try {
      if (data.email?.trim()) {
        const duplicate = await findDuplicateCustomerByEmail(data.email);
        if (duplicate) {
          setDuplicateMatch(duplicate);
          toast({
            title: "Email already registered",
            description: `${duplicate.displayName} uses this email.`,
            variant: "warning",
          });
          return;
        }
      }

      const customer = await createMutation.mutateAsync(data);

      toast({
        title: "Success",
        description: "Customer created successfully",
      });

      router.push(`/customers/${customer.id}`);
    } catch (error) {
      console.error("Error creating customer:", error);
      setServerError(getUserFacingError(error, "We couldn't create this customer. Please check the form and try again."));
    }
  };

  return (
    <div className={`${INTAKE_FORM_CLASS} p-4 md:p-6 space-y-8 pb-12`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 sm:items-center sm:gap-4">
          <Link href="/customers">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Create New Customer</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Add a new customer to the system
            </p>
          </div>
        </div>
      </div>

      {duplicateMatch && (
        <DuplicateCustomerBanner
          match={duplicateMatch}
          viewHref={`/customers/${duplicateMatch.customerId}`}
          onUseExisting={() => router.push(`/customers/${duplicateMatch.customerId}`)}
          onDismiss={() => setDuplicateMatch(null)}
        />
      )}

      {serverError && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
          <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{serverError}</p>
        </div>
      )}

      <CustomerForm
        onSubmit={onSubmit}
        isSubmitting={createMutation.isPending}
        mode="create"
        onCancel={() => router.push("/customers")}
      />
    </div>
  );
}
