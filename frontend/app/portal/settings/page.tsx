"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi } from "@/lib/api/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { User, Mail, Phone, Save, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/lib/hooks/useToast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import Link from "next/link";

const profileSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export default function ProfileSettingsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: ["user"],
    queryFn: () => authApi.getCurrentUser(),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      first_name: user?.first_name || "",
      last_name: user?.last_name || "",
      email: user?.email || "",
      phone: user?.phone || "",
    },
  });

  // Update form when user data loads
  useEffect(() => {
    if (user) {
      reset({
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        email: user.email || "",
        phone: user.phone || "",
      });
    }
  }, [user, reset]);

  const updateMutation = useMutation({
    mutationFn: (data: ProfileFormData) => authApi.updateProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
      toast({
        title: "Profile Updated",
        description: "Your profile has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.response?.data?.detail || "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ProfileFormData) => {
    updateMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-2 animate-pulse" />
          <div className="h-4 w-96 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  <div className="h-10 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Profile Settings</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage your account information and preferences
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Form */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <User className="w-5 h-5" />
                <span>Personal Information</span>
              </CardTitle>
              <CardDescription>Update your personal details</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="first_name">
                      First Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="first_name"
                      {...register("first_name")}
                      className={errors.first_name ? "border-red-500" : ""}
                      placeholder="John"
                    />
                    {errors.first_name && (
                      <p className="text-sm text-red-600">{errors.first_name.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="last_name">
                      Last Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="last_name"
                      {...register("last_name")}
                      className={errors.last_name ? "border-red-500" : ""}
                      placeholder="Doe"
                    />
                    {errors.last_name && (
                      <p className="text-sm text-red-600">{errors.last_name.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">
                    Email <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      {...register("email")}
                      className={`pl-10 ${errors.email ? "border-red-500" : ""}`}
                      placeholder="john.doe@example.com"
                    />
                  </div>
                  {errors.email && (
                    <p className="text-sm text-red-600">{errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      id="phone"
                      type="tel"
                      {...register("phone")}
                      className="pl-10"
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <Button
                    type="button"
                   variant="secondary"
                    onClick={() => router.back()}
                    disabled={isSubmitting || updateMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting || updateMutation.isPending}>
                    <Save className="w-4 h-4 mr-2" />
                    {isSubmitting || updateMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Account Actions */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Account Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Link href="/portal/settings/password">
                <Button variant="secondary" className="w-full justify-start">
                  <Lock className="w-4 h-4 mr-2" />
                  Change Password
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Account Type</p>
                <p className="font-medium text-gray-900 dark:text-gray-100 capitalize">
                  {user?.role || "Customer"}
                </p>
              </div>
              {user?.customer_profile && (
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Customer Number</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {(user as any).customer_profile?.customer_number || "N/A"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

