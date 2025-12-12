"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowLeft, AlertCircle, RefreshCw, Copy, Eye, EyeOff, UserPlus, Building2 } from "lucide-react";
import Link from "next/link";
import { useState, useCallback } from "react";
import { AxiosError } from "axios";
import { useToast } from "@/lib/hooks/useToast";

const customerSchema = z.object({
  // User fields
  email: z.string().email("Invalid email address"),
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  phone: z.string().optional(),
  password: z.string().optional(),
  
  // Portal access
  grant_portal_access: z.boolean().optional(),
  send_welcome_email: z.boolean().optional(),
  
  // Customer fields
  customer_type: z.enum(["individual", "business", "fleet"]),
  company_name: z.string().optional(),
  business_type: z.string().optional(),
  tax_id: z.string().optional(),
  payment_terms: z.enum(["due_on_receipt", "net_15", "net_30", "net_60", "prepaid"]).optional(),
  status: z.enum(["active", "inactive", "suspended"]),
}).refine((data) => {
  // If portal access is granted, password is required (or will be auto-generated)
  return true; // We'll handle password generation in the UI
}, {
  message: "Password is required when granting portal access",
  path: ["password"],
});

type CustomerFormData = z.infer<typeof customerSchema>;

export default function NewCustomerPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setError,
    setValue,
  } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      status: "active",
      customer_type: "individual",
      payment_terms: "due_on_receipt",
      grant_portal_access: false,
      send_welcome_email: false,
    },
  });

  const customerType = watch("customer_type");
  const grantPortalAccess = watch("grant_portal_access");
  const passwordValue = watch("password");

  // Generate secure password
  const generatePassword = useCallback(() => {
    const length = 16;
    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lowercase = "abcdefghijklmnopqrstuvwxyz";
    const numbers = "0123456789";
    const symbols = "!@#$%^&*";
    const allChars = uppercase + lowercase + numbers + symbols;

    let password = "";
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += symbols[Math.floor(Math.random() * symbols.length)];

    for (let i = password.length; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    password = password.split("").sort(() => Math.random() - 0.5).join("");
    setValue("password", password);
    setPasswordCopied(false);
  }, [setValue]);

  const handleCopyPassword = async () => {
    if (passwordValue) {
      try {
        await navigator.clipboard.writeText(passwordValue);
        setPasswordCopied(true);
        setTimeout(() => setPasswordCopied(false), 2000);
        toast({
          title: "Copied!",
          description: "Password copied to clipboard",
        });
      } catch (err) {
        console.error("Failed to copy password:", err);
      }
    }
  };

  const createMutation = useMutation({
    mutationFn: (data: CustomerFormData) => customersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({
        title: "Success",
        description: "Customer created successfully",
      });
      router.push("/customers");
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
    <div className="space-y-6 dark:bg-gray-900 min-h-screen p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/customers">
            <Buttonvariant="secondary" className="dark:border-gray-700 dark:text-gray-200">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Create New Customer</h1>
          </div>
        </div>
        <div className="flex space-x-4">
          <Link href="/customers">
            <Buttonvariant="secondary" className="dark:border-gray-700 dark:text-gray-200">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            form="customer-create-form"
            disabled={isSubmitting || createMutation.isPending}
            className="dark:bg-blue-600 dark:hover:bg-blue-700"
          >
            {isSubmitting || createMutation.isPending ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Creating...
              </span>
            ) : (
              <>
                <UserPlus className="w-4 h-4 mr-2" />
                Create Customer
              </>
            )}
          </Button>
        </div>
      </div>

      {serverError && (
        <Card className="border-l-4 border-l-red-500 dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="pt-6">
            <div className="flex items-start space-x-3 text-red-700 dark:text-red-400">
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <p className="text-sm font-medium">{serverError}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <form id="customer-create-form" onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-6">
          {/* Personal Information */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="dark:text-white text-lg">Personal Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="first_name" className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                    First Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="first_name"
                    placeholder="John"
                    {...register("first_name")}
                    className={errors.first_name ? "border-red-500 dark:border-red-500" : "dark:bg-gray-700 dark:border-gray-600 dark:text-white"}
                  />
                  {errors.first_name && (
                    <p className="text-red-500 dark:text-red-400 text-xs mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.first_name.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="last_name" className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                    Last Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="last_name"
                    placeholder="Doe"
                    {...register("last_name")}
                    className={errors.last_name ? "border-red-500 dark:border-red-500" : "dark:bg-gray-700 dark:border-gray-600 dark:text-white"}
                  />
                  {errors.last_name && (
                    <p className="text-red-500 dark:text-red-400 text-xs mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.last_name.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="email" className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                    Email <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="customer@example.com"
                    {...register("email")}
                    className={errors.email ? "border-red-500 dark:border-red-500" : "dark:bg-gray-700 dark:border-gray-600 dark:text-white"}
                  />
                  {errors.email && (
                    <p className="text-red-500 dark:text-red-400 text-xs mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.email.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="phone" className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                    Phone
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="(555) 123-4567"
                    {...register("phone")}
                    className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Customer Type & Business Information */}
          <Card className="dark:bg-gray-800 dark:border-gray-700 border-l-4 border-l-blue-500">
            <CardHeader>
              <CardTitle className="dark:text-white flex items-center gap-2 text-lg">
                <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                Customer Type & Business Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <div>
                    <Label htmlFor="customer_type" className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                      Customer Type <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      id="customer_type"
                      {...register("customer_type")}
                      className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    >
                      <option value="individual">Individual</option>
                      <option value="business">Business</option>
                      <option value="fleet">Fleet</option>
                    </Select>
                  </div>

                  {(customerType === "business" || customerType === "fleet") && (
                    <>
                      <div>
                        <Label htmlFor="company_name" className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                          Company Name <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="company_name"
                          placeholder="Acme Corporation"
                          {...register("company_name")}
                          className={errors.company_name ? "border-red-500 dark:border-red-500" : "dark:bg-gray-700 dark:border-gray-600 dark:text-white"}
                        />
                        {errors.company_name && (
                          <p className="text-red-500 dark:text-red-400 text-xs mt-1.5 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {errors.company_name.message}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor="business_type" className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                          Business Type
                        </Label>
                        <Input
                          id="business_type"
                          placeholder="e.g., Construction, Delivery, etc."
                          {...register("business_type")}
                          className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        />
                      </div>
                      <div>
                        <Label htmlFor="tax_id" className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                          Tax ID
                        </Label>
                        <Input
                          id="tax_id"
                          placeholder="12-3456789"
                          {...register("tax_id")}
                          className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        />
                      </div>
                    </>
                  )}
                </div>

                <div className="space-y-6">
                  <div>
                    <Label htmlFor="payment_terms" className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                      Payment Terms
                    </Label>
                    <Select
                      id="payment_terms"
                      {...register("payment_terms")}
                      className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    >
                      <option value="due_on_receipt">Due on Receipt</option>
                      <option value="net_15">Net 15</option>
                      <option value="net_30">Net 30</option>
                      <option value="net_60">Net 60</option>
                      <option value="prepaid">Prepaid</option>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="status" className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                      Status
                    </Label>
                    <Select
                      id="status"
                      {...register("status")}
                      className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="suspended">Suspended</option>
                    </Select>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Portal Access & Password */}
          <Card className="dark:bg-gray-800 dark:border-gray-700 border-l-4 border-l-green-500">
            <CardHeader>
              <CardTitle className="dark:text-white text-lg">Portal Access & Password</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="grant_portal_access"
                  {...register("grant_portal_access")}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:bg-gray-600 dark:border-gray-500 w-4 h-4"
                />
                <Label htmlFor="grant_portal_access" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Grant portal access to customer
                </Label>
              </div>

              {grantPortalAccess && (
                <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div>
                    <Label htmlFor="password" className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                      Password {passwordValue ? "" : "(Optional - will be auto-generated if not provided)"}
                    </Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="Enter password or leave blank to auto-generate"
                          {...register("password")}
                          className="dark:bg-gray-700 dark:border-gray-600 dark:text-white pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                          title={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <Button
                        type="button"
                       variant="secondary"
                        onClick={generatePassword}
                        className="dark:border-gray-600 dark:text-gray-300"
                        title="Generate secure password"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                      {passwordValue && (
                        <Button
                          type="button"
                         variant="secondary"
                          onClick={handleCopyPassword}
                          className="dark:border-gray-600 dark:text-gray-300"
                          title="Copy password"
                        >
                          {passwordCopied ? (
                            <span className="text-xs text-green-600 dark:text-green-400">Copied!</span>
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="send_welcome_email"
                      {...register("send_welcome_email")}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:bg-gray-600 dark:border-gray-500 w-4 h-4"
                    />
                    <Label htmlFor="send_welcome_email" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Send welcome email with login details (password will be included)
                    </Label>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
}
