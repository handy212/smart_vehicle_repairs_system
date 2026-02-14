"use client";

import { useQuery } from "@tanstack/react-query";
import { hrApi } from "@/lib/api/hr";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { Button } from "@/components/ui/button";
import { CalendarIcon, Mail, Phone, MapPin, Building2, Briefcase, DollarSign, FileText, User, ArrowLeft, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function StaffDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = parseInt(params.id as string);

    const { data: staff, isLoading, error } = useQuery({
        queryKey: ["hr", "staff", id],
        queryFn: () => hrApi.staff.get(id).then(res => res.data),
        enabled: !!id,
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (error || !staff) {
        return (
            <div className="flex flex-col items-center justify-center h-96 space-y-4">
                <h2 className="text-xl font-semibold">Staff Member Not Found</h2>
                <p className="text-muted-foreground">The staff member you are looking for does not exist or has been removed.</p>
                <Button variant="outline" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Go Back
                </Button>
            </div>
        );
    }

    const initials = staff.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .substring(0, 2);

    const getStatusVariant = (status: string) => {
        switch (status) {
            case "active": return "default"; // success is not a standard variant
            case "probation": return "secondary"; // warning is not a standard variant
            case "suspended": return "destructive";
            case "terminated": return "destructive";
            case "resigned": return "outline";
            default: return "secondary";
        }
    };

    return (
        <div className="space-y-6 pb-10">
            <DynamicPageTitle title={staff.full_name} />

            <StaffPageHeader
                title="Staff Profile"
                breadcrumbs={[
                    { label: "Dashboard", href: "/dashboard" },
                    { label: "HR", href: "/hr" },
                    { label: "Staff", href: "/hr/staff" },
                    { label: staff.full_name },
                ]}
                actions={
                    <Button variant="outline" asChild>
                        <Link href={`/hr/staff/${id}/edit`}>Edit Profile</Link>
                    </Button>
                }
            />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Sidebar / Overview */}
                <div className="lg:col-span-4 space-y-6">
                    <Card>
                        <CardContent className="pt-6 text-center">
                            <Avatar className="h-24 w-24 mx-auto mb-4">
                                <AvatarImage src={staff.user_details?.profile_picture} />
                                <AvatarFallback className="text-xl">{initials}</AvatarFallback>
                            </Avatar>
                            <h2 className="text-2xl font-bold">{staff.full_name}</h2>
                            <p className="text-muted-foreground mb-2">{staff.position_title || "No Position"}</p>
                            <Badge variant={getStatusVariant(staff.employment_status) as any}>
                                {staff.employment_status}
                            </Badge>

                            <div className="mt-6 flex flex-col space-y-3 text-sm text-left">
                                <div className="flex items-center text-muted-foreground">
                                    <Mail className="h-4 w-4 mr-3" />
                                    <span>{staff.user_details?.email}</span>
                                </div>
                                <div className="flex items-center text-muted-foreground">
                                    <Phone className="h-4 w-4 mr-3" />
                                    <span>{staff.user_details?.phone || "No phone"}</span>
                                </div>
                                <div className="flex items-center text-muted-foreground">
                                    <Building2 className="h-4 w-4 mr-3" />
                                    <span>{staff.department_name || "No Department"}</span>
                                </div>
                                <div className="flex items-center text-muted-foreground">
                                    <MapPin className="h-4 w-4 mr-3" />
                                    <span>{staff.branch_name || "No Branch"}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Employment Info</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Employee ID</span>
                                <span className="font-medium">{staff.user_details?.employee_id || "—"}</span>
                            </div>
                            <Separator />
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Type</span>
                                <span className="capitalize">{staff.employment_type.replace("_", " ")}</span>
                            </div>
                            <Separator />
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Start Date</span>
                                <span>{staff.start_date ? format(new Date(staff.start_date), "PP") : "—"}</span>
                            </div>
                            <Separator />
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Manager</span>
                                <span>{staff.reporting_to_name || "—"}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Main Content Tabs */}
                <div className="lg:col-span-8">
                    <Tabs defaultValue="details" className="w-full">
                        <TabsList className="w-full justify-start overflow-x-auto">
                            <TabsTrigger value="details">Details</TabsTrigger>
                            <TabsTrigger value="documents">Documents</TabsTrigger>
                            <TabsTrigger value="training">Training</TabsTrigger>
                            <TabsTrigger value="assets">Assets</TabsTrigger>
                        </TabsList>

                        <TabsContent value="details" className="space-y-6 mt-6">
                            {/* Personal Information */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Personal Information</CardTitle>
                                </CardHeader>
                                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8">
                                    <div>
                                        <h4 className="text-sm font-medium text-muted-foreground mb-1">National ID</h4>
                                        <p>{staff.national_id || "—"}</p>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Tax ID</h4>
                                        <p>{staff.tax_id || "—"}</p>
                                    </div>
                                    <div className="col-span-1 md:col-span-2">
                                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Address</h4>
                                        <div className="space-y-1">
                                            <p>{staff.user_details?.address || "No address provided"}</p>
                                            {(staff.user_details?.city || staff.user_details?.state || staff.user_details?.zip_code) && (
                                                <p>
                                                    {[
                                                        staff.user_details?.city,
                                                        staff.user_details?.state,
                                                        staff.user_details?.zip_code
                                                    ].filter(Boolean).join(", ")}
                                                </p>
                                            )}
                                            {staff.user_details?.country && (
                                                <p>{staff.user_details.country}</p>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Banking & Salary */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Banking & Compensation</CardTitle>
                                </CardHeader>
                                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8">
                                    <div>
                                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Bank Name</h4>
                                        <p>{staff.bank_name}</p>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Branch</h4>
                                        <p>{staff.bank_branch}</p>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Account Number</h4>
                                        <p className="font-mono text-sm">{staff.bank_account_number}</p>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Base Salary</h4>
                                        <p>{staff.base_salary} <span className="text-muted-foreground text-xs uppercase">({staff.salary_type})</span></p>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Emergency Contact */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Emergency Contact</CardTitle>
                                </CardHeader>
                                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8">
                                    <div>
                                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Name</h4>
                                        <p>{staff.emergency_contact_name}</p>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Relationship</h4>
                                        <p>{staff.emergency_contact_relationship}</p>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Phone</h4>
                                        <p>{staff.emergency_contact_phone}</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="documents" className="mt-6">
                            <Card>
                                <CardContent className="pt-6 text-center text-muted-foreground">
                                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                    <p>No documents uploaded for this staff member.</p>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="training" className="mt-6">
                            <Card>
                                <CardContent className="pt-6 text-center text-muted-foreground">
                                    <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                    <p>No training records found.</p>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="assets" className="mt-6">
                            <Card>
                                <CardContent className="pt-6 text-center text-muted-foreground">
                                    <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                    <p>No assets assigned.</p>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        </div>
    );
}
