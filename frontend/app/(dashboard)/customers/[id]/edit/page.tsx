"use client";

import { useRouter, useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, AlertCircle, Building2, Save, KeyRound, RefreshCw, Copy, Eye, EyeOff, Mail as MailIcon, UserCheck, UserX } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AxiosError } from "axios";
import { useToast } from "@/lib/hooks/useToast";

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
}).refine((data) => {
  // Business and fleet customers must have company name
  if ((data.customer_type === "business" || data.customer_type === "fleet") && !data.company_name) {
    return false;
  }
  return true;
}, {
  message: "Company name is required for business and fleet customers",
  path: ["company_name"],
});

type CustomerFormData = z.infer<typeof customerSchema>;

export default function EditCustomerPage() {
  const router = useRouter();
  const params = useParams();
  const customerId = parseInt(params.id as string);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);

  const { data: customer, isLoading, error } = useQuery({
    queryKey: ["customer", customerId],
    queryFn: () => customersApi.get(customerId),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    reset,
    setError,
    setValue,
  } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
  });

  // Populate form when customer data loads
  useEffect(() => {
    if (customer && !isLoading) {
      reset({
        email: customer.user?.email || "",
        first_name: customer.user?.first_name || "",
        last_name: customer.user?.last_name || "",
        phone: customer.user?.phone || "",

        customer_type: customer.customer_type as any,
        company_name: customer.company_name || "",
        business_type: customer.business_type || "",
        tax_id: customer.tax_id || "",

        payment_terms: customer.payment_terms as any,

        status: customer.status as any,
      });
    }
  }, [customer, isLoading, reset]);

  const customerType = watch("customer_type");
  const hasPortalAccess = customer?.user?.is_active ?? false;

  // Password management mutations
  const resetPasswordMutation = useMutation({
    mutationFn: ({ password, sendEmail }: { password: string; sendEmail: boolean }) =>
      customersApi.resetPassword(customerId, password, sendEmail),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      toast({
        title: "Success",
        description: data.email_sent
          ? "Password reset successfully and email sent to customer"
          : "Password reset successfully",
      });
      setShowPasswordReset(false);
      setNewPassword("");
    },

    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to reset password",
        variant: "destructive",
      });
    },
  });

  const sendResetLinkMutation = useMutation({
    mutationFn: () => customersApi.sendPasswordResetLink(customerId),
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: data.detail || "Password reset link sent successfully",
      });
    },

    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to send password reset link",
        variant: "destructive",
      });
    },
  });

  const grantPortalAccessMutation = useMutation({
    mutationFn: ({ password, sendEmail }: { password?: string; sendEmail: boolean }) =>
      customersApi.grantPortalAccess(customerId, password, sendEmail),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      toast({
        title: "Success",
        description: data.email_sent
          ? "Portal access granted and welcome email sent"
          : `Portal access granted${data.password ? `. Password: ${data.password}` : ""}`,
      });
      if (data.password && !data.email_sent) {
        setNewPassword(data.password);
        setShowPasswordReset(true);
      }
    },

    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to grant portal access",
        variant: "destructive",
      });
    },
  });

  const revokePortalAccessMutation = useMutation({
    mutationFn: () => customersApi.revokePortalAccess(customerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      toast({
        title: "Success",
        description: "Portal access revoked successfully",
      });
    },

    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to revoke portal access",
        variant: "destructive",
      });
    },
  });

  // Generate secure password
  const generatePassword = () => {
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
    setNewPassword(password);
    setPasswordCopied(false);
  };

  const handleCopyPassword = async () => {
    if (newPassword) {
      try {
        await navigator.clipboard.writeText(newPassword);
        setPasswordCopied(true);
        setTimeout(() => setPasswordCopied(false), 2000);
      } catch (err) {
        console.error("Failed to copy password:", err);
      }
    }
  };

  const updateMutation = useMutation({
    mutationFn: (data: CustomerFormData) => customersApi.update(customerId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({
        title: "Success",
        description: "Customer updated successfully",
      });
      router.push(`/customers/${customerId}`);
    },

    onError: (error: any) => {
      console.error("Error updating customer:", error);
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to update customer",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: CustomerFormData) => {
    setServerError(null);
    try {
      // Check if email already exists (and it's not the current customer's email)
      if (data.email && data.email.trim() && customer?.user?.email?.toLowerCase() !== data.email.trim().toLowerCase()) {
        try {
          const emailCheck = await customersApi.checkEmail(data.email.trim().toLowerCase(), customerId);
          if (emailCheck.success && emailCheck.exists) {
            // Only warn if it's a different user
            if (emailCheck.user_id && emailCheck.user_id !== customer?.user?.id) {

              const user = emailCheck.user as any;

              const customerData = emailCheck.customer as any;
              const displayName = customerData
                ? (customerData.company_name || `${customerData.user?.first_name} ${customerData.user?.last_name}` || customerData.customer_number)
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

              // Set error on email field
              setError("email", {
                type: "manual",
                message: "A user with this email already exists in the system",
              });
              return;
            }
          }
        } catch (emailError) {
          // If email check fails, continue with form submission
          console.warn("Email existence check failed:", emailError);
        }
      }

      await updateMutation.mutateAsync(data);
    } catch (error) {
      console.error("Error updating customer:", error);

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
          setServerError("An error occurred while updating the customer. Please try again.");
        }
      } else {
        setServerError("An unexpected error occurred. Please try again.");
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary dark:border-orange-400"></div>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="space-y-4 bg-background min-h-screen p-6">
        <Link href="/customers">
          <Button variant="secondary" className="border-border text-foreground">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <Card className="bg-muted border-border">
          <CardContent className="pt-6">
            <p className="text-red-600 dark:text-red-400">Customer not found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 bg-background min-h-screen p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href={`/customers/${customerId}`}>
            <Button variant="secondary" className="border-border text-foreground">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Edit Customer</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {customer.user?.first_name} {customer.user?.last_name} • {customer.customer_number}
            </p>
          </div>
        </div>
        <div className="flex space-x-4">
          <Link href={`/customers/${customerId}`}>
            <Button variant="secondary" className="border-border text-foreground">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            form="customer-edit-form"
            disabled={isSubmitting || updateMutation.isPending}
            className="dark:bg-primary dark:hover:bg-primary/90"
          >
            {isSubmitting || updateMutation.isPending ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </span>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>

      {serverError && (
        <Card className="border-l-4 border-l-red-500 bg-muted border-border">
          <CardContent className="pt-6">
            <div className="flex items-start space-x-3 text-red-700 dark:text-red-400">
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <p className="text-sm font-medium">{serverError}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <form id="customer-edit-form" onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-6">
          {/* Personal Information */}
          <Card className="bg-muted border-border">
            <CardHeader>
              <CardTitle className="text-foreground text-lg">Personal Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="first_name" className="text-sm font-semibold text-card-foreground mb-2 block">
                    First Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="first_name"
                    placeholder="John"
                    {...register("first_name")}
                    className={errors.first_name ? "border-red-500 dark:border-red-500" : "bg-muted border-border text-foreground"}
                  />
                  {errors.first_name && (
                    <p className="text-red-500 dark:text-red-400 text-xs mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.first_name.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="last_name" className="text-sm font-semibold text-card-foreground mb-2 block">
                    Last Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="last_name"
                    placeholder="Doe"
                    {...register("last_name")}
                    className={errors.last_name ? "border-red-500 dark:border-red-500" : "bg-muted border-border text-foreground"}
                  />
                  {errors.last_name && (
                    <p className="text-red-500 dark:text-red-400 text-xs mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.last_name.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="email" className="text-sm font-semibold text-card-foreground mb-2 block">
                    Email <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="customer@example.com"
                    {...register("email")}
                    className={errors.email ? "border-red-500 dark:border-red-500" : "bg-muted border-border text-foreground"}
                  />
                  {errors.email && (
                    <p className="text-red-500 dark:text-red-400 text-xs mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.email.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="phone" className="text-sm font-semibold text-card-foreground mb-2 block">
                    Phone
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="(555) 123-4567"
                    {...register("phone")}
                    className="bg-muted border-border text-foreground"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Customer Type & Business Information */}
          <Card className="bg-muted border-border border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2 text-lg">
                <Building2 className="w-5 h-5 text-primary" />
                Customer Type & Business Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <div>
                    <Label htmlFor="customer_type" className="text-sm font-semibold text-card-foreground mb-2 block">
                      Customer Type <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      value={watch("customer_type")}

                      onValueChange={(val: any) => setValue("customer_type", val, { shouldValidate: true })}
                    >
                      <SelectTrigger id="customer_type" className="bg-muted border-border text-foreground">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="individual">Individual</SelectItem>
                        <SelectItem value="business">Business</SelectItem>
                        <SelectItem value="fleet">Fleet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {(customerType === "business" || customerType === "fleet") && (
                    <>
                      <div>
                        <Label htmlFor="company_name" className="text-sm font-semibold text-card-foreground mb-2 block">
                          Company Name <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="company_name"
                          placeholder="Acme Corporation"
                          {...register("company_name")}
                          className={errors.company_name ? "border-red-500 dark:border-red-500" : "bg-muted border-border text-foreground"}
                        />
                        {errors.company_name && (
                          <p className="text-red-500 dark:text-red-400 text-xs mt-1.5 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {errors.company_name.message}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor="business_type" className="text-sm font-semibold text-card-foreground mb-2 block">
                          Business Type
                        </Label>
                        <Input
                          id="business_type"
                          placeholder="e.g., Construction, Delivery, etc."
                          {...register("business_type")}
                          className="bg-muted border-border text-foreground"
                        />
                      </div>
                      <div>
                        <Label htmlFor="tax_id" className="text-sm font-semibold text-card-foreground mb-2 block">
                          Tax ID
                        </Label>
                        <Input
                          id="tax_id"
                          placeholder="12-3456789"
                          {...register("tax_id")}
                          className="bg-muted border-border text-foreground"
                        />
                      </div>
                    </>
                  )}
                </div>

                <div className="space-y-6">
                  <div>
                    <Label htmlFor="payment_terms" className="text-sm font-semibold text-card-foreground mb-2 block">
                      Payment Terms
                    </Label>
                    <Select
                      value={watch("payment_terms") || ""}

                      onValueChange={(val: any) => setValue("payment_terms", val)}
                    >
                      <SelectTrigger id="payment_terms" className="bg-muted border-border text-foreground">
                        <SelectValue placeholder="Select terms" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="due_on_receipt">Due on Receipt</SelectItem>
                        <SelectItem value="net_15">Net 15</SelectItem>
                        <SelectItem value="net_30">Net 30</SelectItem>
                        <SelectItem value="net_60">Net 60</SelectItem>
                        <SelectItem value="prepaid">Prepaid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="status" className="text-sm font-semibold text-card-foreground mb-2 block">
                      Status
                    </Label>
                    <Select
                      value={watch("status")}

                      onValueChange={(val: any) => setValue("status", val)}
                    >
                      <SelectTrigger id="status" className="bg-muted border-border text-foreground">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="suspended">Suspended</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Portal Access & Password Management */}
          {customer && (
            <Card className="bg-muted border-border border-l-4 border-l-orange-500">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2 text-lg font-semibold">
                  <KeyRound className="w-5 h-5 text-primary" />
                  Portal Access & Password Management
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-card-foreground">Portal Access Status</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {hasPortalAccess ? "Customer can log in to the portal" : "Customer cannot access the portal"}
                    </p>
                  </div>
                  <Badge
                    variant={hasPortalAccess ? "default" : "secondary"}
                    className={hasPortalAccess ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : ""}
                  >
                    {hasPortalAccess ? "Enabled" : "Disabled"}
                  </Badge>
                </div>

                {!hasPortalAccess ? (
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        const sendEmail = window.confirm("Send welcome email with login details?");
                        grantPortalAccessMutation.mutate({ sendEmail });
                      }}
                      disabled={grantPortalAccessMutation.isPending}
                      className="border-border text-foreground flex-1"
                    >
                      {grantPortalAccessMutation.isPending ? (
                        <span className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          Granting...
                        </span>
                      ) : (
                        <>
                          <UserCheck className="w-4 h-4 mr-2" />
                          Grant Portal Access
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setShowPasswordReset(true)}
                        className="border-border text-foreground flex-1"
                      >
                        <KeyRound className="w-4 h-4 mr-2" />
                        Reset Password
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => sendResetLinkMutation.mutate()}
                        disabled={sendResetLinkMutation.isPending}
                        className="border-border text-foreground flex-1"
                      >
                        {sendResetLinkMutation.isPending ? (
                          <span className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            Sending...
                          </span>
                        ) : (
                          <>
                            <MailIcon className="w-4 h-4 mr-2" />
                            Send Reset Link
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          if (window.confirm("Are you sure you want to revoke portal access? The customer will not be able to log in.")) {
                            revokePortalAccessMutation.mutate();
                          }
                        }}
                        disabled={revokePortalAccessMutation.isPending}
                        className="dark:border-red-600 dark:text-red-400 dark:hover:bg-red-900/20 flex-1"
                      >
                        {revokePortalAccessMutation.isPending ? (
                          <span className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            Revoking...
                          </span>
                        ) : (
                          <>
                            <UserX className="w-4 h-4 mr-2" />
                            Revoke Access
                          </>
                        )}
                      </Button>
                    </div>

                    {showPasswordReset && (
                      <div className="pt-4 mt-4 border-t border-border space-y-4">
                        <div>
                          <Label htmlFor="new_password_edit" className="text-sm font-semibold text-card-foreground mb-2 block">
                            New Password <span className="text-red-500">*</span>
                          </Label>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <Input
                                id="new_password_edit"
                                type={showPassword ? "text" : "password"}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Enter new password or generate one"
                                className="bg-muted border-border text-foreground pr-10"
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground "
                                title={showPassword ? "Hide password" : "Show password"}
                              >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={generatePassword}
                              className="border-border text-foreground"
                              title="Generate secure password"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </Button>
                            {newPassword && (
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={handleCopyPassword}
                                className="border-border text-foreground"
                                title="Copy password"
                              >
                                {passwordCopied ? (
                                  <span className="text-xs text-success">Copied!</span>
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
                            id="send_password_email_customer_edit"
                            className="rounded border-border text-primary focus:ring-primary dark:bg-gray-600 dark:border-gray-500 w-4 h-4"
                          />
                          <Label htmlFor="send_password_email_customer_edit" className="text-sm font-medium text-card-foreground">
                            Send new password to customer via email
                          </Label>
                        </div>
                        <div className="flex gap-3">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              setShowPasswordReset(false);
                              setNewPassword("");
                            }}
                            className="border-border text-foreground flex-1"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            onClick={() => {
                              const sendEmail = (document.getElementById("send_password_email_customer_edit") as HTMLInputElement)?.checked || false;
                              if (!newPassword) {
                                toast({
                                  title: "Error",
                                  description: "Please enter or generate a password",
                                  variant: "destructive",
                                });
                                return;
                              }
                              resetPasswordMutation.mutate({ password: newPassword, sendEmail });
                            }}
                            disabled={resetPasswordMutation.isPending || !newPassword}
                            className="dark:bg-primary dark:hover:bg-orange-700 flex-1"
                          >
                            {resetPasswordMutation.isPending ? (
                              <span className="flex items-center gap-2">
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Resetting...
                              </span>
                            ) : (
                              <>
                                <KeyRound className="w-4 h-4 mr-2" />
                                Reset Password
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </form>
    </div>
  );
}
