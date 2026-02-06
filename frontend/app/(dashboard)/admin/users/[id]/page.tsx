"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { adminApi, UserUpdate, User } from "@/lib/api/admin";
import { branchesApi } from "@/lib/api/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Edit, AlertCircle, Building2, Save, X, Info, RefreshCw, Copy, Eye, EyeOff, Mail, KeyRound, UserCheck, UserX } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AxiosError } from "axios";
import { useToast } from "@/lib/hooks/useToast";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

import { useCurrency } from "@/lib/hooks/useCurrency";
const userUpdateSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  phone: z.string().optional(),
  email_notifications: z.boolean(),
  sms_notifications: z.boolean(),
  is_active: z.boolean(),
  role: z.enum([
    "admin",
    "manager",
    "service_coordinator",
    "technician",
    "receptionist",
    "parts_manager",
    "accountant",
  ]).optional(),
  branch: z.number().nullable().optional(),
  managed_branches: z.array(z.number()).optional(),
  employee_id: z.string().optional(),
  hire_date: z.string().optional(),
  hourly_rate: z.string().optional(),
})
  .refine(
    (data) => {
      // Managers should have managed_branches, not branch
      if (data.role === "manager") {
        return !data.branch || (data.managed_branches && data.managed_branches.length > 0);
      }
      return true;
    },
    {
      message: "Managers must have at least one managed branch assigned",
      path: ["managed_branches"],
    }
  )
  .refine(
    (data) => {
      // Staff roles should have a single branch
      if (data.role && ["receptionist", "technician", "parts_manager", "service_coordinator", "accountant"].includes(data.role)) {
        return !!data.branch;
      }
      return true;
    },
    {
      message: "Staff members must be assigned to a branch",
      path: ["branch"],
    }
  );

type UserUpdateFormData = z.infer<typeof userUpdateSchema>;

