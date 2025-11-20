"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { adminApi, UserUpdate, User } from "@/lib/api/admin";
import { branchesApi } from "@/lib/api/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ArrowLeft, Edit, AlertCircle, Building2, Save, X } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AxiosError } from "axios";
import { useToast } from "@/lib/hooks/useToast";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

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
    "customer",
  ]).optional(),
  branch: z.number().nullable().optional(),
  managed_branches: z.array(z.number()).optional(),
  employee_id: z.string().optional(),
  hire_date: z.string().optional(),
  hourly_rate: z.string().optional(),
});

type UserUpdateFormData = z.infer<typeof userUpdateSchema>;

const ROLE_OPTIONS = [
  { value: "customer", label: "Customer" },
  { value: "receptionist", label: "Receptionist" },
  { value: "technician", label: "Technician" },
  { value: "parts_manager", label: "Parts Manager" },
  { value: "service_coordinator", label: "Service Coordinator" },
  { value: "accountant", label: "Accountant" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
];

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const userId = parseInt(params.id as string);
  const [isEditing, setIsEditing] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-4 dark:bg-gray-900 min-h-screen p-6">
        <Link href="/admin/users">
          <Button variant="outline" className="dark:border-gray-700 dark:text-gray-200">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <Card className="dark:bg-gray-800 dark:border-gray-700">
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
            <Button variant="outline" className="dark:border-gray-700 dark:text-gray-200">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <div className="flex items-center space-x-2 flex-wrap">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                {user.full_name || `${user.first_name} ${user.last_name}`.trim() || user.username}
              </h1>
              <Badge variant={getRoleVariant(user.role) as any} className="dark:bg-gray-700 dark:text-white">
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
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{user.email}</p>
          </div>
        </div>
        {!isEditing && (
          <Button onClick={() => setIsEditing(true)} className="dark:bg-blue-600 dark:hover:bg-blue-700">
            <Edit className="w-4 h-4 mr-2" />
            Edit User
          </Button>
        )}
      </div>

      {isEditing ? (
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardHeader>
                  <CardTitle className="dark:text-white">User Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {serverError && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded flex items-start">
                      <AlertCircle className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" />
                      <span>{serverError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        First Name <span className="text-red-500">*</span>
                      </label>
                      <Input
                        {...register("first_name")}
                        className={errors.first_name ? "border-red-500 dark:border-red-500" : "dark:bg-gray-700 dark:border-gray-600 dark:text-white"}
                      />
                      {errors.first_name && (
                        <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.first_name.message}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Last Name <span className="text-red-500">*</span>
                      </label>
                      <Input
                        {...register("last_name")}
                        className={errors.last_name ? "border-red-500 dark:border-red-500" : "dark:bg-gray-700 dark:border-gray-600 dark:text-white"}
                      />
                      {errors.last_name && (
                        <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.last_name.message}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                      <Input
                        type="tel"
                        {...register("phone")}
                        className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
                      <Select
                        {...register("role")}
                        className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      >
                        {ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </div>

                    <div className="flex items-center space-x-4">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          {...register("is_active")}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:bg-gray-600 dark:border-gray-500"
                        />
                        <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Active</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          {...register("email_notifications")}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:bg-gray-600 dark:border-gray-500"
                        />
                        <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Email Notifications</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          {...register("sms_notifications")}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:bg-gray-600 dark:border-gray-500"
                        />
                        <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">SMS Notifications</span>
                      </label>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Branch Assignment */}
              {(isManager || isStaff) && (
                <Card className="dark:bg-gray-800 dark:border-gray-700">
                  <CardHeader>
                    <CardTitle className="dark:text-white flex items-center gap-2">
                      <Building2 className="w-5 h-5" />
                      Branch Assignment
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {isManager ? (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Managed Branches
                        </label>
                        <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-md p-3 dark:bg-gray-700">
                          {branches.length > 0 ? (
                            branches.map((branch) => {
                              const isSelected = (watch("managed_branches") || []).includes(branch.id);
                              return (
                                <label
                                  key={branch.id}
                                  className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 p-2 rounded"
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
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:bg-gray-600 dark:border-gray-500"
                                  />
                                  <span className="text-sm text-gray-700 dark:text-gray-300">{branch.name}</span>
                                </label>
                              );
                            })
                          ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400">No active branches available</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Assigned Branch
                        </label>
                        <Select
                          {...register("branch", { setValueAs: (v) => (v ? Number(v) : null) })}
                          className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        >
                          <option value="">Select a branch</option>
                          {branches.map((branch) => (
                            <option key={branch.id} value={branch.id}>
                              {branch.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Employment Info */}
              {isStaff && (
                <Card className="dark:bg-gray-800 dark:border-gray-700">
                  <CardHeader>
                    <CardTitle className="dark:text-white">Employment Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Employee ID
                        </label>
                        <Input
                          {...register("employee_id")}
                          className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Hire Date
                        </label>
                        <Input
                          type="date"
                          {...register("hire_date")}
                          className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Hourly Rate
                        </label>
                        <Input
                          type="number"
                          step="0.01"
                          {...register("hourly_rate")}
                          className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-end space-x-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsEditing(false);
                    reset();
                    setServerError(null);
                  }}
                  className="dark:border-gray-700 dark:text-gray-200"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting || updateMutation.isPending} className="dark:bg-blue-600 dark:hover:bg-blue-700">
                  <Save className="w-4 h-4 mr-2" />
                  {isSubmitting || updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1">
              <Card className="dark:bg-gray-800 dark:border-gray-700 sticky top-6">
                <CardHeader>
                  <CardTitle className="dark:text-white">User Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</p>
                    <p className="text-gray-900 dark:text-white">{user.email}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Username</p>
                    <p className="text-gray-900 dark:text-white">{user.username}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Created At</p>
                    <p className="text-gray-900 dark:text-white">
                      {format(new Date(user.created_at), "MMM dd, yyyy HH:mm")}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Last Updated</p>
                    <p className="text-gray-900 dark:text-white">
                      {format(new Date(user.updated_at), "MMM dd, yyyy HH:mm")}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="dark:text-white">User Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</p>
                <p className="text-gray-900 dark:text-white">{user.email}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Username</p>
                <p className="text-gray-900 dark:text-white">{user.username}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Phone</p>
                <p className="text-gray-900 dark:text-white">{user.phone || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Role</p>
                <Badge variant={getRoleVariant(user.role) as any} className="mt-1 dark:bg-gray-700 dark:text-white">
                  {getRoleLabel(user.role)}
                </Badge>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</p>
                {user.is_active ? (
                  <Badge variant="default" className="mt-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                    Active
                  </Badge>
                ) : (
                  <Badge variant="danger" className="mt-1">Inactive</Badge>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="dark:text-white">Branch & Additional Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Branch Information */}
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Branch Assignment
                </p>
                {user.role === "manager" && user.managed_branches_names && user.managed_branches_names.length > 0 ? (
                  <div className="mt-1">
                    <p className="text-gray-900 dark:text-white">
                      {user.managed_branches_names.join(", ")}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {user.managed_branches_names.length} branch{user.managed_branches_names.length !== 1 ? "es" : ""}
                    </p>
                  </div>
                ) : user.branch_name ? (
                  <p className="text-gray-900 dark:text-white mt-1">{user.branch_name}</p>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 italic mt-1">No branch assigned</p>
                )}
              </div>

              {user.employee_id && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Employee ID</p>
                  <p className="text-gray-900 dark:text-white">{user.employee_id}</p>
                </div>
              )}

              {user.hire_date && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Hire Date</p>
                  <p className="text-gray-900 dark:text-white">
                    {format(new Date(user.hire_date), "MMM dd, yyyy")}
                  </p>
                </div>
              )}

              {user.hourly_rate && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Hourly Rate</p>
                  <p className="text-gray-900 dark:text-white">${user.hourly_rate}</p>
                </div>
              )}

              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Created At</p>
                <p className="text-gray-900 dark:text-white">
                  {format(new Date(user.created_at), "MMM dd, yyyy HH:mm")}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Last Updated</p>
                <p className="text-gray-900 dark:text-white">
                  {format(new Date(user.updated_at), "MMM dd, yyyy HH:mm")}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Notifications</p>
                <div className="mt-1 space-y-1">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Email: {user.email_notifications ? "Enabled" : "Disabled"}
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    SMS: {user.sms_notifications ? "Enabled" : "Disabled"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
