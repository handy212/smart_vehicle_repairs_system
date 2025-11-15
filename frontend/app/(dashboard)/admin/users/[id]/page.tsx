"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { adminApi, UserUpdate } from "@/lib/api/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Edit, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
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
});

type UserUpdateFormData = z.infer<typeof userUpdateSchema>;

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

  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setError,
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
        }
      : undefined,
  });

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
    await updateMutation.mutateAsync(data);
  };

  const getRoleVariant = (role: string) => {
    switch (role) {
      case "admin":
        return "danger";
      case "manager":
        return "warning";
      case "technician":
        return "info";
      case "receptionist":
        return "secondary";
      default:
        return "default";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-4">
        <Link href="/admin/users">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <Card>
          <CardContent className="pt-6">
            <p className="text-red-600">User not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/admin/users">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-3xl font-bold text-gray-900">
                {user.full_name || `${user.first_name} ${user.last_name}`.trim() || user.username}
              </h1>
              <Badge variant={getRoleVariant(user.role) as any}>{user.role}</Badge>
              {user.is_active ? (
                <Badge variant="success">Active</Badge>
              ) : (
                <Badge variant="danger">Inactive</Badge>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">{user.email}</p>
          </div>
        </div>
        {!isEditing && (
          <Button onClick={() => setIsEditing(true)}>
            <Edit className="w-4 h-4 mr-2" />
            Edit User
          </Button>
        )}
      </div>

      {isEditing ? (
        <form onSubmit={handleSubmit(onSubmit)}>
          <Card>
            <CardHeader>
              <CardTitle>Edit User</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {serverError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded flex items-start">
                  <AlertCircle className="w-5 h-5 mr-2 mt-0.5" />
                  <span>{serverError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    {...register("first_name")}
                    className={errors.first_name ? "border-red-500" : ""}
                  />
                  {errors.first_name && (
                    <p className="text-red-500 text-xs mt-1">{errors.first_name.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    {...register("last_name")}
                    className={errors.last_name ? "border-red-500" : ""}
                  />
                  {errors.last_name && (
                    <p className="text-red-500 text-xs mt-1">{errors.last_name.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <Input type="tel" {...register("phone")} />
                </div>

                <div className="flex items-center space-x-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      {...register("is_active")}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Active</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      {...register("email_notifications")}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Email Notifications</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      {...register("sms_notifications")}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">SMS Notifications</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end space-x-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsEditing(false);
                    reset();
                    setServerError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting || updateMutation.isPending}>
                  {isSubmitting || updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>User Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Email</p>
                <p className="text-gray-900">{user.email}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Username</p>
                <p className="text-gray-900">{user.username}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Phone</p>
                <p className="text-gray-900">{user.phone || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Role</p>
                <Badge variant={getRoleVariant(user.role) as any} className="mt-1">
                  {user.role}
                </Badge>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Status</p>
                {user.is_active ? (
                  <Badge variant="success" className="mt-1">Active</Badge>
                ) : (
                  <Badge variant="danger" className="mt-1">Inactive</Badge>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Additional Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Created At</p>
                <p className="text-gray-900">
                  {format(new Date(user.created_at), "MMM dd, yyyy HH:mm")}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Last Updated</p>
                <p className="text-gray-900">
                  {format(new Date(user.updated_at), "MMM dd, yyyy HH:mm")}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Notifications</p>
                <div className="mt-1 space-y-1">
                  <p className="text-sm text-gray-700">
                    Email: {user.email_notifications ? "Enabled" : "Disabled"}
                  </p>
                  <p className="text-sm text-gray-700">
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