const ROLE_OPTIONS = [
  { value: "receptionist", label: "Receptionist" },
  { value: "technician", label: "Technician" },
  { value: "parts_manager", label: "Parts Manager" },
  { value: "service_coordinator", label: "Service Coordinator" },
  { value: "accountant", label: "Accountant" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
];

export default function UserDetailPage() {
  const { formatCurrency } = useCurrency();
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const userId = parseInt(params.id as string);
  const [isEditing, setIsEditing] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);

  const { data: user, isLoading } = useQuery({
    queryKey: ["admin", "user", userId],
    queryFn: () => adminApi.users.get(userId),
  });

  // Fetch branches
  const { data: branchesData } = useQuery({
    queryKey: ["branches", "list"],
    queryFn: () => branchesApi.list({ is_active: true }),
  });

  const branches = Array.isArray(branchesData) ? branchesData : branchesData?.results || [];

  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    reset,
    setError,
    setValue,
  } = useForm<UserUpdateFormData>({
    resolver: zodResolver(userUpdateSchema),
    values: user
      ? {
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone || "",
        email_notifications: user.email_notifications,
        sms_notifications: user.sms_notifications,
        is_active: user.is_active,
        role: user.role as any,
        branch: user.branch || null,
        managed_branches: user.managed_branches || [],
        employee_id: user.employee_id || "",
        hire_date: user.hire_date || "",
        hourly_rate: user.hourly_rate || "",
      }
      : undefined,
  });

  const watchedRole = watch("role");
  const selectedRole = (watchedRole || user?.role) as
    | "admin"
    | "manager"
    | "service_coordinator"
    | "technician"
    | "receptionist"
    | "parts_manager"
    | "accountant"
    | "customer"
    | undefined;
  const isManager = selectedRole === "manager";
  const isStaff = ["receptionist", "technician", "parts_manager", "service_coordinator", "accountant"].includes(
    selectedRole || ""
  );

  // Clear branch assignments when role changes
  useEffect(() => {
    if (isManager) {
      setValue("branch", null);
    } else if (isStaff) {
      setValue("managed_branches", []);
    }
  }, [selectedRole, isManager, isStaff, setValue]);

  const updateMutation = useMutation({
    mutationFn: (data: Partial<UserUpdate>) => adminApi.users.update(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "user", userId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast({
        title: "Success",
        description: "User updated successfully",
      });
      setIsEditing(false);
    },
    onError: (error: any) => {
      if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data;
        if (typeof errorData === "object") {
          Object.keys(errorData).forEach((key) => {
            if (Array.isArray(errorData[key])) {
              setError(key as keyof UserUpdateFormData, {
                type: "server",
                message: errorData[key][0],
              });
            }
          });
        } else if (errorData.detail) {
          setServerError(errorData.detail);
        }
      } else {
        setServerError("Failed to update user. Please try again.");
      }
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ password, sendEmail }: { password: string; sendEmail: boolean }) =>
      adminApi.users.resetPassword(userId, password, sendEmail),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "user", userId] });
      toast({
        title: "Success",
        description: data.email_sent
          ? "Password reset successfully and email sent to user"
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
    mutationFn: () => adminApi.users.sendPasswordResetLink(userId),
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

  // Generate secure password
  const generatePassword = () => {
    const length = 16;
    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lowercase = "abcdefghijklmnopqrstuvwxyz";
    const numbers = "0123456789";
    const symbols = "!@#$%^&*";
    const allChars = uppercase + lowercase + numbers + symbols;

    let password = "";
    // Ensure at least one character from each type
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += symbols[Math.floor(Math.random() * symbols.length)];

    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Shuffle the password
    password = password.split("").sort(() => Math.random() - 0.5).join("");
    return password;
  };

  const handleGeneratePassword = () => {
    const password = generatePassword();
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

  const onSubmit = async (data: UserUpdateFormData) => {
    setServerError(null);
    const payload: Partial<UserUpdate> = {
      first_name: data.first_name,
      last_name: data.last_name,
      phone: data.phone,
      email_notifications: data.email_notifications,
      sms_notifications: data.sms_notifications,
      is_active: data.is_active,
    };

    if (data.role) payload.role = data.role;
    if (data.employee_id) payload.employee_id = data.employee_id;
    if (data.hire_date) payload.hire_date = data.hire_date;
    if (data.hourly_rate) payload.hourly_rate = data.hourly_rate;

    if (isManager && data.managed_branches) {
      payload.managed_branches = data.managed_branches;
      payload.branch = null;
    } else if (isStaff) {
      payload.branch = data.branch || null;
      payload.managed_branches = [];
    }

    await updateMutation.mutateAsync(payload);
  };

  const getRoleVariant = (role: string) => {
    const roleMap: Record<string, "default" | "secondary" | "outline" | "danger"> = {
      admin: "danger",
      manager: "default",
      service_coordinator: "secondary",
      technician: "outline",
      receptionist: "secondary",
      parts_manager: "outline",
      accountant: "outline",
      customer: "outline",
    };
    return roleMap[role] || "outline";
  };

  const getRoleLabel = (role: string) => {
    const roleMap: Record<string, string> = {
      admin: "Admin",
      manager: "Manager",
      service_coordinator: "Service Coordinator",
      technician: "Technician",
      receptionist: "Receptionist",
      parts_manager: "Parts Manager",
      accountant: "Accountant",
      customer: "Customer",
    };
    return roleMap[role] || role;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-4 dark:bg-gray-900 min-h-screen p-6">
        <Link href="/admin/users">
          <Button variant="secondary" className="border-border dark:text-gray-200">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <Card className="dark:bg-gray-800 border-border">
          <CardContent className="pt-6">
            <p className="text-red-600 dark:text-red-400">User not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 dark:bg-gray-900 min-h-screen p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/admin/users">
            <Button variant="secondary" className="border-border dark:text-gray-200">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <div className="flex items-center space-x-2 flex-wrap">
              <h1 className="text-3xl font-bold text-foreground">
                {user.full_name || `${user.first_name} ${user.last_name}`.trim() || user.username}
              </h1>
              <Badge variant={getRoleVariant(user.role) as any} className="bg-muted text-foreground">
                {getRoleLabel(user.role)}
              </Badge>
              {user.is_active ? (
                <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  Active
                </Badge>
              ) : (
                <Badge variant="danger">Inactive</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">{user.email}</p>
          </div>
        </div>
        <div className="flex space-x-4">
          {isEditing ? (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setIsEditing(false);
                  reset();
                  setServerError(null);
                }}
                className="border-border dark:text-gray-200"
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button
                type="submit"
                form="user-edit-form"
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
            </>
          ) : (
            <Button onClick={() => setIsEditing(true)} className="dark:bg-primary dark:hover:bg-primary/90">
              <Edit className="w-4 h-4 mr-2" />
              Edit User
            </Button>
          )}
        </div>
      </div>

      {isEditing ? (
        <form id="user-edit-form" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-6">
            <Card className="dark:bg-gray-800 border-border">
              <CardHeader>
                <CardTitle className="text-foreground text-lg">Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {serverError && (
                  <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 text-red-700 dark:text-red-400 px-4 py-3 rounded-r flex items-start">
                    <AlertCircle className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">{serverError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-card-foreground mb-2">
                      First Name <span className="text-red-500">*</span>
                    </label>
                    <Input
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
                    <label className="block text-sm font-semibold text-card-foreground mb-2">
                      Last Name <span className="text-red-500">*</span>
                    </label>
                    <Input
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
                    <label className="block text-sm font-semibold text-card-foreground mb-2">Phone</label>
                    <Input
                      type="tel"
                      placeholder="(555) 123-4567"
                      {...register("phone")}
                      className="bg-muted border-border text-foreground"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-card-foreground mb-2">
                      Role <span className="text-red-500">*</span>
                    </label>
                    <Select
                      value={watch("role")}
                      onValueChange={(val: any) => setValue("role", val, { shouldValidate: true })}
                    >
                      <SelectTrigger className={errors.role ? "border-red-500 dark:border-red-500" : "bg-muted border-border text-foreground"}>
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.role && (
                      <p className="text-red-500 dark:text-red-400 text-xs mt-1.5 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {errors.role.message}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="is_active"
                      {...register("is_active")}
                      className="rounded border-gray-300 text-primary focus:ring-primary dark:bg-gray-600 dark:border-gray-500 w-4 h-4"
                    />
                    <label htmlFor="is_active" className="text-sm font-medium text-card-foreground">
                      User is active
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="email_notifications"
                      {...register("email_notifications")}
                      className="rounded border-gray-300 text-primary focus:ring-primary dark:bg-gray-600 dark:border-gray-500 w-4 h-4"
                    />
                    <label htmlFor="email_notifications" className="text-sm font-medium text-card-foreground">
                      Email Notifications
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="sms_notifications"
                      {...register("sms_notifications")}
                      className="rounded border-gray-300 text-primary focus:ring-primary dark:bg-gray-600 dark:border-gray-500 w-4 h-4"
                    />
                    <label htmlFor="sms_notifications" className="text-sm font-medium text-card-foreground">
                      SMS Notifications
                    </label>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Branch Assignment and Employment Information - Combined */}
            {(isManager || isStaff) && (
              <Card className="dark:bg-gray-800 border-border border-l-4 border-l-primary">
                <CardHeader>
                  <CardTitle className="text-foreground flex items-center gap-2 text-lg">
                    <Building2 className="w-5 h-5 text-primary dark:text-primary" />
                    Branch Assignment & Employment Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Branch Assignment - Left Side */}
                    <div className="space-y-6">
                      {isManager ? (
                        <div>
                          <label className="block text-sm font-semibold text-card-foreground mb-3">
                            Managed Branches <span className="text-red-500">*</span>
                          </label>
                          <p className="text-xs text-muted-foreground mb-3">
                            Select all branches this manager should oversee
                          </p>
                          <div className="space-y-2 max-h-64 overflow-y-auto border border-border rounded-lg p-3 bg-muted/50 bg-gray-50">
                            {branches.length > 0 ? (
                              branches.map((branch) => {
                                const isSelected = (watch("managed_branches") || []).includes(branch.id);
                                return (
                                  <label
                                    key={branch.id}
                                    className="flex items-center space-x-3 cursor-pointer hover:bg-primary/10 dark:hover:bg-orange-900/20 p-3 rounded-lg border border-gray-200 border-border transition-colors"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={(e) => {
                                        const current = watch("managed_branches") || [];
                                        if (e.target.checked) {
                                          setValue("managed_branches", [...current, branch.id]);
                                        } else {
                                          setValue(
                                            "managed_branches",
                                            current.filter((id) => id !== branch.id)
                                          );
                                        }
                                      }}
                                      className="rounded border-gray-300 text-primary focus:ring-primary dark:bg-gray-600 dark:border-gray-500 w-5 h-5"
                                    />
                                    <div className="flex-1">
                                      <span className="text-sm font-medium text-card-foreground">{branch.name}</span>
                                      {branch.code && (
                                        <span className="text-xs text-muted-foreground ml-2">({branch.code})</span>
                                      )}
                                    </div>
                                  </label>
                                );
                              })
                            ) : (
                              <div className="text-center py-8">
                                <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                                <p className="text-sm text-muted-foreground">No active branches available</p>
                                <p className="text-xs text-muted-foreground mt-1">Create a branch first before assigning users</p>
                              </div>
                            )}
                          </div>
                          {errors.managed_branches && (
                            <p className="text-red-500 dark:text-red-400 text-xs mt-2 flex items-center gap-1">
                              <AlertCircle className="w-4 h-4" />
                              {errors.managed_branches.message}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div>
                          <label className="block text-sm font-semibold text-card-foreground mb-3">
                            Assigned Branch <span className="text-red-500">*</span>
                          </label>
                          <p className="text-xs text-muted-foreground mb-3">
                            Select the primary branch for this staff member
                          </p>
                          <Select
                            value={watch("branch")?.toString() || ""}
                            onValueChange={(val) => setValue("branch", val ? Number(val) : null, { shouldValidate: true })}
                          >
                            <SelectTrigger className={errors.branch ? "border-red-500 dark:border-red-500" : "bg-muted border-border text-foreground"}>
                              <SelectValue placeholder="-- Select a branch --" />
                            </SelectTrigger>
                            <SelectContent>
                              {branches.map((branch) => (
                                <SelectItem key={branch.id} value={branch.id.toString()}>
                                  {branch.name} {branch.code ? `(${branch.code})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {errors.branch && (
                            <p className="text-red-500 dark:text-red-400 text-xs mt-2 flex items-center gap-1">
                              <AlertCircle className="w-4 h-4" />
                              {errors.branch.message}
                            </p>
                          )}
                          {branches.length === 0 && (
                            <div className="mt-3 p-3 bg-warning/10 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                              <p className="text-xs text-yellow-800 dark:text-yellow-400 flex items-center gap-2">
                                <Info className="w-4 h-4" />
                                No active branches available. Create a branch first before assigning users.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Employment Info (for staff) - Right Side */}
                    {isStaff && (
                      <div className="space-y-6">
                        <div>
                          <label className="block text-sm font-semibold text-card-foreground mb-2">
                            Employee ID
                          </label>
                          <Input
                            placeholder="EMP-00001"
                            {...register("employee_id")}
                            className="bg-muted border-border text-foreground"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-card-foreground mb-2">
                            Hire Date
                          </label>
                          <Input
                            type="date"
                            {...register("hire_date")}
                            className="bg-muted border-border text-foreground"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-card-foreground mb-2">
                            Hourly Rate
                          </label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            {...register("hourly_rate")}
                            className="bg-muted border-border text-foreground"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Password Reset Section */}
            <Card className="dark:bg-gray-800 border-border border-l-4 border-l-orange-500">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2 text-lg">
                  <KeyRound className="w-5 h-5 text-primary" />
                  Password Reset
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!showPasswordReset ? (
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setShowPasswordReset(true)}
                      className="border-border dark:text-gray-300 flex-1"
                    >
                      <KeyRound className="w-4 h-4 mr-2" />
                      Reset Password
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => sendResetLinkMutation.mutate()}
                      disabled={sendResetLinkMutation.isPending}
                      className="border-border dark:text-gray-300 flex-1"
                    >
                      {sendResetLinkMutation.isPending ? (
                        <span className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          Sending...
                        </span>
                      ) : (
                        <>
                          <Mail className="w-4 h-4 mr-2" />
                          Send Reset Link
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-card-foreground mb-2">
                        New Password <span className="text-red-500">*</span>
                      </label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            type={showPassword ? "text" : "password"}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Enter new password or generate one"
                            className="bg-muted border-border text-foreground pr-10"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-gray-700 dark:hover:text-gray-300"
                            title={showPassword ? "Hide password" : "Show password"}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={handleGeneratePassword}
                          className="border-border dark:text-gray-300"
                          title="Generate secure password"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                        {newPassword && (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={handleCopyPassword}
                            className="border-border dark:text-gray-300"
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
                        id="send_password_email"
                        className="rounded border-gray-300 text-primary focus:ring-primary dark:bg-gray-600 dark:border-gray-500 w-4 h-4"
                      />
                      <label htmlFor="send_password_email" className="text-sm font-medium text-card-foreground">
                        Send new password to user via email
                      </label>
                    </div>
                    <div className="flex gap-3">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setShowPasswordReset(false);
                          setNewPassword("");
                        }}
                        className="border-border dark:text-gray-300 flex-1"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        onClick={() => {
                          const sendEmail = (document.getElementById("send_password_email") as HTMLInputElement)?.checked || false;
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
              </CardContent>
            </Card>

            {/* User Details Sidebar */}
            <Card className="dark:bg-gray-800 border-border">
              <CardHeader>
                <CardTitle className="text-foreground text-lg">Account Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Email</p>
                  <p className="text-foreground mt-1">{user.email}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Username</p>
                  <p className="text-foreground mt-1">{user.username}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Created At</p>
                  <p className="text-foreground mt-1">
                    {format(new Date(user.created_at), "MMM dd, yyyy HH:mm")}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Last Updated</p>
                  <p className="text-foreground mt-1">
                    {format(new Date(user.updated_at), "MMM dd, yyyy HH:mm")}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </form>
      ) : (
        <div className="space-y-6">
          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Status Card */}
            <Card className="dark:bg-gray-800 border-border">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Status</p>
                    {user.is_active ? (
                      <Badge variant="default" className="mt-2 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="danger" className="mt-2">Inactive</Badge>
                    )}
                  </div>
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${user.is_active ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"}`}>
                    {user.is_active ? (
                      <UserCheck className={`w-6 h-6 ${user.is_active ? "text-success" : "text-red-600 dark:text-red-400"}`} />
                    ) : (
                      <UserX className="w-6 h-6 text-red-600 dark:text-red-400" />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Role Card */}
            <Card className="dark:bg-gray-800 border-border">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Role</p>
                    <Badge variant={getRoleVariant(user.role) as any} className="mt-2 bg-muted text-foreground">
                      {getRoleLabel(user.role)}
                    </Badge>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-primary dark:text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Branch Card */}
            <Card className="dark:bg-gray-800 border-border">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">Branch</p>
                    <p className="text-sm font-medium text-foreground mt-2 truncate">
                      {user.role === "manager" && user.managed_branches_names && user.managed_branches_names.length > 0
                        ? `${user.managed_branches_names.length} branch${user.managed_branches_names.length !== 1 ? "es" : ""}`
                        : user.branch_name || "Not assigned"}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0 ml-2">
                    <Building2 className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Information Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Personal Information */}
            <Card className="dark:bg-gray-800 border-border lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-foreground text-lg font-semibold">Personal Information</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground mb-1">Email Address</dt>
                    <dd className="text-base text-foreground font-medium">{user.email}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground mb-1">Username</dt>
                    <dd className="text-base text-foreground font-mono">{user.username}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground mb-1">Phone Number</dt>
                    <dd className="text-base text-foreground">
                      {user.phone || <span className="text-gray-400 italic">Not provided</span>}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground mb-1">Full Name</dt>
                    <dd className="text-base text-foreground font-medium">
                      {user.full_name || `${user.first_name} ${user.last_name}`.trim() || "—"}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            {/* Account Details */}
            <Card className="dark:bg-gray-800 border-border">
              <CardHeader>
                <CardTitle className="text-foreground text-lg font-semibold">Account Details</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-4">
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground mb-1">Member Since</dt>
                    <dd className="text-sm text-foreground">
                      {format(new Date(user.created_at), "MMM dd, yyyy")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground mb-1">Last Updated</dt>
                    <dd className="text-sm text-foreground">
                      {format(new Date(user.updated_at), "MMM dd, yyyy")}
                    </dd>
                  </div>
                  <div className="pt-4 border-t border-border">
                    <dt className="text-sm font-medium text-muted-foreground mb-3">Notification Preferences</dt>
                    <dd className="space-y-2">
                      <div className="flex items-center justify-between p-2 bg-gray-50 bg-muted/50 rounded-md">
                        <span className="text-sm text-card-foreground">Email</span>
                        <Badge variant={user.email_notifications ? "default" : "secondary"} className={user.email_notifications ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs" : "text-xs"}>
                          {user.email_notifications ? "On" : "Off"}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-gray-50 bg-muted/50 rounded-md">
                        <span className="text-sm text-card-foreground">SMS</span>
                        <Badge variant={user.sms_notifications ? "default" : "secondary"} className={user.sms_notifications ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs" : "text-xs"}>
                          {user.sms_notifications ? "On" : "Off"}
                        </Badge>
                      </div>
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>

          {/* Branch & Employment Information */}
          <Card className="dark:bg-gray-800 border-border border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2 text-lg font-semibold">
                <Building2 className="w-5 h-5 text-primary dark:text-primary" />
                Branch & Employment Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Branch Assignment */}
                <div>
                  <dt className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Branch Assignment
                  </dt>
                  {user.role === "manager" && user.managed_branches_names && user.managed_branches_names.length > 0 ? (
                    <div className="p-4 bg-primary/10 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                      <p className="text-base font-semibold text-foreground mb-1">
                        {user.managed_branches_names.join(", ")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Managing {user.managed_branches_names.length} branch{user.managed_branches_names.length !== 1 ? "es" : ""}
                      </p>
                    </div>
                  ) : user.branch_name ? (
                    <div className="p-4 bg-primary/10 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                      <p className="text-base font-semibold text-foreground">{user.branch_name}</p>
                    </div>
                  ) : (
                    <div className="p-4 bg-gray-50 bg-muted/50 rounded-lg border border-border">
                      <p className="text-sm text-muted-foreground italic">No branch assigned</p>
                    </div>
                  )}
                </div>

                {/* Employment Info */}
                {(user.employee_id || user.hire_date || user.hourly_rate) && (
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground mb-3">Employment Details</dt>
                    <dl className="space-y-3">
                      {user.employee_id && (
                        <div>
                          <dt className="text-xs font-medium text-muted-foreground mb-1">Employee ID</dt>
                          <dd className="text-sm font-mono text-foreground font-semibold">{user.employee_id}</dd>
                        </div>
                      )}
                      {user.hire_date && (
                        <div>
                          <dt className="text-xs font-medium text-muted-foreground mb-1">Hire Date</dt>
                          <dd className="text-sm text-foreground">
                            {format(new Date(user.hire_date), "MMMM dd, yyyy")}
                          </dd>
                        </div>
                      )}
                      {user.hourly_rate && (
                        <div>
                          <dt className="text-xs font-medium text-muted-foreground mb-1">Hourly Rate</dt>
                          <dd className="text-sm text-foreground font-semibold">
                            {formatCurrency(parseFloat(user.hourly_rate))}/hr
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Password Reset Section */}
          <Card className="dark:bg-gray-800 border-border border-l-4 border-l-orange-500">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2 text-lg font-semibold">
                <KeyRound className="w-5 h-5 text-primary" />
                Password Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowPasswordReset(true)}
                  className="border-border dark:text-gray-300"
                >
                  <KeyRound className="w-4 h-4 mr-2" />
                  Reset Password
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => sendResetLinkMutation.mutate()}
                  disabled={sendResetLinkMutation.isPending}
                  className="border-border dark:text-gray-300"
                >
                  {sendResetLinkMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Sending...
                    </span>
                  ) : (
                    <>
                      <Mail className="w-4 h-4 mr-2" />
                      Send Reset Link
                    </>
                  )}
                </Button>
              </div>
              {showPasswordReset && (
                <div className="mt-6 pt-6 border-t border-border space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-card-foreground mb-2">
                      New Password <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={showPassword ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Enter new password or generate one"
                          className="bg-muted border-border text-foreground pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-gray-700 dark:hover:text-gray-300"
                          title={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleGeneratePassword}
                        className="border-border dark:text-gray-300"
                        title="Generate secure password"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                      {newPassword && (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={handleCopyPassword}
                          className="border-border dark:text-gray-300"
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
                      id="send_password_email_view"
                      className="rounded border-gray-300 text-primary focus:ring-primary dark:bg-gray-600 dark:border-gray-500 w-4 h-4"
                    />
                    <label htmlFor="send_password_email_view" className="text-sm font-medium text-card-foreground">
                      Send new password to user via email
                    </label>
                  </div>
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setShowPasswordReset(false);
                        setNewPassword("");
                      }}
                      className="border-border dark:text-gray-300 flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        const sendEmail = (document.getElementById("send_password_email_view") as HTMLInputElement)?.checked || false;
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
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
