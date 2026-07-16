"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { CalendarIcon, Loader2, Save, ArrowLeft, ImagePlus, X, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToastStore } from "@/store/useToastStore";
import { hrApi, Department, Position } from "@/lib/api/hr";
import { branchesApi } from "@/lib/api/branches";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useQuery, useMutation } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { getUserFacingError } from "@/lib/api/errors";

const staffSchema = z.object({
    // User fields (Write-only to backend, but editable here)
    first_name: z.string().min(2, { message: "First name must be at least 2 characters" }),
    last_name: z.string().min(2, { message: "Last name must be at least 2 characters" }),
    email: z.string().email({ message: "Invalid email address" }),
    phone: z.string().optional(),
    role: z.string().optional(),
    branch: z.string().optional(),
    profile_picture: z.any().optional(),

    // Profile fields
    department: z.string().optional(),
    position: z.string().optional(),
    employment_type: z.enum(["full_time", "part_time", "contract", "intern"]),
    employment_status: z.enum(["active", "probation", "suspended", "terminated", "resigned"]),
    start_date: z.date().optional(),

    // Salary
    salary_type: z.enum(["hourly", "monthly", "annual"]),
    base_salary: z.string().min(1, { message: "Base salary is required" }),

    // Bank
    bank_name: z.string().min(2, { message: "Bank name required" }),
    bank_account_number: z.string().min(5, { message: "Account number required" }),
    bank_branch: z.string().min(2, { message: "Bank branch required" }),

    // Emergency
    emergency_contact_name: z.string().min(2, { message: "Emergency contact name required" }),
    emergency_contact_phone: z.string().min(5, { message: "Emergency contact phone required" }),
    emergency_contact_relationship: z.string().min(2, { message: "Relationship required" }),

    // ID
    national_id: z.string().min(5, { message: "National ID required" }),
    tax_id: z.string().min(5, { message: "Tax ID required" }),

    notes: z.string().optional(),
});

type StaffFormValues = z.infer<typeof staffSchema>;

export default function EditStaffPage() {
    return (
        <PermissionPageGuard permission="manage_staff">
            <EditStaffContent />
        </PermissionPageGuard>
    );
}

