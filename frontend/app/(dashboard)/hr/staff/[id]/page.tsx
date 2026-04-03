"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { hrApi } from "@/lib/api/hr";
import { techniciansApi } from "@/lib/api/technicians";
import { fixedAssetsApi } from "@/lib/api/fixed-assets";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { Button } from "@/components/ui/button";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { CalendarIcon, Mail, Phone, MapPin, Building2, Briefcase, DollarSign, FileText, User, ArrowLeft, Loader2, Download, GraduationCap, ShieldCheck, ExternalLink, Package } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useToastStore } from "@/store/useToastStore";

export default function StaffDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = parseInt(params.id as string);
    const { addToast } = useToastStore();
    const [isDeleting, setIsDeleting] = useState(false);
    const queryClient = useQueryClient();

    const { data: staff, isLoading, error } = useQuery({
        queryKey: ["hr", "staff", id],
        queryFn: () => hrApi.staff.get(id).then(res => res.data),
        enabled: !!id,
    });

    const { data: technician } = useQuery({
        queryKey: ["technicians", staff?.technician_id],
        queryFn: () => techniciansApi.get(staff!.technician_id!),
        enabled: !!staff?.technician_id,
    });

    const { data: complianceDocs } = useQuery({
        queryKey: ["hr", "compliance-documents", id],
        queryFn: () => hrApi.complianceDocuments.list({ staff: id }).then(res => res.data),
        enabled: !!staff,
    });

    const { data: trainingRecords } = useQuery({
        queryKey: ["hr", "staff-training", id],
        queryFn: () => hrApi.staffTraining.list({ staff: id }).then(res => res.data),
        enabled: !!staff,
    });

    const { data: assignedAssets } = useQuery({
        queryKey: ["fixed-assets", "assigned", id],
        queryFn: () => fixedAssetsApi.list({ assigned_to: id }),
        enabled: !!staff,
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


    const handleDelete = async () => {
        if (!window.confirm("Are you sure you want to delete this staff member? This will also delete their user account and cannot be undone.")) {
            return;
        }

        setIsDeleting(true);
        try {
            await hrApi.staff.delete(id);
            queryClient.invalidateQueries({ queryKey: ["hr", "staff"] });
            addToast({
                title: "Staff Member Deleted",
                message: "The staff member and their account have been successfully removed.",
                type: "success",
            });
            router.push("/hr/staff");

        } catch (err: any) {
            addToast({
                title: "Error",
                message: err.response?.data?.detail || "Failed to delete staff member.",
                type: "error",
            });
        } finally {
            setIsDeleting(false);
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
                    <div className="flex items-center gap-2">
                        <Button variant="outline" asChild>
                            <Link href={`/hr/staff/${id}/edit`}>Edit Profile</Link>
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDelete}
                            disabled={isDeleting}
                        >
                            {isDeleting ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Trash2 className="mr-2 h-4 w-4" />
                            )}
                            Delete Staff
                        </Button>
                    </div>
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
                            {staff.technician_id && <TabsTrigger value="technical">Technical Profile</TabsTrigger>}
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
                                <CardHeader>
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <ShieldCheck className="h-4 w-4" />
                                        Compliance Documents
                                    </CardTitle>
                                    <CardDescription>Licenses, certifications, and compliance records</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {(complianceDocs?.results?.length ?? 0) > 0 ? (
                                        <div className="space-y-3">
                                            {complianceDocs!.results.map((doc) => (
                                                <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <p className="font-medium text-sm truncate">{doc.name}</p>
                                                            <Badge
                                                                variant={doc.is_expired ? "danger" : doc.is_expiring_soon ? "warning" : "success"}
                                                                className="text-[10px] px-1.5 py-0"
                                                            >
                                                                {doc.is_expired ? "Expired" : doc.is_expiring_soon ? "Expiring Soon" : "Valid"}
                                                            </Badge>
                                                        </div>
                                                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                                            <span className="capitalize">{doc.document_type.replace(/_/g, " ")}</span>
                                                            {doc.document_number && <span>#{doc.document_number}</span>}
                                                            {doc.expiry_date && (
                                                                <span>Expires: {format(new Date(doc.expiry_date), "PP")}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {doc.document_file && (
                                                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" asChild>
                                                            <a href={doc.document_file} target="_blank" rel="noopener noreferrer">
                                                                <Download className="h-3.5 w-3.5" />
                                                            </a>
                                                        </Button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-8 text-muted-foreground">
                                            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                            <p>No compliance documents uploaded for this staff member.</p>
                                            <Button variant="outline" size="sm" className="mt-3" asChild>
                                                <Link href="/hr/compliance">Go to Compliance</Link>
                                            </Button>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="training" className="mt-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <GraduationCap className="h-4 w-4" />
                                        Training Records
                                    </CardTitle>
                                    <CardDescription>Program enrollment and completion history</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {(trainingRecords?.results?.length ?? 0) > 0 ? (
                                        <div className="space-y-3">
                                            {trainingRecords!.results.map((record) => {
                                                const statusColors: Record<string, string> = {
                                                    completed: "bg-success/10 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800",
                                                    in_progress: "bg-info/10 text-blue-700 border-info/20 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800",
                                                    enrolled: "bg-warning/10 text-amber-700 border-warning/20 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800",
                                                    failed: "bg-destructive/10 text-destructive border-destructive/20 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800",
                                                    withdrawn: "bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700",
                                                };
                                                return (
                                                    <div key={record.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-medium text-sm truncate">{record.training_name}</p>
                                                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                                                <span>Enrolled: {format(new Date(record.enrolled_date), "PP")}</span>
                                                                {record.completion_date && (
                                                                    <span>Completed: {format(new Date(record.completion_date), "PP")}</span>
                                                                )}
                                                                {record.score !== null && (
                                                                    <span className="font-medium">Score: {record.score}%</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <Badge
                                                            variant="outline"
                                                            className={`text-[10px] px-2 py-0.5 border shadow-none capitalize ${statusColors[record.status] || ""}`}
                                                        >
                                                            {record.status.replace(/_/g, " ")}
                                                        </Badge>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="text-center py-8 text-muted-foreground">
                                            <GraduationCap className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                            <p>No training records found for this staff member.</p>
                                            <Button variant="outline" size="sm" className="mt-3" asChild>
                                                <Link href="/hr/training">Go to Training</Link>
                                            </Button>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="assets" className="mt-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-lg font-semibold">Assigned Assets</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {(assignedAssets?.results ?? assignedAssets ?? []).length > 0 ? (
                                        <div className="space-y-3">

                                            {(assignedAssets?.results ?? assignedAssets ?? []).map((asset: any) => (
                                                <div key={asset.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                                                            <Package className="h-4 w-4 text-primary" />
                                                        </div>
                                                        <div>
                                                            <p className="font-medium text-sm">{asset.name}</p>
                                                            <p className="text-xs text-muted-foreground">{asset.asset_number} · {asset.category_name}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="text-right">
                                                            <p className="text-xs text-muted-foreground">Net Book Value</p>
                                                            <p className="text-sm font-medium">GH₵ {Number(asset.net_book_value).toLocaleString()}</p>
                                                        </div>
                                                        <Badge variant={asset.status === 'active' ? 'success' : 'secondary'} className="capitalize text-[10px]">
                                                            {asset.status}
                                                        </Badge>
                                                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" asChild>
                                                            <Link href={`/fixed-assets/${asset.id}`}><ExternalLink className="h-3.5 w-3.5" /></Link>
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-8 text-muted-foreground">
                                            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                            <p className="text-sm">No assets assigned to this staff member.</p>
                                            <p className="text-xs mt-1">Assign assets from the <Link href="/fixed-assets" className="text-primary hover:underline">Fixed Assets</Link> module.</p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {staff.technician_id && (
                            <TabsContent value="technical" className="space-y-6 mt-6">
                                <Card>
                                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                                        <CardTitle className="text-lg font-semibold">Operational Status</CardTitle>
                                        <Badge variant="outline" className="capitalize px-3 py-1">
                                            {technician?.current_status || "Unknown"}
                                        </Badge>
                                    </CardHeader>
                                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                                        <div className="space-y-4">
                                            <div>
                                                <h4 className="text-sm font-medium text-muted-foreground mb-1">Skills</h4>
                                                <div className="flex flex-wrap gap-1.5 mt-2">

                                                    {technician?.skills.map((skill: any) => (
                                                        <Badge key={skill.id} variant="secondary" className="bg-info/10 text-blue-700 border-blue-100 font-medium">
                                                            {skill.name}
                                                        </Badge>
                                                    )) || <span className="text-muted-foreground italic text-sm">No skills listed</span>}
                                                </div>
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-medium text-muted-foreground mb-1">Experience</h4>
                                                <p className="text-lg font-bold text-foreground">{technician?.years_of_experience || 0} Years</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col justify-center items-center p-6 border-2 border-dashed rounded-xl bg-warning/10/50 dark:bg-orange-950/20">
                                            <Briefcase className="h-10 w-10 text-warning mb-3 opacity-70" />
                                            <h3 className="text-sm font-semibold mb-1 text-center">Operational Dashboard</h3>
                                            <p className="text-xs text-muted-foreground text-center mb-4 max-w-[180px]">View shifts, performance metrics, and job history.</p>
                                            <Button size="sm" asChild className="w-full">
                                                <Link href={`/technicians/${technician?.id}`}>
                                                    Go to Technician View
                                                </Link>
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        )}
                    </Tabs>
                </div>
            </div>
        </div>
    );
}
