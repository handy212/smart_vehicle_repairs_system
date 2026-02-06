"use client";

import { useQuery } from "@tanstack/react-query";
import { authApi } from "@/lib/api/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { User, Mail, Phone, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { PortalPageHeader } from "../components/PortalPageHeader";

export default function ProfilePage() {
    const { data: user, isLoading } = useQuery({
        queryKey: ["user"],
        queryFn: () => authApi.getCurrentUser(),
    });

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div>
                    <div className="h-8 w-48 bg-border rounded mb-2 animate-pulse" />
                    <div className="h-4 w-96 bg-border rounded animate-pulse" />
                </div>
                <Card>
                    <CardContent className="p-6">
                        <div className="space-y-4">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="space-y-2">
                                    <div className="h-4 w-24 bg-border rounded animate-pulse" />
                                    <div className="h-10 w-full bg-border rounded animate-pulse" />
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
            <PortalPageHeader
                title="My Profile"
                description="View your account details and manage security"
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Profile Information (Read Only) */}
                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center space-x-2">
                                <User className="w-5 h-5" />
                                <span>Personal Information</span>
                            </CardTitle>
                            <CardDescription>Your personal details are managed by the administration</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="first_name">First Name</Label>
                                        <Input
                                            id="first_name"
                                            value={user?.first_name || ""}
                                            disabled
                                            className="bg-muted"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="last_name">Last Name</Label>
                                        <Input
                                            id="last_name"
                                            value={user?.last_name || ""}
                                            disabled
                                            className="bg-muted"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="email">Email</Label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <Input
                                            id="email"
                                            type="email"
                                            value={user?.email || ""}
                                            disabled
                                            className="pl-10 bg-muted"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="phone">Phone Number</Label>
                                    <div className="relative">
                                        <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <Input
                                            id="phone"
                                            type="tel"
                                            value={user?.phone || ""}
                                            disabled
                                            className="pl-10 bg-muted"
                                        />
                                    </div>
                                </div>

                                <div className="text-xs text-gray-500 flex items-center gap-2 bg-primary/10 dark:bg-orange-900/10 p-3 rounded-md border border-orange-100 dark:border-orange-900/20 text-primary dark:text-orange-300">
                                    <span className="font-semibold">Note:</span> To update your personal information, please contact support.
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </div>

                {/* Account Actions */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Security</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Link href="/portal/profile/password">
                                <Button variant="outline" className="w-full justify-start">
                                    <Lock className="w-4 h-4 mr-2" />
                                    Change Password
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