function EditStaffContent() {
    const params = useParams();
    const router = useRouter();
    const id = parseInt(params.id as string);
    const { addToast } = useToastStore();
    const [isSaving, setIsSaving] = useState(false);
    const [hasLoaded, setHasLoaded] = useState(false);

    // Fetch Departments
    const { data: departmentsData } = useQuery({
        queryKey: ["hr", "departments"],
        queryFn: () => hrApi.departments.list({ is_active: true }).then(res => res.data),
    });

    // Fetch Positions
    const { data: positionsData } = useQuery({
        queryKey: ["hr", "positions"],
        queryFn: () => hrApi.positions.list({ is_active: true }).then(res => res.data),
    });

    // Fetch Branches
    const { data: branchesData } = useQuery({
        queryKey: ["branches"],
        queryFn: () => branchesApi.list({ is_active: true }).then(res => {

            const data = res as any;
            return Array.isArray(data) ? data : data.results || [];
        }),
    });

    // Fetch Staff Data
    const { data: staff, isLoading: isLoadingStaff } = useQuery({
        queryKey: ["hr", "staff", id],
        queryFn: () => hrApi.staff.get(id).then(res => res.data),
        enabled: !!id,
    });

    const form = useForm<StaffFormValues>({
        resolver: zodResolver(staffSchema),
        defaultValues: {
            email: "",
            first_name: "",
            last_name: "",
            phone: "",
            role: "technician",
            branch: "",
            profile_picture: undefined,
            employment_type: "full_time",
            employment_status: "active",
            salary_type: "monthly",
            base_salary: "0",
            bank_name: "",
            bank_account_number: "",
            bank_branch: "",
            emergency_contact_name: "",
            emergency_contact_phone: "",
            emergency_contact_relationship: "",
            national_id: "",
            tax_id: "",
            notes: "",
        },
    });

    useEffect(() => {
        if (staff && !hasLoaded) {
            form.reset({
                first_name: staff.user_details?.first_name || "",
                last_name: staff.user_details?.last_name || "",
                email: staff.user_details?.email || "",
                phone: staff.user_details?.phone || "",

                role: (staff.user_details?.role as any) || "technician",
                branch: staff.user_details?.branch?.toString() || staff.branch?.toString() || "",
                department: staff.department?.toString() || "",
                position: staff.position?.toString() || "",

                employment_type: staff.employment_type as any,

                employment_status: staff.employment_status as any,
                start_date: staff.start_date ? new Date(staff.start_date) : undefined,

                salary_type: staff.salary_type as any,
                base_salary: staff.base_salary || "0",
                bank_name: staff.bank_name || "",
                bank_account_number: staff.bank_account_number || "",
                bank_branch: staff.bank_branch || "",
                emergency_contact_name: staff.emergency_contact_name || "",
                emergency_contact_phone: staff.emergency_contact_phone || "",
                emergency_contact_relationship: staff.emergency_contact_relationship || "",
                national_id: staff.national_id || "",
                tax_id: staff.tax_id || "",
                notes: staff.notes || "",
                profile_picture: staff.user_details?.profile_picture || null,
            });
            setHasLoaded(true);
        }
    }, [staff, form, hasLoaded]);

    async function onSubmit(data: StaffFormValues) {
        setIsSaving(true);
        try {
            const formData = new FormData();

            // Append all fields to FormData
            Object.keys(data).forEach((key) => {

                const value = (data as any)[key];
                if (key === "profile_picture") {
                    if (value instanceof File) {
                        formData.append(key, value);
                    }
                } else if (key === "start_date" && value) {
                    formData.append(key, format(value, "yyyy-MM-dd"));
                } else if (value !== undefined && value !== null) {
                    formData.append(key, value.toString());
                }
            });

            await hrApi.staff.update(id, formData);

            addToast({
                title: "Profile Updated",
                message: "Staff profile has been successfully updated.",
                type: "success",
            });
            router.push(`/hr/staff/${id}`);

        } catch (error: any) {

            addToast({
                type: "error",
                title: "Error",
                message: getUserFacingError(error, "Failed to update staff member."),
            });
        } finally {
            setIsSaving(false);
        }
    }

    if (isLoadingStaff) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6 w-full pb-10">
            <DynamicPageTitle title={`Edit ${staff?.full_name || "Staff"}`} />

            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold tracking-tight">Edit Staff Profile</h2>
                    <p className="text-muted-foreground">
                        Update {staff?.full_name}&apos;s employment and personal records.
                    </p>
                </div>
                <Button variant="outline" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                </Button>
            </div>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    {/* Account Details */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Account Details</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField
                                control={form.control}
                                name="first_name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>First Name</FormLabel>
                                        <FormControl>
                                            <Input placeholder="First Name" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="last_name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Last Name</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Last Name" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Email</FormLabel>
                                        <FormControl>
                                            <Input type="email" placeholder="Email" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="phone"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Phone</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Phone" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="role"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Role</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select a role" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="technician">Technician</SelectItem>
                                                <SelectItem value="receptionist">Receptionist</SelectItem>
                                                <SelectItem value="manager">Manager</SelectItem>
                                                <SelectItem value="parts_manager">Parts Manager</SelectItem>
                                                <SelectItem value="accountant">Accountant</SelectItem>
                                                <SelectItem value="service_coordinator">Service Coordinator</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="profile_picture"
                                render={({ field }) => (
                                    <FormItem className="md:col-span-2">
                                        <FormLabel>Profile Picture</FormLabel>
                                        <div className="flex items-center gap-4">
                                            <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-muted flex items-center justify-center bg-accent">
                                                {field.value ? (
                                                    typeof field.value === "string" ? (
                                                        <img src={field.value} alt="Preview" className="w-full h-full object-cover" />
                                                    ) : field.value instanceof File ? (
                                                        <img src={URL.createObjectURL(field.value)} alt="Preview" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <ImagePlus className="h-8 w-8 text-muted-foreground" />
                                                    )
                                                ) : (
                                                    <ImagePlus className="h-8 w-8 text-muted-foreground" />
                                                )}
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex gap-2">
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => {
                                                            const input = document.createElement("input");
                                                            input.type = "file";
                                                            input.accept = "image/*";
                                                            input.onchange = (e) => {
                                                                const file = (e.target as HTMLInputElement).files?.[0];
                                                                if (file) {
                                                                    field.onChange(file);
                                                                }
                                                            };
                                                            input.click();
                                                        }}
                                                    >
                                                        <Upload className="h-4 w-4 mr-2" />
                                                        Upload
                                                    </Button>
                                                    {field.value && (
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => field.onChange(null)}
                                                        >
                                                            <X className="h-4 w-4 mr-2" />
                                                            Remove
                                                        </Button>
                                                    )}
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                    JPG, PNG or GIF. Max 2MB.
                                                </p>
                                            </div>
                                        </div>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </CardContent>
                    </Card>

                    {/* Employment Details */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Employment Details</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField
                                control={form.control}
                                name="department"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Department</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select department" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {departmentsData?.results.map((dept: Department) => (
                                                    <SelectItem key={dept.id} value={dept.id.toString()}>
                                                        {dept.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="position"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Position</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select position" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {positionsData?.results.map((pos: Position) => (
                                                    <SelectItem key={pos.id} value={pos.id.toString()}>
                                                        {pos.title}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="employment_type"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Employment Type</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select type" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="full_time">Full Time</SelectItem>
                                                <SelectItem value="part_time">Part Time</SelectItem>
                                                <SelectItem value="contract">Contract</SelectItem>
                                                <SelectItem value="intern">Intern</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="employment_status"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Status</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select status" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="active">Active</SelectItem>
                                                <SelectItem value="probation">Probation</SelectItem>
                                                <SelectItem value="suspended">Suspended</SelectItem>
                                                <SelectItem value="terminated">Terminated</SelectItem>
                                                <SelectItem value="resigned">Resigned</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="start_date"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                        <FormLabel>Start Date</FormLabel>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <FormControl>
                                                    <Button
                                                        variant={"outline"}
                                                        className={cn(
                                                            "w-full pl-3 text-left font-normal",
                                                            !field.value && "text-muted-foreground"
                                                        )}
                                                    >
                                                        {field.value ? (
                                                            format(field.value, "PPP")
                                                        ) : (
                                                            <span>Pick a date</span>
                                                        )}
                                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                    </Button>
                                                </FormControl>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar
                                                    mode="single"
                                                    selected={field.value}
                                                    onSelect={field.onChange}
                                                    initialFocus
                                                    captionLayout="dropdown"
                                                    fromYear={1960}
                                                    toYear={new Date().getFullYear() + 10}
                                                />
                                            </PopoverContent>
                                        </Popover>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="branch"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Branch</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select branch" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>

                                                {branchesData?.map((branch: any) => (
                                                    <SelectItem key={branch.id} value={branch.id.toString()}>
                                                        {branch.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </CardContent>
                    </Card>

                    {/* Payroll & Banking */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Payroll & Banking</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <FormField
                                control={form.control}
                                name="salary_type"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Salary Type</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select type" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="monthly">Monthly</SelectItem>
                                                <SelectItem value="hourly">Hourly</SelectItem>
                                                <SelectItem value="annual">Annual</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="base_salary"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Base Salary / Rate</FormLabel>
                                        <FormControl>
                                            <Input type="number" step="0.01" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="bank_name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Bank Name</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Bank Name" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="bank_account_number"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Account Number</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Account Number" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="bank_branch"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Bank Branch</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Branch Name/Code" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="tax_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Tax ID / SSN</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Tax ID" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="national_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>National ID</FormLabel>
                                        <FormControl>
                                            <Input placeholder="National ID" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </CardContent>
                    </Card>

                    {/* Emergency Contact */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Emergency Contact</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <FormField
                                control={form.control}
                                name="emergency_contact_name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Contact Name</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Name" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="emergency_contact_relationship"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Relationship</FormLabel>
                                        <FormControl>
                                            <Input placeholder="e.g. Spouse, Parent" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="emergency_contact_phone"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Phone</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Phone Number" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </CardContent>
                    </Card>

                    <FormField
                        control={form.control}
                        name="notes"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Notes</FormLabel>
                                <FormControl>
                                    <Textarea placeholder="Additional notes..." {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <div className="flex justify-end pt-4">
                        <Button type="submit" disabled={isSaving} className="w-full md:w-auto">
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            <Save className="mr-2 h-4 w-4" />
                            Save Changes
                        </Button>
                    </div>
                </form>
            </Form>
        </div>
    );
}
