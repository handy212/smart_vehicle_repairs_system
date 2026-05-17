"use client";

import { useRouter, useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, KeyRound, RefreshCw, Eye, EyeOff, UserCheck, UserX } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { CustomerForm, type CustomerFormData } from "@/components/customers/CustomerForm";

function EditCustomerForm({ customer, customerId }: { customer: any; customerId: number }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);

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

  const updateMutation = useMutation({
    mutationFn: (data: any) => customersApi.update(customerId, data),
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

  // Map API data to form data
  const initialData: Partial<CustomerFormData> = {
    email: customer.user?.email || "",
    first_name: customer.user?.first_name || "",
    last_name: customer.user?.last_name || "",
    phone: customer.user?.phone || "",
    alternative_phone: customer.alternative_phone || "",
    gender: customer.user?.gender as any || undefined,
    occupation: customer.occupation || "",
    date_of_birth: customer.user?.date_of_birth || "",
    
    customer_type: customer.customer_type as any || "individual",
    company_name: customer.company_name || "",
    contact_person_name: customer.contact_person_name || "",
    company_email: customer.company_email || "",
    company_phone: customer.company_phone || "",
    business_type: customer.business_type || "",
    tax_id: customer.tax_id || "",
    payment_terms: customer.payment_terms as any || "due_on_receipt",
    default_payment_method: customer.default_payment_method as any || "cash",
    status: customer.status as any || "active",
    
    service_address: customer.service_address || "",
    service_city: customer.service_city || "",
    service_state: customer.service_state || "",
    service_zip_code: customer.service_zip_code || "",
    preferred_contact_method: customer.preferred_contact_method as any || "email",
    notes: customer.notes || "",
  };

  const generatePassword = () => {
    const length = 16;
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
    let retVal = "";
    for (let i = 0, n = charset.length; i < length; ++i) {
      retVal += charset.charAt(Math.floor(Math.random() * n));
    }
    setNewPassword(retVal);
  };

  const handleCopyPassword = () => {
    navigator.clipboard.writeText(newPassword);
    setPasswordCopied(true);
    setTimeout(() => setPasswordCopied(false), 2000);
  };

  const onSubmit = async (data: CustomerFormData) => {
    await updateMutation.mutateAsync(data);
  };

  return (
    <div className="space-y-6 bg-background min-h-screen p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 sm:items-center sm:gap-4">
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <CustomerForm
            initialData={initialData}
            onSubmit={onSubmit}
            isSubmitting={updateMutation.isPending}
            mode="edit"
            onCancel={() => router.push(`/customers/${customerId}`)}
            hidePortalAccess={true}
          />
        </div>

        <div className="space-y-6">
          {/* Account Status Card copied from original - keeping Actions & Portal Control here */}
          <Card className="bg-muted border-border border-l-4 border-l-orange-500">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2 text-lg font-semibold">
                <KeyRound className="w-5 h-5 text-primary" />
                Portal Management
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div>
                  <p className="text-xs font-semibold text-card-foreground uppercase tracking-tight">Access Status</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                    {hasPortalAccess ? "Active login credentials" : "No portal credentials yet"}
                  </p>
                </div>
                <Badge
                  variant={hasPortalAccess ? "default" : "secondary"}
                  className={hasPortalAccess ? "bg-green-100/10 text-success border-green-500/20" : ""}
                >
                  {hasPortalAccess ? "Enabled" : "Disabled"}
                </Badge>
              </div>

              {!hasPortalAccess ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    const sendEmail = window.confirm("Send welcome email with login details?");
                    grantPortalAccessMutation.mutate({ sendEmail });
                  }}
                  disabled={grantPortalAccessMutation.isPending}
                  className="w-full border-border text-foreground"
                >
                  <UserCheck className="w-4 h-4 mr-2" />
                  Grant Access
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setShowPasswordReset(true)}
                      className="text-xs"
                    >
                      Reset Pwd
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => sendResetLinkMutation.mutate()}
                      disabled={sendResetLinkMutation.isPending}
                      className="text-xs"
                    >
                      Send Link
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      if (window.confirm("Are you sure you want to revoke portal access?")) {
                        revokePortalAccessMutation.mutate();
                      }
                    }}
                    disabled={revokePortalAccessMutation.isPending}
                    className="w-full dark:border-destructive dark:text-red-400 dark:hover:bg-red-900/20 text-xs"
                  >
                    <UserX className="w-3 h-3 mr-1.5" />
                    Revoke Access
                  </Button>
                </div>
              )}

              {showPasswordReset && (
                <div className="pt-4 mt-4 border-t border-border space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">New Password</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={showPassword ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="h-8 text-xs pr-8"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2 top-1/2 -translate-y-1/2"
                        >
                          {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                      </div>
                      <Button size="icon" variant="secondary" className="h-8 w-8" onClick={generatePassword}>
                        <RefreshCw className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" id="send-pwd-email" className="rounded border-border w-3 h-3" />
                    <Label htmlFor="send-pwd-email" className="text-[10px]">Send email to customer</Label>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setShowPasswordReset(false)} className="flex-1 text-xs h-8">Cancel</Button>
                    <Button size="sm" onClick={() => {
                      const sendEmail = (document.getElementById("send-pwd-email") as HTMLInputElement)?.checked || false;
                      resetPasswordMutation.mutate({ password: newPassword, sendEmail });
                    }} className="flex-1 text-xs h-8">Save</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function EditCustomerPage() {
  const params = useParams();
  const customerId = parseInt(params.id as string);

  const { data: customer, isLoading, error } = useQuery({
    queryKey: ["customer", customerId],
    queryFn: () => customersApi.get(customerId),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 bg-background border-t">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary dark:border-orange-400"></div>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="space-y-4 bg-background min-h-screen p-6 border-t">
        <Link href="/customers">
          <Button variant="secondary" className="border-border text-foreground">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <Card className="bg-muted border-border">
          <CardContent className="pt-6">
            <p className="text-destructive dark:text-red-400">Customer not found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <EditCustomerForm customer={customer} customerId={customerId} />;
}
