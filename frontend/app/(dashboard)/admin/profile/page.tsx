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
import { Loader2, User, Mail, Phone, Save, Shield, KeyRound, BadgeCheck, Upload, Briefcase } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

const profileSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  date_of_birth: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip_code: z.string().optional(),
  country: z.string().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export default function ProfilePage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";
  const [profileImage, setProfileImage] = React.useState<File | null>(null);
  const [imagePreview, setImagePreview] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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
      date_of_birth: user?.date_of_birth || "",
      address: user?.address || "",
      city: user?.city || "",
      state: user?.state || "",
      zip_code: user?.zip_code || "",
      country: user?.country || "",
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
        date_of_birth: profileData.date_of_birth || "",
        address: profileData.address || "",
        city: profileData.city || "",
        state: profileData.state || "",
        zip_code: profileData.zip_code || "",
        country: profileData.country || "",
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
    // If there's a profile image, we'd need to handle it separately
    // For now, just update the text fields
    updateProfileMutation.mutate(data);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid File",
          description: "Please select an image file",
          variant: "destructive",
        });
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "Image must be less than 5MB",
          variant: "destructive",
        });
        return;
      }

      setProfileImage(file);

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 dark:bg-gray-900 min-h-screen">
      <div className="flex items-center justify-between px-4 pt-4">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Profile Settings</h1>
          <p className="text-xs text-gray-500 mt-0.5">Manage your account information and preferences</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_2fr] px-4 pb-8">
        {/* Profile Information */}
        <Card className="border border-border shadow-sm">
          <CardHeader className="pb-3 border-b border-border bg-gray-50/50">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-orange-100 dark:bg-orange-900/20 rounded-md">
                <User className="w-4 h-4 text-primary dark:text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold text-foreground">Personal Information</CardTitle>
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
                    disabled={!isAdmin}
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
                    disabled={!isAdmin}
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
                  disabled={!isAdmin}
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
                  disabled={!isAdmin}
                  className={`h-8 text-sm ${errors.phone ? "border-red-500" : ""}`}
                />
                {errors.phone && (
                  <p className="text-[10px] text-red-500">{errors.phone.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="date_of_birth" className="text-xs font-semibold text-gray-700">Date of Birth</Label>
                <Input
                  id="date_of_birth"
                  type="date"
                  {...register("date_of_birth")}
                  disabled={!isAdmin}
                  className="h-8 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="address" className="text-xs font-semibold text-gray-700">Street Address</Label>
                <Input
                  id="address"
                  {...register("address")}
                  placeholder="123 Main Street"
                  disabled={!isAdmin}
                  className="h-8 text-sm"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="city" className="text-xs font-semibold text-gray-700">City</Label>
                  <Input
                    id="city"
                    {...register("city")}
                    placeholder="New York"
                    disabled={!isAdmin}
                    className="h-8 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="state" className="text-xs font-semibold text-gray-700">State</Label>
                  <Input
                    id="state"
                    {...register("state")}
                    placeholder="NY"
                    disabled={!isAdmin}
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="zip_code" className="text-xs font-semibold text-gray-700">Zip Code</Label>
                  <Input
                    id="zip_code"
                    {...register("zip_code")}
                    placeholder="10001"
                    disabled={!isAdmin}
                    className="h-8 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="country" className="text-xs font-semibold text-gray-700">Country</Label>
                  <Input
                    id="country"
                    {...register("country")}
                    placeholder="USA"
                    disabled={!isAdmin}
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              {isAdmin && (
                <div className="pt-2">
                  <Button type="submit" disabled={isSubmitting} size="sm" className="bg-primary hover:bg-primary/90 text-white h-8 text-xs px-4">
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
              )}
            </form>
          </CardContent>
        </Card>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Profile Picture */}
          <Card className="border border-border shadow-sm">
            <CardHeader className="pb-3 border-b border-border bg-gray-50/50">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-orange-100 dark:bg-orange-900/20 rounded-md">
                  <User className="w-4 h-4 text-primary dark:text-primary" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-foreground">Profile Picture</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="flex flex-col items-center space-y-3">
                {imagePreview || user?.profile_picture ? (
                  <img
                    src={imagePreview || user?.profile_picture || ''}
                    alt="Profile"
                    className="h-24 w-24 rounded-full object-cover shadow-lg"
                  />
                ) : (
                  <div className="h-24 w-24 rounded-full bg-gradient-to-br from-primary to-primary/90 flex items-center justify-center text-white font-bold text-3xl shadow-lg">
                    {user?.first_name?.[0] || user?.email?.[0] || "U"}
                  </div>
                )}
                {isAdmin && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleUploadClick}
                      className="w-full h-8 text-xs"
                      type="button"
                    >
                      <Upload className="w-3.5 h-3.5 mr-1.5" />
                      {profileImage ? 'Change Photo' : 'Upload Photo'}
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Employment Info - Only for staff */}
          {user?.role !== 'customer' && (
            <Card className="border border-border shadow-sm">
              <CardHeader className="pb-3 border-b border-border bg-gray-50/50">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-purple-100 dark:bg-purple-900/20 rounded-md">
                    <Briefcase className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold text-foreground">Employment</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider">Employee ID</Label>
                  <div className="font-mono text-xs text-muted-foreground bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                    {user?.employee_id || "Not Assigned"}
                  </div>
                </div>

                {user?.hire_date && (
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider">Hire Date</Label>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(user.hire_date), "MMM d, yyyy")}
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider">Branch</Label>
                  <div className="text-xs text-muted-foreground">
                    {user?.branch_name || "Not Assigned"}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Security */}
          <Card className="border border-border shadow-sm">
            <CardHeader className="pb-3 border-b border-border bg-gray-50/50">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-orange-100 dark:bg-orange-900/20 rounded-md">
                  <KeyRound className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-foreground">Security</CardTitle>
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
    </div >
  );
}
