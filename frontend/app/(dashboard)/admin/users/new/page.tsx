"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, UserCreate } from "@/lib/api/admin";
import { branchesApi } from "@/lib/api/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ArrowLeft, AlertCircle, Building2, Info } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { AxiosError } from "axios";
import { useToast } from "@/lib/hooks/useToast";

const userSchema = z
  .object({
    email: z.string().email("Invalid email address"),
    username: z.string().min(3, "Username must be at least 3 characters"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    password2: z.string(),
    first_name: z.string().min(1, "First name is required"),
    last_name: z.string().min(1, "Last name is required"),
    phone: z.string().optional(),
    role: z.enum([
      "admin",
      "manager",
      "service_coordinator",
      "technician",
      "receptionist",
      "parts_manager",
      "accountant",
      "customer",
    ]),
    branch: z.number().nullable().optional(),
    managed_branches: z.array(z.number()).optional(),
    employee_id: z.string().optional(),
    hire_date: z.string().optional(),
    hourly_rate: z.string().optional(),
    is_active: z.boolean().optional(),
  })
  .refine((data) => data.password === data.password2, {
    message: "Passwords don't match",
    path: ["password2"],
  })
  .refine(
    (data) => {
      // Managers should have managed_branches, not branch
      if (data.role === "manager") {
        return !data.branch;
      }
      return true;
    },
    {
      message: "Managers should be assigned via managed branches, not a single branch",
      path: ["branch"],
    }
  )
  .refine(
    (data) => {
      // Staff should have branch, not managed_branches
      if (
        data.role &&
        ["receptionist", "technician", "parts_manager", "service_coordinator", "accountant"].includes(
          data.role
        )
      ) {
        return !data.managed_branches || data.managed_branches.length === 0;
      }
      return true;
    },
    {
      message: "Staff roles should be assigned to a single branch, not multiple branches",
      path: ["managed_branches"],
    }
  );

type UserFormData = z.infer<typeof userSchema>;

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

export default function NewUserPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);

  // Fetch branches
  const { data: branchesData } = useQuery({
    queryKey: ["branches", "list"],
    queryFn: () => branchesApi.list({ is_active: true }),
  });

  const branches = Array.isArray(branchesData) ? branchesData : branchesData?.results || [];

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    setError,
    setValue,
  } = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      role: "customer",
      is_active: true,
      managed_branches: [],
    },
  });

  const selectedRole = watch("role");
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

  const createMutation = useMutation({
    mutationFn: (data: UserCreate) => {
      const payload: UserCreate = {
        email: data.email,
        username: data.username,
        password: data.password,
        password2: data.password2,
        first_name: data.first_name,
        last_name: data.last_name,
        phone: data.phone,
        role: data.role,
        is_active: data.is_active ?? true,
      };

      if (isManager && data.managed_branches && data.managed_branches.length > 0) {
        payload.managed_branches = data.managed_branches;
      } else if (isStaff && data.branch) {
        payload.branch = data.branch;
      }

      if (data.employee_id) payload.employee_id = data.employee_id;
      if (data.hire_date) payload.hire_date = data.hire_date;
      if (data.hourly_rate) payload.hourly_rate = data.hourly_rate;

      return adminApi.users.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast({
        title: "Success",
        description: "User created successfully",
      });
      router.push("/admin/users");
    },
    onError: (error: any) => {
      if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data;

        if (typeof errorData === "object") {
          Object.keys(errorData).forEach((key) => {
            if (Array.isArray(errorData[key])) {
              setError(key as keyof UserFormData, {
                type: "server",
                message: errorData[key][0],
              });
            }
          });
        } else if (typeof errorData === "string") {
          setServerError(errorData);
        } else if (errorData.detail) {
          setServerError(errorData.detail);
        }
      } else {
        setServerError("Failed to create user. Please try again.");
      }
    },
  });

  const onSubmit = async (data: UserFormData) => {
    setServerError(null);
    await createMutation.mutateAsync(data);
  };

  return (
    <div className="space-y-6 dark:bg-gray-900 min-h-screen p-6">
      <div className="flex items-center space-x-4">
        <Link href="/admin/users">
          <Button variant="outline" className="dark:border-gray-700 dark:text-gray-200">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Create New User</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Add a new user to the system</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
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
                      Email <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="email"
                      {...register("email")}
                      className={errors.email ? "border-red-500 dark:border-red-500" : "dark:bg-gray-700 dark:border-gray-600 dark:text-white"}
                    />
                    {errors.email && (
                      <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.email.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Username <span className="text-red-500">*</span>
                    </label>
                    <Input
                      {...register("username")}
                      className={errors.username ? "border-red-500 dark:border-red-500" : "dark:bg-gray-700 dark:border-gray-600 dark:text-white"}
                    />
                    {errors.username && (
                      <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.username.message}</p>
                    )}
                  </div>

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
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Role <span className="text-red-500">*</span>
                    </label>
                    <Select
                      {...register("role")}
                      className={errors.role ? "border-red-500 dark:border-red-500" : "dark:bg-gray-700 dark:border-gray-600 dark:text-white"}
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                    {errors.role && (
                      <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.role.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Password <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="password"
                      {...register("password")}
                      className={errors.password ? "border-red-500 dark:border-red-500" : "dark:bg-gray-700 dark:border-gray-600 dark:text-white"}
                    />
                    {errors.password && (
                      <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.password.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Confirm Password <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="password"
                      {...register("password2")}
                      className={errors.password2 ? "border-red-500 dark:border-red-500" : "dark:bg-gray-700 dark:border-gray-600 dark:text-white"}
                    />
                    {errors.password2 && (
                      <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.password2.message}</p>
                    )}
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
                        Managed Branches <span className="text-red-500">*</span>
                      </label>
                      <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-md p-3 dark:bg-gray-700">
                        {branches.length > 0 ? (
                          branches.map((branch) => (
                            <label
                              key={branch.id}
                              className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 p-2 rounded"
                            >
                              <input
                                type="checkbox"
                                value={branch.id}
                                {...register("managed_branches", {
                                  setValueAs: (value) => {
                                    const current = watch("managed_branches") || [];
                                    if (Array.isArray(value)) {
                                      return value.map(Number);
                                    }
                                    const branchId = Number(value);
                                    if (current.includes(branchId)) {
                                      return current.filter((id) => id !== branchId);
                                    }
                                    return [...current, branchId];
                                  },
                                })}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:bg-gray-600 dark:border-gray-500"
                              />
                              <span className="text-sm text-gray-700 dark:text-gray-300">{branch.name}</span>
                            </label>
                          ))
                        ) : (
                          <p className="text-sm text-gray-500 dark:text-gray-400">No active branches available</p>
                        )}
                      </div>
                      {errors.managed_branches && (
                        <p className="text-red-500 dark:text-red-400 text-xs mt-1">
                          {errors.managed_branches.message}
                        </p>
                      )}
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
                      {errors.branch && (
                        <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.branch.message}</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Employment Info (for staff) */}
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
          </div>

          {/* Sidebar Info */}
          <div className="lg:col-span-1">
            <Card className="dark:bg-gray-800 dark:border-gray-700 sticky top-6">
              <CardHeader>
                <CardTitle className="dark:text-white flex items-center gap-2">
                  <Info className="w-5 h-5" />
                  Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                  <p>
                    <strong className="text-gray-900 dark:text-white">Managers:</strong> Can be assigned to multiple
                    branches via "Managed Branches"
                  </p>
                  <p>
                    <strong className="text-gray-900 dark:text-white">Staff:</strong> Assigned to a single branch
                    (Receptionist, Technician, Parts Manager, Service Coordinator, Accountant)
                  </p>
                  <p>
                    <strong className="text-gray-900 dark:text-white">Customers:</strong> No branch assignment needed
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    {...register("is_active")}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:bg-gray-600 dark:border-gray-500"
                  />
                  <label htmlFor="is_active" className="text-sm text-gray-700 dark:text-gray-300">
                    User is active
                  </label>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="flex justify-end space-x-4 pt-6">
          <Link href="/admin/users">
            <Button type="button" variant="outline" className="dark:border-gray-700 dark:text-gray-200">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={isSubmitting || createMutation.isPending} className="dark:bg-blue-600 dark:hover:bg-blue-700">
            {isSubmitting || createMutation.isPending ? "Creating..." : "Create User"}
          </Button>
        </div>
      </form>
    </div>
  );
}
