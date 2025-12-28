"use client";

import React from "react";
import { useAuthStore } from "@/store/authStore";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi } from "@/lib/api/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/lib/hooks/useToast";
import { Loader2, User, Mail, Phone, Save, Shield, KeyRound, BadgeCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const profileSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export default function ProfilePage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: profileData, isLoading } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      // For now, use the user data from auth store
      // In the future, you can fetch detailed profile from API
      return user;
    },
    enabled: !!user,
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
  React.useEffect(() => {
    if (profileData) {
      reset({
        first_name: profileData.first_name || "",
        last_name: profileData.last_name || "",
        email: profileData.email || "",
        phone: profileData.phone || "",
      });
    }
  }, [profileData, reset]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      return authApi.updateProfile(data);
    },
    onSuccess: (updatedUser) => {
      toast({
        title: "Success",
        description: "Profile updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      // Update auth store
      if (updatedUser) {
        useAuthStore.getState().setUser(updatedUser);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.response?.data?.message || "Failed to update profile",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: ProfileFormData) => {
    updateProfileMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 dark:bg-gray-900 min-h-screen">
      <div className="flex items-center justify-between px-4 pt-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">Profile Settings</h1>
          <p className="text-xs text-gray-500 mt-0.5">Manage your account information and preferences</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[2fr_1fr] px-4 pb-8">
        {/* Profile Information */}
        <Card className="border border-gray-200 dark:border-gray-800 shadow-sm">
          <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-100 dark:bg-blue-900/20 rounded-md">
                <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold text-gray-900 dark:text-white">Personal Information</CardTitle>
                <CardDescription className="text-xs">Update your personal details</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="first_name" className="text-xs font-semibold text-gray-700">First Name</Label>
                  <Input
                    id="first_name"
                    {...register("first_name")}
                    placeholder="John"
                    className={`h-8 text-sm ${errors.first_name ? "border-red-500" : ""}`}
                  />
                  {errors.first_name && (
                    <p className="text-[10px] text-red-500">{errors.first_name.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="last_name" className="text-xs font-semibold text-gray-700">Last Name</Label>
                  <Input
                    id="last_name"
                    {...register("last_name")}
                    placeholder="Doe"
                    className={`h-8 text-sm ${errors.last_name ? "border-red-500" : ""}`}
                  />
                  {errors.last_name && (
                    <p className="text-[10px] text-red-500">{errors.last_name.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" />
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  {...register("email")}
                  placeholder="john.doe@example.com"
                  className={`h-8 text-sm ${errors.email ? "border-red-500" : ""}`}
                />
                {errors.email && (
                  <p className="text-[10px] text-red-500">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" />
                  Phone Number
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  {...register("phone")}
                  placeholder="+1 (555) 123-4567"
                  className={`h-8 text-sm ${errors.phone ? "border-red-500" : ""}`}
                />
                {errors.phone && (
                  <p className="text-[10px] text-red-500">{errors.phone.message}</p>
                )}
              </div>

              <div className="pt-2">
                <Button type="submit" disabled={isSubmitting} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs px-4">
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5 mr-1.5" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Account Information */}
        <div className="space-y-4">
          <Card className="border border-gray-200 dark:border-gray-800 shadow-sm">
            <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-purple-100 dark:bg-purple-900/20 rounded-md">
                  <Shield className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-gray-900 dark:text-white">Account Info</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider">Role</Label>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs capitalize font-normal bg-gray-50 text-gray-700">
                    {user?.role || "N/A"}
                  </Badge>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider">User ID</Label>
                <div className="font-mono text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded w-fit">
                  {user?.id || "N/A"}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider">Status</Label>
                <div className="flex items-center gap-1.5 text-xs font-medium text-green-600">
                  <BadgeCheck className="w-3.5 h-3.5" />
                  Active
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-gray-200 dark:border-gray-800 shadow-sm">
            <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-orange-100 dark:bg-orange-900/20 rounded-md">
                  <KeyRound className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-gray-900 dark:text-white">Security</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <Button variant="outline" size="sm" className="w-full h-8 text-xs bg-white text-gray-700 border-gray-200 hover:bg-gray-50">
                Change Password
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
