"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AxiosError } from "axios";
import { useToast } from "@/lib/hooks/useToast";
import { CustomerForm, CustomerFormData } from "@/components/customers/CustomerForm";

export default function NewCustomerPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: CustomerFormData) => customersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      // We don't redirect here anymore, we do it in onSubmit to handle vehicle creation
    },

    onError: (error: any) => {
      console.error("Error creating customer:", error);
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to create customer",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: CustomerFormData) => {
    setServerError(null);
    try {
      // Check if email already exists
      if (data.email && data.email.trim()) {
        try {
          const emailCheck = await customersApi.checkEmail(data.email.trim().toLowerCase());
          if (emailCheck.success && emailCheck.exists) {

            const user = emailCheck.user as any;

            const customer = emailCheck.customer as any;
            const displayName = customer
              ? (customer.company_name || `${customer.user?.first_name} ${customer.user?.last_name}` || customer.customer_number)
              : (user ? `${user.first_name} ${user.last_name}` : (user?.email || 'User'));

            toast({
              title: "Email Already Exists",
              description: `A user with email "${data.email}" already exists in the system.`,
              variant: "warning",
            });

            if (emailCheck.customer_id && typeof window !== 'undefined' && confirm(`A user with email "${data.email}" already exists.\n\n${displayName}\n\nWould you like to view the existing customer instead?`)) {
              router.push(`/customers/${emailCheck.customer_id}`);
              return;
            }

            // Note: In the shared component, we can't easily set errors from outside unless exposed.
            // But we can surface it as a general error or alert.
            // Or better, we just proceed and let the server fail if uniqueness is enforced there too.
            // However, the previous logic did client-side pre-check.
            setServerError("A user with this email already exists in the system.");
            return;
          }
        } catch (emailError) {
          console.warn("Email existence check failed:", emailError);
        }
      }

      // Create customer
      const customer = await createMutation.mutateAsync(data);

      toast({
        title: "Success",
        description: "Customer created successfully",
      });

      router.push(`/customers/${customer.id}`);
    } catch (error) {
      console.error("Error creating customer:", error);

      if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data;

        if (errorData.non_field_errors) {
          setServerError(Array.isArray(errorData.non_field_errors) ? errorData.non_field_errors[0] : errorData.non_field_errors);
        } else if (typeof errorData === 'string') {
          setServerError(errorData);
        } else if (errorData.detail) {
          setServerError(errorData.detail);
        } else {
          setServerError("An error occurred. Partial details: " + JSON.stringify(errorData).slice(0, 100));
        }
      } else {
        setServerError("An unexpected error occurred. Please try again.");
      }
    }
  };

  return (
    <div className="max-w-[1700px] mx-auto p-4 md:p-6 space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
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

      {serverError && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800 dark:text-red-300">{serverError}</p>
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
