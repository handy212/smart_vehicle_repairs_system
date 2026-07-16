"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import apiClient from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Lock, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";

const passwordSchema = z
    .object({
        current_password: z.string().min(1, "Current password is required"),
        new_password: z.string().min(8, "Password must be at least 8 characters"),
        confirm_password: z.string().min(1, "Please confirm your password"),
    })
    .refine((data) => data.new_password === data.confirm_password, {
        message: "Passwords do not match",
        path: ["confirm_password"],
    });

type PasswordFormData = z.infer<typeof passwordSchema>;

export default function ChangePasswordPage() {
    const router = useRouter();
    const { toast } = useToast();
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
        reset,
    } = useForm<PasswordFormData>({
        resolver: zodResolver(passwordSchema),
    });

    const changePasswordMutation = useMutation({
        mutationFn: async (data: { current_password: string; new_password: string }) => {
            const response = await apiClient.post("/auth/users/change_password/", {
                old_password: data.current_password,
                new_password: data.new_password,
                new_password2: data.new_password,
            });
            return response.data;
        },
        onSuccess: () => {
            toast({
                title: "Password Changed",
                description: "Your password has been changed successfully.",
            });
            reset();
            router.push("/admin/profile");
        },

        onError: (error: unknown) => {
            toast({
                title: "Password Change Failed",
                description: getUserFacingError(error, "Failed to change password. Please check your current password and try again."),
                variant: "destructive",
            });
        },
    });

    const onSubmit = (data: PasswordFormData) => {
        changePasswordMutation.mutate({
            current_password: data.current_password,
            new_password: data.new_password,
        });
    };

    return (
        <div className="space-y-6">
            <div>
                <Link href="/admin/profile">
                    <Button variant="ghost" className="mb-2 -ml-2">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Profile
                    </Button>
                </Link>
                <h1 className="text-3xl font-bold text-foreground">Change Password</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Update your account password
                </p>
            </div>

            <div className="max-w-2xl">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center space-x-2">
                            <Lock className="w-5 h-5" />
                            <span>Change Password</span>
                        </CardTitle>
                        <CardDescription>
                            Enter your current password and choose a new secure password
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="current_password">
                                    Current Password <span className="text-destructive">*</span>
                                </Label>
                                <div className="relative">
                                    <Input
                                        id="current_password"
                                        type={showCurrentPassword ? "text" : "password"}
                                        {...register("current_password")}
                                        className={`pr-10 ${errors.current_password ? "border-destructive" : ""}`}
                                        placeholder="Enter your current password"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-muted-foreground"
                                    >
                                        {showCurrentPassword ? (
                                            <EyeOff className="w-4 h-4" />
                                        ) : (
                                            <Eye className="w-4 h-4" />
                                        )}
                                    </button>
                                </div>
                                {errors.current_password && (
                                    <p className="text-sm text-destructive">{errors.current_password.message}</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="new_password">
                                    New Password <span className="text-destructive">*</span>
                                </Label>
                                <div className="relative">
                                    <Input
                                        id="new_password"
                                        type={showNewPassword ? "text" : "password"}
                                        {...register("new_password")}
                                        className={`pr-10 ${errors.new_password ? "border-destructive" : ""}`}
                                        placeholder="Enter your new password (min. 8 characters)"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowNewPassword(!showNewPassword)}
                                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-muted-foreground"
                                    >
                                        {showNewPassword ? (
                                            <EyeOff className="w-4 h-4" />
                                        ) : (
                                            <Eye className="w-4 h-4" />
                                        )}
                                    </button>
                                </div>
                                {errors.new_password && (
                                    <p className="text-sm text-destructive">{errors.new_password.message}</p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                    Password must be at least 8 characters long
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="confirm_password">
                                    Confirm New Password <span className="text-destructive">*</span>
                                </Label>
                                <div className="relative">
                                    <Input
                                        id="confirm_password"
                                        type={showConfirmPassword ? "text" : "password"}
                                        {...register("confirm_password")}
                                        className={`pr-10 ${errors.confirm_password ? "border-destructive" : ""}`}
                                        placeholder="Confirm your new password"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-muted-foreground"
                                    >
                                        {showConfirmPassword ? (
                                            <EyeOff className="w-4 h-4" />
                                        ) : (
                                            <Eye className="w-4 h-4" />
                                        )}
                                    </button>
                                </div>
                                {errors.confirm_password && (
                                    <p className="text-sm text-destructive">{errors.confirm_password.message}</p>
                                )}
                            </div>

                            <div className="flex items-center justify-end space-x-4 pt-4 border-t border-border">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => router.back()}
                                    disabled={isSubmitting || changePasswordMutation.isPending}
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={isSubmitting || changePasswordMutation.isPending}>
                                    {isSubmitting || changePasswordMutation.isPending
                                        ? "Changing Password..."
                                        : "Change Password"}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
