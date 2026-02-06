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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, AlertCircle, Building2, Info, RefreshCw, Copy, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
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
    ]),
    branch: z.number().nullable().optional(),
    managed_branches: z.array(z.number()).optional(),
    employee_id: z.string().optional(),
    hire_date: z.string().optional(),
    hourly_rate: z.string().optional(),
    is_active: z.boolean().optional(),
    send_welcome_email: z.boolean().optional(),
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
  )
  .refine(
    (data) => {
      // Managers must have at least one managed branch
      if (data.role === "manager") {
        return data.managed_branches && data.managed_branches.length > 0;
      }
      return true;
    },
    {
      message: "Managers must be assigned to at least one branch",
      path: ["managed_branches"],
    }
  )
  .refine(
    (data) => {
      // Staff must have a branch assigned
      if (
        data.role &&
        ["receptionist", "technician", "parts_manager", "service_coordinator", "accountant"].includes(
          data.role
        )
      ) {
        return data.branch !== null && data.branch !== undefined;
      }
      return true;
    },
    {
      message: "Staff members must be assigned to a branch",
      path: ["branch"],
    }
  );

type UserFormData = z.infer<typeof userSchema>;

const ROLE_OPTIONS = [
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

  // Fetch existing users to generate next employee ID
  const { data: existingUsersData } = useQuery({
    queryKey: ["admin", "users", "all"],
    queryFn: () => adminApi.users.list({ page: 1 }),
    select: (data) => data?.results || [],
  });

  // Generate next employee ID
  const generateNextEmployeeId = () => {
    const users = existingUsersData || [];
    const employeeIds = users
      .map((u) => u?.employee_id)
      .filter((id): id is string => !!id && id.startsWith("EMP-"))
      .map((id) => {
        const match = id.match(/EMP-(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      });
    const maxId = employeeIds.length > 0 ? Math.max(...employeeIds) : 0;
    return `EMP-${String(maxId + 1).padStart(5, "0")}`;
  };

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
      role: "receptionist",
      is_active: true,
      managed_branches: [],
      send_welcome_email: false, // Inverted: false = send email, true = don't send
    },
  });

  const selectedRole = watch("role");
  const employeeIdValue = watch("employee_id");
  const passwordValue = watch("password");
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);
  const isManager = selectedRole === "manager";
  const isStaff = ["receptionist", "technician", "parts_manager", "service_coordinator", "accountant"].includes(
    selectedRole || ""
  );

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
    const newPassword = generatePassword();
    setValue("password", newPassword);
    setValue("password2", newPassword);
    setPasswordCopied(false);
  };

  const handleCopyPassword = async () => {
    if (passwordValue) {
      try {
        await navigator.clipboard.writeText(passwordValue);
        setPasswordCopied(true);
        setTimeout(() => setPasswordCopied(false), 2000);
      } catch (err) {
        console.error("Failed to copy password:", err);
      }
    }
  };

  // Clear branch assignments when role changes
  useEffect(() => {
    if (isManager) {
      setValue("branch", null);
    } else if (isStaff) {
      setValue("managed_branches", []);
      // Auto-generate employee ID if not set or if it's empty
      if (!employeeIdValue || employeeIdValue.trim() === "") {
        const nextId = generateNextEmployeeId();
        setValue("employee_id", nextId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRole, isManager, isStaff, setValue, employeeIdValue]);

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
      // Invert the logic: send_welcome_email true means don't send, so we invert it
      payload.send_welcome_email = !data.send_welcome_email;

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
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/admin/users">
            <Button variant="secondary" className="border-border dark:text-gray-200">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-foreground">Create New User</h1>
        </div>
        <div className="flex space-x-4">
          <Link href="/admin/users">
            <Button type="button" variant="secondary" className="border-border dark:text-gray-200">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            form="user-create-form"
            disabled={isSubmitting || createMutation.isPending}
            className="dark:bg-primary dark:hover:bg-primary/90 min-w-[120px]"
          >
            {isSubmitting || createMutation.isPending ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Creating...
              </span>
            ) : (
              "Create User"
            )}
          </Button>
        </div>
      </div>

      <form id="user-create-form" onSubmit={handleSubmit(onSubmit)}>
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
                    Email <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="email"
                    placeholder="user@example.com"
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
                  <label className="block text-sm font-semibold text-card-foreground mb-2">
                    Username <span className="text-red-500">*</span>
                  </label>
                  <Input
                    placeholder="username"
                    {...register("username")}
                    className={errors.username ? "border-red-500 dark:border-red-500" : "bg-muted border-border text-foreground"}
                  />
                  {errors.username && (
                    <p className="text-red-500 dark:text-red-400 text-xs mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.username.message}
                    </p>
                  )}
                </div>

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

                <div>
                  <label className="block text-sm font-semibold text-card-foreground mb-2">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="Minimum 8 characters"
                        {...register("password")}
                        className={errors.password ? "border-red-500 dark:border-red-500 pr-10" : "bg-muted border-border text-foreground pr-10"}
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
                    {passwordValue && (
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
                  {errors.password && (
                    <p className="text-red-500 dark:text-red-400 text-xs mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.password.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-card-foreground mb-2">
                    Confirm Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Input
                      type={showPassword2 ? "text" : "password"}
                      placeholder="Re-enter password"
                      {...register("password2")}
                      className={errors.password2 ? "border-red-500 dark:border-red-500 pr-10" : "bg-muted border-border text-foreground pr-10"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword2(!showPassword2)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-gray-700 dark:hover:text-gray-300"
                      title={showPassword2 ? "Hide password" : "Show password"}
                    >
                      {showPassword2 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errors.password2 && (
                    <p className="text-red-500 dark:text-red-400 text-xs mt-1.5 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.password2.message}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Branch Assignment and Employment Information - Combined */}
          <Card className="dark:bg-gray-800 border-border border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2 text-lg">
                <Building2 className="w-5 h-5 text-primary dark:text-primary" />
                Branch Assignment & Employment Information
                <span className="text-red-500 text-sm font-normal">*</span>
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
                          branches.map((branch) => (
                            <label
                              key={branch.id}
                              className="flex items-center space-x-3 cursor-pointer hover:bg-primary/10 dark:hover:bg-orange-900/20 p-3 rounded-lg border border-gray-200 border-border transition-colors"
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
                                className="rounded border-gray-300 text-primary focus:ring-primary dark:bg-gray-600 dark:border-gray-500 w-5 h-5"
                              />
                              <div className="flex-1">
                                <span className="text-sm font-medium text-card-foreground">{branch.name}</span>
                                {branch.code && (
                                  <span className="text-xs text-muted-foreground ml-2">({branch.code})</span>
                                )}
                              </div>
                            </label>
                          ))
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

                      {/* Additional Options for Managers */}
                      <div className="mt-6 pt-6 border-t border-border space-y-3">
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
                            id="send_welcome_email"
                            {...register("send_welcome_email")}
                            className="rounded border-gray-300 text-primary focus:ring-primary dark:bg-gray-600 dark:border-gray-500 w-4 h-4"
                          />
                          <label htmlFor="send_welcome_email" className="text-sm font-medium text-card-foreground">
                            Do not send welcome letter
                          </label>
                        </div>
                      </div>
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

                      {/* Additional Options */}
                      <div className="mt-6 pt-6 border-t border-border space-y-3">
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
                            id="send_welcome_email"
                            {...register("send_welcome_email")}
                            className="rounded border-gray-300 text-primary focus:ring-primary dark:bg-gray-600 dark:border-gray-500 w-4 h-4"
                          />
                          <label htmlFor="send_welcome_email" className="text-sm font-medium text-card-foreground">
                            Do not send welcome letter
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Employment Info (for staff) - Right Side */}
                {isStaff && (
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-semibold text-card-foreground mb-2">
                        Employee ID
                        <span className="text-xs text-muted-foreground ml-2 font-normal">(Auto-generated, editable)</span>
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
        </div>
      </form>
    </div>
  );
}
