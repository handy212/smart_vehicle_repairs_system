"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ArrowLeft, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AxiosError } from "axios";

const customerSchema = z.object({
  // User fields
  email: z.string().email("Invalid email address"),
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  phone: z.string().optional(),
  
  // Customer fields
  customer_type: z.enum(["individual", "business", "fleet"]),
  company_name: z.string().optional(),
  business_type: z.string().optional(),
  tax_id: z.string().optional(),
  payment_terms: z.enum(["due_on_receipt", "net_15", "net_30", "net_60", "prepaid"]).optional(),
  status: z.enum(["active", "inactive", "suspended"]),
});

type CustomerFormData = z.infer<typeof customerSchema>;

export default function NewCustomerPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setError,
  } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      status: "active",
      customer_type: "individual",
      payment_terms: "due_on_receipt",
    },
  });

  const customerType = watch("customer_type");

  const createMutation = useMutation({
    mutationFn: (data: CustomerFormData) => customersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      router.push("/customers");
    },
    onError: (error: any) => {
      console.error("Error creating customer:", error);
      // You can add toast notification here
    },
  });

  const onSubmit = async (data: CustomerFormData) => {
    setServerError(null);
    try {
      await createMutation.mutateAsync(data);
    } catch (error) {
      console.error("Error creating customer:", error);
      
      if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data;
        
        // Handle field-level errors
        if (errorData.email) {
          const emailError = Array.isArray(errorData.email) 
            ? errorData.email[0] 
            : errorData.email;
          setError("email", { 
            type: "server", 
            message: emailError 
          });
        }
        
        if (errorData.company_name) {
          const companyError = Array.isArray(errorData.company_name) 
            ? errorData.company_name[0] 
            : errorData.company_name;
          setError("company_name", { 
            type: "server", 
            message: companyError 
          });
        }
        
        // Handle non-field errors
        if (errorData.non_field_errors) {
          const nonFieldError = Array.isArray(errorData.non_field_errors)
            ? errorData.non_field_errors[0]
            : errorData.non_field_errors;
          setServerError(nonFieldError);
        } else if (typeof errorData === 'string') {
          setServerError(errorData);
        } else if (errorData.detail) {
          setServerError(errorData.detail);
        } else {
          setServerError("An error occurred while creating the customer. Please try again.");
        }
      } else {
        setServerError("An unexpected error occurred. Please try again.");
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/customers">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">New Customer</h1>
          <p className="text-sm text-gray-500 mt-1">Create a new customer account</p>
        </div>
      </div>

      {serverError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2 text-red-700">
              <AlertCircle className="w-5 h-5" />
              <p className="text-sm font-medium">{serverError}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Personal Information */}
            <Card>
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
                <CardDescription>Basic customer information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="first_name" className="block text-sm font-medium text-gray-700 mb-1">
                      First Name *
                    </label>
                    <Input
                      id="first_name"
                      {...register("first_name")}
                      className={errors.first_name ? "border-red-500" : ""}
                    />
                    {errors.first_name && (
                      <p className="mt-1 text-sm text-red-600">{errors.first_name.message}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="last_name" className="block text-sm font-medium text-gray-700 mb-1">
                      Last Name *
                    </label>
                    <Input
                      id="last_name"
                      {...register("last_name")}
                      className={errors.last_name ? "border-red-500" : ""}
                    />
                    {errors.last_name && (
                      <p className="mt-1 text-sm text-red-600">{errors.last_name.message}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email *
                  </label>
                  <Input
                    id="email"
                    type="email"
                    {...register("email")}
                    className={errors.email ? "border-red-500" : ""}
                  />
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                    Phone
                  </label>
                  <Input
                    id="phone"
                    type="tel"
                    {...register("phone")}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Customer Type & Business Info */}
            <Card>
              <CardHeader>
                <CardTitle>Customer Type</CardTitle>
                <CardDescription>Select the type of customer</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label htmlFor="customer_type" className="block text-sm font-medium text-gray-700 mb-1">
                    Customer Type *
                  </label>
                  <Select
                    id="customer_type"
                    {...register("customer_type")}
                  >
                    <option value="individual">Individual</option>
                    <option value="business">Business</option>
                    <option value="fleet">Fleet</option>
                  </Select>
                </div>

                {(customerType === "business" || customerType === "fleet") && (
                  <>
                    <div>
                      <label htmlFor="company_name" className="block text-sm font-medium text-gray-700 mb-1">
                        Company Name *
                      </label>
                      <Input
                        id="company_name"
                        {...register("company_name")}
                        className={errors.company_name ? "border-red-500" : ""}
                      />
                      {errors.company_name && (
                        <p className="mt-1 text-sm text-red-600">{errors.company_name.message}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="business_type" className="block text-sm font-medium text-gray-700 mb-1">
                        Business Type
                      </label>
                      <Input
                        id="business_type"
                        {...register("business_type")}
                        placeholder="e.g., Construction, Delivery, etc."
                      />
                    </div>
                    <div>
                      <label htmlFor="tax_id" className="block text-sm font-medium text-gray-700 mb-1">
                        Tax ID
                      </label>
                      <Input
                        id="tax_id"
                        {...register("tax_id")}
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Payment & Status */}
            <Card>
              <CardHeader>
                <CardTitle>Payment & Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label htmlFor="payment_terms" className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Terms
                  </label>
                  <Select
                    id="payment_terms"
                    {...register("payment_terms")}
                  >
                    <option value="due_on_receipt">Due on Receipt</option>
                    <option value="net_15">Net 15</option>
                    <option value="net_30">Net 30</option>
                    <option value="net_60">Net 60</option>
                    <option value="prepaid">Prepaid</option>
                  </Select>
                </div>

                <div>
                  <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <Select
                    id="status"
                    {...register("status")}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar Actions */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Creating..." : "Create Customer"}
                </Button>
                <Link href="/customers">
                  <Button type="button" variant="outline" className="w-full">
                    Cancel
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}

