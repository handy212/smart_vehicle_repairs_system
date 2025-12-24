"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { customersApi } from "@/lib/api/customers";
import { billingApi } from "@/lib/api/billing";
import { workordersApi } from "@/lib/api/workorders";
import { appointmentsApi } from "@/lib/api/appointments";
import { subscriptionsApi } from "@/lib/api/subscriptions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Edit, Mail, Phone, MapPin, Calendar, DollarSign, Package, Car, MessageSquare, FileText, Plus, Receipt, ClipboardList, Wrench, KeyRound, RefreshCw, Copy, Eye, EyeOff, UserCheck, UserX, Mail as MailIcon, CreditCard } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/lib/hooks/useToast";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionGuard } from "@/components/auth/PermissionGuard";

const noteSchema = z.object({
  note: z.string().min(1, "Note is required"),
  note_type: z.enum(["phone_call", "email", "meeting", "internal", "complaint"]),
  is_important: z.boolean().optional(),
});

type NoteFormData = z.infer<typeof noteSchema>;

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = parseInt(params.id as string);
  const [activeTab, setActiveTab] = useState("overview");
  const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: customer, isLoading, error } = useQuery({
    queryKey: ["customer", customerId],
    queryFn: () => customersApi.get(customerId),
  });

  const { data: stats } = useQuery({
    queryKey: ["customer", customerId, "stats"],
    queryFn: () => customersApi.stats(customerId),
    enabled: !!customerId,
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ["customer", customerId, "vehicles"],
    queryFn: () => customersApi.vehicles(customerId),
    enabled: !!customerId,
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["customer", customerId, "notes"],
    queryFn: () => customersApi.notes.list(customerId),
    enabled: !!customerId,
  });

  const { data: subscriptionsData } = useQuery({
    queryKey: ["subscriptions", "customer", customerId],
    queryFn: () => subscriptionsApi.list({ customer: customerId }),
    enabled: !!customerId,
  });

  const subscriptions = subscriptionsData?.results || [];

  // Fetch customer-related invoices, estimates, work orders, and appointments
  const { data: invoicesData } = useQuery({
    queryKey: ["invoices", "customer", customerId],
    queryFn: () => billingApi.invoices.list({ customer: customerId }),
    enabled: !!customerId,
  });

  const { data: estimatesData } = useQuery({
    queryKey: ["estimates", "customer", customerId],
    queryFn: () => billingApi.estimates.list({ customer: customerId }),
    enabled: !!customerId,
  });

  const { data: workOrdersData } = useQuery({
    queryKey: ["workorders", "customer", customerId],
    queryFn: () => workordersApi.list({ customer: customerId }),
    enabled: !!customerId,
  });

  const { data: appointmentsData } = useQuery({
    queryKey: ["appointments", "customer", customerId],
    queryFn: () => appointmentsApi.list({ customer: customerId }),
    enabled: !!customerId,
  });

  const invoices = invoicesData?.results || [];
  const estimates = estimatesData?.results || [];
  const workOrders = workOrdersData?.results || [];
  const appointments = appointmentsData?.results || [];

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

  const createNoteMutation = useMutation({
    mutationFn: (data: NoteFormData) => customersApi.notes.create(customerId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", customerId, "notes"] });
      toast({ title: "Success", description: "Note added successfully" });
      setIsNoteDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to add note",
        variant: "destructive",
      });
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<NoteFormData>({
    resolver: zodResolver(noteSchema),
    defaultValues: {
      note_type: "internal",
      is_important: false,
    },
  });

  const onSubmitNote = async (data: NoteFormData) => {
    await createNoteMutation.mutateAsync(data);
    reset();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Card>
          <CardContent className="pt-6">
            <p className="text-red-600 dark:text-red-400">Error loading customer. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "active":
        return "success";
      case "inactive":
        return "secondary";
      case "suspended":
        return "danger";
      default:
        return "default";
    }
  };

  const getNoteTypeLabel = (type: string) => {
    switch (type) {
      case "phone_call":
        return "Phone Call";
      case "email":
        return "Email";
      case "meeting":
        return "Meeting";
      case "internal":
        return "Internal";
      case "complaint":
        return "Complaint";
      default:
        return type;
    }
  };

  const hasPortalAccess = customer.user?.is_active ?? false;

  return (
    <div className="space-y-6 dark:bg-gray-900 min-h-screen p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="secondary" onClick={() => router.back()} className="dark:border-gray-700 dark:text-gray-200">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <div className="flex items-center space-x-2 flex-wrap">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                {customer.user?.first_name} {customer.user?.last_name}
              </h1>
              {customer.customer_type !== "individual" && customer.company_name && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  ({customer.company_name})
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Customer #{customer.customer_number}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant={getStatusVariant(customer.status) as any} className="text-sm px-3 py-1">
            {customer.status}
          </Badge>
          {hasPortalAccess && (
            <Badge variant="default" className="text-sm px-3 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              Portal Access
            </Badge>
          )}
          <PermissionGuard permission="edit_customers">
            <Link href={`/customers/${customerId}/edit`}>
              <Button className="dark:bg-blue-600 dark:hover:bg-blue-700">
                <Edit className="w-4 h-4 mr-2" />
                Edit Customer
              </Button>
            </Link>
          </PermissionGuard>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="vehicles">Vehicles ({vehicles.length})</TabsTrigger>
          <TabsTrigger value="history">
            History ({invoices.length + estimates.length + workOrders.length + appointments.length})
          </TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions ({subscriptions.length})</TabsTrigger>
          <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Customer Info */}
            <div className="lg:col-span-2 space-y-6">
              {/* Contact Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Contact Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <Mail className="w-5 h-5 text-gray-400 dark:text-gray-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</p>
                      <p className="text-gray-900 dark:text-gray-100">{customer.user?.email || "-"}</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <Phone className="w-5 h-5 text-gray-400 dark:text-gray-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Phone</p>
                      <p className="text-gray-900 dark:text-gray-100">{customer.user?.phone || "-"}</p>
                    </div>
                  </div>
                  {customer.user?.address && (
                    <div className="flex items-start space-x-3">
                      <MapPin className="w-5 h-5 text-gray-400 dark:text-gray-500 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Address</p>
                        <p className="text-gray-900 dark:text-gray-100">{customer.user.address}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Business Information */}
              {customer.customer_type !== "individual" && (
                <Card>
                  <CardHeader>
                    <CardTitle>Business Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Company Name</p>
                      <p className="text-gray-900 dark:text-gray-100">{customer.company_name || "-"}</p>
                    </div>
                    {customer.business_type && (
                      <div>
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Business Type</p>
                        <p className="text-gray-900 dark:text-gray-100">{customer.business_type}</p>
                      </div>
                    )}
                    {customer.tax_id && (
                      <div>
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Tax ID</p>
                        <p className="text-gray-900 dark:text-gray-100">{customer.tax_id}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Account Information */}
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardHeader>
                  <CardTitle className="dark:text-white text-lg font-semibold">Account Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Customer Type</dt>
                      <dd className="text-base text-gray-900 dark:text-white capitalize">{customer.customer_type || "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Payment Terms</dt>
                      <dd className="text-base text-gray-900 dark:text-white">{customer.payment_terms?.replace(/_/g, " ") || "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Current Balance</dt>
                      <dd className="text-base text-gray-900 dark:text-white font-semibold">
                        ${parseFloat(customer.current_balance || "0").toFixed(2)}
                      </dd>
                    </div>
                    {customer.loyalty_points !== undefined && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Loyalty Points</dt>
                        <dd className="text-base text-gray-900 dark:text-white">{customer.loyalty_points}</dd>
                      </div>
                    )}
                    {customer.customer_since && (
                      <div className="sm:col-span-2">
                        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          Customer Since
                        </dt>
                        <dd className="text-base text-gray-900 dark:text-white">
                          {format(new Date(customer.customer_since), "MMMM dd, yyyy")}
                        </dd>
                      </div>
                    )}
                  </dl>
                </CardContent>
              </Card>

              {/* Portal Access & Password Management */}
              <Card className="dark:bg-gray-800 dark:border-gray-700 border-l-4 border-l-orange-500">
                <CardHeader>
                  <CardTitle className="dark:text-white flex items-center gap-2 text-lg font-semibold">
                    <KeyRound className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                    Portal Access & Password Management
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Portal Access Status</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
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
                        className="dark:border-gray-600 dark:text-gray-300 flex-1"
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
                          className="dark:border-gray-600 dark:text-gray-300 flex-1"
                        >
                          <KeyRound className="w-4 h-4 mr-2" />
                          Reset Password
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => sendResetLinkMutation.mutate()}
                          disabled={sendResetLinkMutation.isPending}
                          className="dark:border-gray-600 dark:text-gray-300 flex-1"
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
                        <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700 space-y-4">
                          <div>
                            <Label htmlFor="new_password" className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                              New Password <span className="text-red-500">*</span>
                            </Label>
                            <div className="flex gap-2">
                              <div className="relative flex-1">
                                <Input
                                  id="new_password"
                                  type={showPassword ? "text" : "password"}
                                  value={newPassword}
                                  onChange={(e) => setNewPassword(e.target.value)}
                                  placeholder="Enter new password or generate one"
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
                              {newPassword && (
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
                              id="send_password_email_customer"
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:bg-gray-600 dark:border-gray-500 w-4 h-4"
                            />
                            <Label htmlFor="send_password_email_customer" className="text-sm font-medium text-gray-700 dark:text-gray-300">
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
                              className="dark:border-gray-600 dark:text-gray-300 flex-1"
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              onClick={() => {
                                const sendEmail = (document.getElementById("send_password_email_customer") as HTMLInputElement)?.checked || false;
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
                              className="dark:bg-orange-600 dark:hover:bg-orange-700 flex-1"
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
            </div>

            {/* Right Column - Stats & Actions */}
            <div className="space-y-6">
              {/* Quick Stats */}
              <Card>
                <CardHeader>
                  <CardTitle>Quick Stats</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Total Vehicles</span>
                    <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">{vehicles.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Total Visits</span>
                    <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">{stats?.total_visits || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Total Spent</span>
                    <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      ${parseFloat(String(stats?.total_spent || 0)).toFixed(2)}
                    </span>
                  </div>
                  {stats?.last_visit_date && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Last Visit</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {format(new Date(stats.last_visit_date), "MMM dd, yyyy")}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Link href={`/vehicles/new?customer=${customerId}`} className="block">
                    <Button variant="secondary" className="w-full justify-start">
                      <Package className="w-4 h-4 mr-2" />
                      Add Vehicle
                    </Button>
                  </Link>
                  <Link href={`/appointments/new?customer=${customerId}`} className="block">
                    <Button variant="secondary" className="w-full justify-start">
                      <Calendar className="w-4 h-4 mr-2" />
                      Schedule Appointment
                    </Button>
                  </Link>
                  <Link href={`/workorders/new?customer=${customerId}`} className="block">
                    <Button variant="secondary" className="w-full justify-start">
                      <DollarSign className="w-4 h-4 mr-2" />
                      Create Work Order
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Subscriptions Tab */}
        <TabsContent value="subscriptions" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Subscriptions ({subscriptions.length})</CardTitle>
                <Link href={`/subscriptions/new?customer=${customerId}`}>
                  <Button size="sm">
                    <Plus className="w-4 h-4 mr-2" />
                    New Subscription
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {subscriptions.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Package</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subscriptions.map((sub: any) => (
                      <TableRow key={sub.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center space-x-2">
                            <CreditCard className="w-4 h-4 text-blue-500" />
                            <span>{sub.package_name || sub.package?.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>{sub.vehicle_display}</TableCell>
                        <TableCell>
                          <Badge variant={sub.status === "active" ? "success" : sub.status === "expired" ? "secondary" : "default"}>
                            {sub.status?.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>{format(new Date(sub.start_date), "MMM dd, yyyy")}</TableCell>
                        <TableCell>{format(new Date(sub.end_date), "MMM dd, yyyy")}</TableCell>
                        <TableCell>${parseFloat(sub.purchase_price).toFixed(2)}</TableCell>
                        <TableCell>
                          <Link href={`/subscriptions?id=${sub.id}`}>
                            <Button variant="ghost" size="sm">
                              View
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <CreditCard className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No subscriptions found</p>
                  <p className="text-sm mt-1">This customer has no active or past subscriptions.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Vehicles Tab */}
        <TabsContent value="vehicles" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Vehicles ({vehicles.length})</CardTitle>
                <Link href={`/vehicles/new?customer=${customerId}`}>
                  <Button size="sm">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Vehicle
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {vehicles.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Make/Model</TableHead>
                      <TableHead>Year</TableHead>
                      <TableHead>VIN</TableHead>
                      <TableHead>License Plate</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vehicles.map((vehicle: any) => (
                      <TableRow key={vehicle.id}>
                        <TableCell className="font-medium">
                          {vehicle.make} {vehicle.model}
                        </TableCell>
                        <TableCell>{vehicle.year}</TableCell>
                        <TableCell className="font-mono text-sm">{vehicle.vin}</TableCell>
                        <TableCell>{vehicle.license_plate || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={vehicle.status === "active" ? "success" : "secondary"}>
                            {vehicle.status?.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Link href={`/vehicles/${vehicle.id}`}>
                            <Button variant="ghost" size="sm">
                              View
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <Car className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400 mb-4">No vehicles registered for this customer.</p>
                  <Link href={`/vehicles/new?customer=${customerId}`}>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Add First Vehicle
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-6">
          <div className="space-y-6">
            {/* Invoices */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="flex items-center space-x-2">
                    <Receipt className="w-5 h-5" />
                    <span>Invoices ({invoices.length})</span>
                  </CardTitle>
                  <Link href={`/billing/invoices/new?customer=${customerId}`}>
                    <Button size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      New Invoice
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {invoices.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Balance</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((invoice: any) => (
                        <TableRow key={invoice.id}>
                          <TableCell className="font-mono text-sm font-medium">
                            {invoice.invoice_number}
                          </TableCell>
                          <TableCell>
                            {invoice.invoice_date
                              ? format(new Date(invoice.invoice_date), "MMM dd, yyyy")
                              : "-"}
                          </TableCell>
                          <TableCell>
                            {invoice.due_date
                              ? format(new Date(invoice.due_date), "MMM dd, yyyy")
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                invoice.status === "paid"
                                  ? "success"
                                  : invoice.status === "overdue"
                                    ? "danger"
                                    : invoice.status === "partial"
                                      ? "warning"
                                      : "secondary"
                              }
                            >
                              {invoice.status?.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            ${parseFloat(String(invoice.total || 0)).toFixed(2)}
                          </TableCell>
                          <TableCell className="font-medium">
                            ${parseFloat(String(invoice.balance_due || 0)).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Link href={`/billing/invoices/${invoice.id}`}>
                              <Button variant="ghost" size="sm">
                                View
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8">
                    <Receipt className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400 mb-4">No invoices found for this customer.</p>
                    <Link href={`/billing/invoices/new?customer=${customerId}`}>
                      <Button>
                        <Plus className="w-4 h-4 mr-2" />
                        Create First Invoice
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Estimates */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="flex items-center space-x-2">
                    <ClipboardList className="w-5 h-5" />
                    <span>Estimates ({estimates.length})</span>
                  </CardTitle>
                  <Link href={`/billing/estimates/new?customer=${customerId}`}>
                    <Button size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      New Estimate
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {estimates.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Estimate #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Valid Until</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {estimates.map((estimate: any) => (
                        <TableRow key={estimate.id}>
                          <TableCell className="font-mono text-sm font-medium">
                            {estimate.estimate_number}
                          </TableCell>
                          <TableCell>
                            {estimate.estimate_date
                              ? format(new Date(estimate.estimate_date), "MMM dd, yyyy")
                              : "-"}
                          </TableCell>
                          <TableCell>
                            {estimate.valid_until
                              ? format(new Date(estimate.valid_until), "MMM dd, yyyy")
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                estimate.status === "approved"
                                  ? "success"
                                  : estimate.status === "declined"
                                    ? "danger"
                                    : estimate.status === "expired"
                                      ? "secondary"
                                      : "warning"
                              }
                            >
                              {estimate.status?.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            ${parseFloat(String(estimate.total || 0)).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Link href={`/billing/estimates/${estimate.id}`}>
                              <Button variant="ghost" size="sm">
                                View
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8">
                    <ClipboardList className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400 mb-4">No estimates found for this customer.</p>
                    <Link href={`/billing/estimates/new?customer=${customerId}`}>
                      <Button>
                        <Plus className="w-4 h-4 mr-2" />
                        Create First Estimate
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Work Orders */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="flex items-center space-x-2">
                    <Wrench className="w-5 h-5" />
                    <span>Work Orders ({workOrders.length})</span>
                  </CardTitle>
                  <Link href={`/workorders/new?customer=${customerId}`}>
                    <Button size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      New Work Order
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {workOrders.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Work Order #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Vehicle</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Total Cost</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workOrders.map((wo: any) => (
                        <TableRow key={wo.id}>
                          <TableCell className="font-mono text-sm font-medium">
                            {wo.work_order_number}
                          </TableCell>
                          <TableCell>
                            {wo.created_at
                              ? format(new Date(wo.created_at), "MMM dd, yyyy")
                              : "-"}
                          </TableCell>
                          <TableCell>{wo.vehicle_info || "-"}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                wo.status === "completed"
                                  ? "success"
                                  : wo.status === "in_progress"
                                    ? "info"
                                    : wo.status === "cancelled"
                                      ? "danger"
                                      : "warning"
                              }
                            >
                              {wo.status?.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{wo.priority || "-"}</Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            {wo.total_cost
                              ? `$${parseFloat(String(wo.total_cost)).toFixed(2)}`
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <Link href={`/workorders/${wo.id}`}>
                              <Button variant="ghost" size="sm">
                                View
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8">
                    <Wrench className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400 mb-4">No work orders found for this customer.</p>
                    <Link href={`/workorders/new?customer=${customerId}`}>
                      <Button>
                        <Plus className="w-4 h-4 mr-2" />
                        Create First Work Order
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Appointments */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="flex items-center space-x-2">
                    <Calendar className="w-5 h-5" />
                    <span>Appointments ({appointments.length})</span>
                  </CardTitle>
                  <Link href={`/appointments/new?customer=${customerId}`}>
                    <Button size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      New Appointment
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {appointments.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Appointment #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Vehicle</TableHead>
                        <TableHead>Service Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {appointments.map((apt: any) => (
                        <TableRow key={apt.id}>
                          <TableCell className="font-mono text-sm font-medium">
                            {apt.appointment_number}
                          </TableCell>
                          <TableCell>
                            {apt.appointment_date
                              ? format(new Date(apt.appointment_date), "MMM dd, yyyy")
                              : "-"}
                          </TableCell>
                          <TableCell>{apt.appointment_time || "-"}</TableCell>
                          <TableCell>{apt.vehicle_info || "-"}</TableCell>
                          <TableCell>{apt.service_type || "-"}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                apt.status === "completed"
                                  ? "success"
                                  : apt.status === "confirmed"
                                    ? "info"
                                    : apt.status === "cancelled"
                                      ? "danger"
                                      : "warning"
                              }
                            >
                              {apt.status?.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Link href={`/appointments/${apt.id}`}>
                              <Button variant="ghost" size="sm">
                                View
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8">
                    <Calendar className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400 mb-4">No appointments found for this customer.</p>
                    <Link href={`/appointments/new?customer=${customerId}`}>
                      <Button>
                        <Plus className="w-4 h-4 mr-2" />
                        Schedule First Appointment
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Notes Tab */}
        <TabsContent value="notes" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Notes ({notes.length})</CardTitle>
                <Button size="sm" onClick={() => setIsNoteDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Note
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {notes.length > 0 ? (
                <div className="space-y-4">
                  {notes.map((note: any) => (
                    <div
                      key={note.id}
                      className={`p-4 rounded-lg border ${note.is_important ? "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20" : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                        }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <Badge variant="secondary">{getNoteTypeLabel(note.note_type)}</Badge>
                          {note.is_important && (
                            <Badge variant="danger">Important</Badge>
                          )}
                        </div>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {format(new Date(note.created_at), "MMM dd, yyyy 'at' h:mm a")}
                        </span>
                      </div>
                      <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{note.note}</p>
                      {note.created_by_name && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                          Added by {note.created_by_name}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <MessageSquare className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400 mb-4">No notes for this customer.</p>
                  <Button onClick={() => setIsNoteDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add First Note
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Note Dialog */}
      <Dialog open={isNoteDialogOpen} onOpenChange={setIsNoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmitNote)} className="px-6 pb-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="note_type" className="block mb-2">
                  Note Type *
                </Label>
                <Select id="note_type" {...register("note_type")} className="w-full">
                  <option value="internal">Internal</option>
                  <option value="phone_call">Phone Call</option>
                  <option value="email">Email</option>
                  <option value="meeting">Meeting</option>
                  <option value="complaint">Complaint</option>
                </Select>
                {errors.note_type && (
                  <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.note_type.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="note" className="block mb-2">
                  Note *
                </Label>
                <Textarea
                  id="note"
                  {...register("note")}
                  rows={6}
                  className="w-full"
                  placeholder="Enter your note here..."
                />
                {errors.note && (
                  <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.note.message}</p>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="is_important"
                  {...register("is_important")}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <Label htmlFor="is_important" className="cursor-pointer">
                  Mark as Important
                </Label>
              </div>
            </div>
          </form>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setIsNoteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit(onSubmitNote)}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Adding..." : "Add Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
